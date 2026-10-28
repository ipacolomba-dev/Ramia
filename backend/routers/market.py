import re
import uuid
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from models import (
    BaseDocument, OrderIn, PackageIn, ProductDoc, ProductIn, now_utc,
)
from core.permissions import require_perm
from core.rules import snapshot_for
from routers.governance import visibility_plans
from security import current_user, require_roles

router = APIRouter(tags=["market"])

def _featured_until(user: dict):
    fu = user.get("featured_until")
    if isinstance(fu, datetime):
        return fu if fu.tzinfo else fu.replace(tzinfo=timezone.utc)
    return None


async def _serialize_product(doc: dict) -> dict:
    p = ProductDoc.from_mongo(doc)
    if not p:
        return {}
    return p.to_public()


@router.get("/products")
async def list_products(
    category: str | None = None,
    q: str | None = None,
    mine: bool = False,
    user: dict = Depends(current_user),
):
    query: dict = {"deleted_at": None}
    if mine:
        if user["role"] != "producer":
            raise HTTPException(status_code=403, detail="Solo produttori")
        query["producer_id"] = str(user["_id"])
    else:
        query["status"] = "approved"
    if category:
        query["category"] = category
    if q:
        rx = re.escape(q)
        query["$or"] = [
            {"name": {"$regex": rx, "$options": "i"}},
            {"description": {"$regex": rx, "$options": "i"}},
            {"producer_name": {"$regex": rx, "$options": "i"}},
        ]
    docs = await db.products.find(query).sort("created_at", -1).to_list(500)
    items = [await _serialize_product(d) for d in docs]
    items.sort(key=lambda x: 0 if x.get("featured") else 1)
    return items


@router.get("/products/mine")
async def my_products(user: dict = Depends(require_roles("producer"))):
    docs = await db.products.find({"producer_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(500)
    return [await _serialize_product(d) for d in docs]


@router.get("/products/{product_id}")
async def get_product(product_id: str, user: dict = Depends(current_user)):
    doc = await db.products.find_one({"_id": product_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    item = await _serialize_product(doc)
    if item.get("status") != "approved" and user["role"] not in ("admin",) and str(user["_id"]) != doc.get("producer_id"):
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    return item


@router.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(require_roles("producer"))):
    fu = _featured_until(user)
    product = ProductDoc(
        **body.model_dump(),
        id=str(uuid.uuid4()),
        producer_id=str(user["_id"]),
        producer_name=user.get("name", ""),
        company_name=user.get("company_name") or user.get("name", ""),
        status="pending",
        featured_until=fu,
        created_at=now_utc(),
        deleted_at=None,
    )
    await db.products.insert_one(product.to_mongo(include_id=True))
    result = await _serialize_product(product.to_mongo(include_id=True))
    from routers.imports import notify_admin_products
    await notify_admin_products(user, [result], source="manuale")
    return result


@router.patch("/products/{product_id}")
async def update_product(product_id: str, body: ProductIn, user: dict = Depends(require_roles("producer"))):
    doc = await db.products.find_one({"_id": product_id, "producer_id": str(user["_id"]), "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    await db.products.update_one(
        {"_id": product_id},
        {"$set": {**body.model_dump(exclude_none=True), "status": "pending"}},
    )
    doc = await db.products.find_one({"_id": product_id})
    return await _serialize_product(doc)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_roles("producer"))):
    res = await db.products.update_one(
        {"_id": product_id, "producer_id": str(user["_id"])},
        {"$set": {"deleted_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    return {"ok": True}


# ---------------- Curated packages ----------------

@router.get("/packages")
async def list_packages(user: dict = Depends(current_user)):
    docs = await db.packages.find({"active": True}).sort("created_at", -1).to_list(50)
    out = []
    for d in docs:
        items = []
        for pid in d.get("product_ids", []):
            prod = await db.products.find_one({"_id": pid, "deleted_at": None}, {"name": 1, "price": 1, "image_url": 1, "unit": 1})
            if prod:
                items.append({"id": str(prod["_id"]), "name": prod["name"], "price": prod["price"], "unit": prod.get("unit", "")})
        out.append({
            "id": str(d["_id"]), "name": d["name"], "name_en": d.get("name_en"),
            "description": d["description"], "description_en": d.get("description_en"),
            "price": d["price"], "image_url": d.get("image_url"), "items": items,
        })
    return out


@router.post("/packages")
async def create_package(body: PackageIn, user: dict = Depends(require_roles("admin"))):
    doc = {
        "_id": str(uuid.uuid4()),
        **body.model_dump(),
        "active": True,
        "created_at": now_utc(),
    }
    await db.packages.insert_one(doc)
    return {"id": doc["_id"]}


# ---------------- Orders ----------------

@router.post("/orders")
async def create_order(body: OrderIn, user: dict = Depends(require_perm("market:buy"))):
    items, total = [], 0.0

    if body.package_id:
        pkg = await db.packages.find_one({"_id": body.package_id, "active": True})
        if not pkg:
            raise HTTPException(status_code=404, detail="Pacchetto non trovato")
        for pid in pkg.get("product_ids", []):
            prod = await db.products.find_one({"_id": pid, "status": "approved", "deleted_at": None})
            if not prod:
                continue
            if prod.get("stock", 0) < 1:
                raise HTTPException(status_code=422, detail=f"Scorta insufficiente: {prod['name']}")
            items.append({
                "product_id": pid, "name": prod["name"], "price": prod["price"],
                "unit": prod.get("unit", ""), "qty": 1, "producer_id": prod.get("producer_id", ""),
            })
        if not items:
            raise HTTPException(status_code=422, detail="Pacchetto non disponibile")
        for it in items:
            await db.products.update_one({"_id": it["product_id"]}, {"$inc": {"stock": -1}})
        total = float(pkg["price"])
        pkg_id = body.package_id
    else:
        if not body.items:
            raise HTTPException(status_code=422, detail="Carrello vuoto")
        for it in body.items:
            prod = await db.products.find_one({"_id": it.product_id, "status": "approved", "deleted_at": None})
            if not prod:
                raise HTTPException(status_code=404, detail=f"Prodotto {it.product_id} non disponibile")
            if prod.get("stock", 0) < it.qty:
                raise HTTPException(status_code=422, detail=f"Scorta insufficiente: {prod['name']}")
            if (prod.get("unit") or "").lower() not in ("kg", "g", "l", "lt", "litro", "litri", "hl") and not float(it.qty).is_integer():
                raise HTTPException(status_code=422, detail=f"Quantità intera richiesta per {prod['name']}")
            items.append({
                "product_id": it.product_id, "name": prod["name"], "price": prod["price"],
                "unit": prod.get("unit", ""), "qty": it.qty, "producer_id": prod.get("producer_id", ""),
            })
            total += prod["price"] * it.qty
        for it in items:
            await db.products.update_one({"_id": it["product_id"]}, {"$inc": {"stock": -it["qty"]}})
        pkg_id = None

    # Golden rule: freeze the commercial rules applied to this order (never updated afterwards).
    snapshot = await snapshot_for("mediated_sale", total)
    order = {
        "_id": str(uuid.uuid4()),
        "user_id": str(user["_id"]),
        "user_name": user.get("name", ""),
        "items": items,
        "package_id": pkg_id,
        "goods_total": round(total, 2),
        "buyer_fee": snapshot["buyer_fee"],
        "total": round(total + snapshot["buyer_fee"], 2),
        "commercial_snapshot": snapshot,
        "status": "awaiting_payment",  # becomes "paid" (funds held in escrow) only after the Stripe confirmation
        "payment": "stripe",
        "address": body.address,
        "city": body.city,
        "zip": body.zip,
        "phone": body.phone,
        "notes": body.notes,
        "created_at": now_utc(),
    }
    await db.orders.insert_one(order)
    order["id"] = order.pop("_id")
    return order


@router.get("/orders/mine")
async def my_orders(user: dict = Depends(current_user)):
    docs = await db.orders.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["id"] = d.pop("_id")
    return docs


# ---------------- Visibility ----------------

@router.get("/visibility/plans")
async def plans(user: dict = Depends(current_user)):
    return await visibility_plans()


async def activate_visibility(producer_id: str, plan_id: str, session_id: str):
    """Called once by the payments module after Stripe confirms the visibility payment."""
    plan = next((p for p in await visibility_plans() if p["id"] == plan_id), None)
    user = await db.users.find_one({"_id": producer_id})
    if not plan or not user:
        return
    current = _featured_until(user)
    base = current if current and current > now_utc() else now_utc()
    featured_until = base + timedelta(days=plan["days"])
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"featured_until": featured_until}})
    await db.products.update_many(
        {"producer_id": producer_id, "deleted_at": None},
        {"$set": {"featured_until": featured_until}},
    )
    await db.purchases.insert_one({
        "_id": str(uuid.uuid4()), "user_id": producer_id, "plan_id": plan["id"], "plan_name": plan["name"],
        "price": plan["price"], "payment": "stripe", "session_id": session_id, "status": "paid",
        "featured_until": featured_until, "created_at": now_utc(),
    })


@router.get("/visibility/purchases/mine")
async def my_purchases(user: dict = Depends(require_roles("producer"))):
    docs = await db.purchases.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(50)
    for d in docs:
        d["id"] = d.pop("_id")
    return docs
