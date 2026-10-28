"""Platform features for the role areas: lots, received orders, producer earnings,
buyer requests (RFQ), buyer plans, logistics quotes & tracking, compliance documents,
admin users/moderation and product categories."""
import re
import uuid
from datetime import datetime, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from db import db
from models import now_utc
from core.audit import audit
from core.matches import register_match
from core.permissions import require_perm
from core.rules import get_active_rules, snapshot_for
from security import bearer, current_user, require_approved_roles, require_roles, user_from_token
from storage import APP_NAME, get_object, put_object

router = APIRouter(tags=["platform"])



def _clean(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


def _name(user: dict) -> str:
    return user.get("company_name") or user.get("name", "")


# ----------------------------- Lots (producer) -----------------------------

class LotIn(BaseModel):
    product_id: Optional[str] = None
    product_name: str = Field(min_length=1, max_length=200)
    lot_code: str = Field(min_length=1, max_length=80)
    production_date: Optional[str] = Field(None, max_length=20)
    expiry_date: Optional[str] = Field(None, max_length=20)
    quantity: float = Field(ge=0)
    unit: str = Field("kg", max_length=20)
    notes: Optional[str] = Field(None, max_length=1000)


@router.get("/lots")
async def list_lots(product_id: Optional[str] = None, user: dict = Depends(require_roles("producer"))):
    q = {"producer_id": str(user["_id"]), "deleted_at": None}
    if product_id:
        q["product_id"] = product_id
    docs = await db.lots.find(q).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.post("/lots")
async def create_lot(body: LotIn, user: dict = Depends(require_roles("producer"))):
    uid = str(user["_id"])
    if await db.lots.find_one({"producer_id": uid, "lot_code": body.lot_code, "deleted_at": None}):
        raise HTTPException(status_code=409, detail="Codice lotto già usato")
    doc = {"_id": str(uuid.uuid4()), **body.model_dump(), "producer_id": uid, "deleted_at": None, "created_at": now_utc()}
    await db.lots.insert_one(doc)
    return _clean(doc)


@router.patch("/lots/{lot_id}")
async def update_lot(lot_id: str, body: LotIn, user: dict = Depends(require_roles("producer"))):
    res = await db.lots.update_one(
        {"_id": lot_id, "producer_id": str(user["_id"]), "deleted_at": None}, {"$set": body.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lotto non trovato")
    return _clean(await db.lots.find_one({"_id": lot_id}))


@router.delete("/lots/{lot_id}")
async def delete_lot(lot_id: str, user: dict = Depends(require_roles("producer"))):
    res = await db.lots.update_one(
        {"_id": lot_id, "producer_id": str(user["_id"])}, {"$set": {"deleted_at": now_utc()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lotto non trovato")
    return {"ok": True}


# ----------------------------- Producer orders & earnings -----------------------------

PAID_ORDER = {"status": {"$nin": ["awaiting_payment", "cancelled", "refunded"]}}


@router.get("/orders/received")
async def received_orders(user: dict = Depends(require_roles("producer"))):
    uid = str(user["_id"])
    docs = await db.orders.find({"items.producer_id": uid, **PAID_ORDER}).sort("created_at", -1).to_list(300)
    out = []
    for d in docs:
        mine = [it for it in d.get("items", []) if it.get("producer_id") == uid]
        out.append({
            "id": d["_id"], "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
            "customer_name": d.get("user_name", ""), "city": d.get("city"), "status": d.get("status", "paid"),
            "escrow_status": (d.get("escrow") or {}).get("status"),
            "items": mine, "subtotal": round(sum(i["price"] * i["qty"] for i in mine), 2),
        })
    return out


@router.get("/producer/earnings")
async def producer_earnings(user: dict = Depends(require_roles("producer"))):
    uid = str(user["_id"])
    monthly: dict = {}
    orders_total = 0.0
    async for o in db.orders.find({"items.producer_id": uid, **PAID_ORDER}):
        amount = sum(i["price"] * i["qty"] for i in o.get("items", []) if i.get("producer_id") == uid)
        orders_total += amount
        created = o.get("created_at")
        key = created.strftime("%Y-%m") if isinstance(created, datetime) else "—"
        monthly[key] = monthly.get(key, 0.0) + amount
    b2b_total = 0.0
    async for a in db.agreements.find({"status": "accepted", "producer_id": uid}):
        b2b_total += float(a.get("price") or 0) * float(a.get("qty") or 0)
    gross = orders_total + b2b_total
    # producer fee read from each order/agreement snapshot; legacy records use active DB rules
    rules = await get_active_rules()
    rate = rules["services"]["mediated_sale"]["producer_pct"] / 100
    commission = 0.0
    async for o in db.orders.find({"items.producer_id": uid, **PAID_ORDER}):
        mine = sum(i["price"] * i["qty"] for i in o.get("items", []) if i.get("producer_id") == uid)
        snap = o.get("commercial_snapshot")
        base = float((snap or {}).get("base_amount") or 0) or mine
        commission += float(snap["producer_fee"]) * (mine / base) if snap and base else mine * rate
    async for a in db.agreements.find({"status": "accepted", "producer_id": uid}):
        snap = a.get("commercial_snapshot")
        commission += float(snap["producer_fee"]) if snap else float(a.get("price") or 0) * float(a.get("qty") or 0) * rate
    commission = round(commission, 2)
    return {
        "orders_total": round(orders_total, 2), "b2b_total": round(b2b_total, 2), "gross": round(gross, 2),
        "commission": commission, "net": round(gross - commission, 2), "rate": rate,
        "monthly": [{"month": k, "amount": round(v, 2)} for k, v in sorted(monthly.items(), reverse=True)],
        "payment_note": "Pagamenti con carta: i fondi restano in garanzia fino alla consegna",
    }


# ----------------------------- Buyer requests (RFQ) -----------------------------

class RfqIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    category: Optional[str] = Field(None, max_length=60)
    quantity: str = Field(min_length=1, max_length=120)
    target_price: Optional[str] = Field(None, max_length=120)
    destination: Optional[str] = Field(None, max_length=200)
    deadline: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=2000)


class RfqResponseIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    price: Optional[str] = Field(None, max_length=120)


@router.get("/rfq")
async def list_rfq(user: dict = Depends(current_user)):
    if user["role"] in ("business", "reseller"):
        q = {"buyer_id": str(user["_id"])}
    elif user["role"] in ("producer", "admin"):
        q = {} if user["role"] == "admin" else {"status": "open"}
    else:
        raise HTTPException(status_code=403, detail="Ruolo non autorizzato")
    docs = await db.rfqs.find(q).sort("created_at", -1).to_list(300)
    uid = str(user["_id"])
    out = []
    for d in docs:
        c = _clean(d)
        if user["role"] == "producer":
            c["responses"] = [r for r in d.get("responses", []) if r["producer_id"] == uid]
        c["responses_count"] = len(d.get("responses", []))
        out.append(c)
    return out


@router.post("/rfq")
async def create_rfq(body: RfqIn, user: dict = Depends(require_perm("rfq:create", approved=True))):
    doc = {"_id": str(uuid.uuid4()), **body.model_dump(), "buyer_id": str(user["_id"]), "buyer_name": _name(user),
           "status": "open", "responses": [], "created_at": now_utc()}
    await db.rfqs.insert_one(doc)
    return _clean(doc)


async def _rfq_for(rfq_id: str, user: dict) -> dict:
    d = await db.rfqs.find_one({"_id": rfq_id})
    if not d:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    uid = str(user["_id"])
    if user["role"] in ("business", "reseller") and d["buyer_id"] != uid:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if user["role"] not in ("business", "reseller", "producer", "admin"):
        raise HTTPException(status_code=403, detail="Ruolo non autorizzato")
    return d


@router.get("/rfq/{rfq_id}")
async def get_rfq(rfq_id: str, user: dict = Depends(current_user)):
    d = await _rfq_for(rfq_id, user)
    c = _clean(d)
    if user["role"] == "producer":
        c["responses"] = [r for r in d.get("responses", []) if r["producer_id"] == str(user["_id"])]
    return c


@router.post("/rfq/{rfq_id}/responses")
async def respond_rfq(rfq_id: str, body: RfqResponseIn, user: dict = Depends(require_approved_roles("producer"))):
    d = await _rfq_for(rfq_id, user)
    if d["status"] != "open":
        raise HTTPException(status_code=422, detail="Richiesta chiusa")
    resp = {"id": str(uuid.uuid4()), "producer_id": str(user["_id"]), "producer_name": _name(user),
            **body.model_dump(), "created_at": now_utc().isoformat()}
    await db.rfqs.update_one({"_id": rfq_id}, {"$push": {"responses": resp}})
    await register_match(str(user["_id"]), d["buyer_id"], "rfq_response", rfq_id)
    return await get_rfq(rfq_id, user)


@router.patch("/rfq/{rfq_id}/close")
async def close_rfq(rfq_id: str, user: dict = Depends(require_perm("rfq:create"))):
    res = await db.rfqs.update_one({"_id": rfq_id, "buyer_id": str(user["_id"])}, {"$set": {"status": "closed"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    return {"ok": True}


# ----------------------------- Logistics quotes & tracking -----------------------------

@router.get("/logistics/quotes/mine")
async def my_quotes(user: dict = Depends(require_roles("logistics"))):
    uid = str(user["_id"])
    out = []
    async for s in db.shipping_requests.find({"quotes.company_id": uid}).sort("created_at", -1):
        for q in s.get("quotes", []):
            if q.get("company_id") == uid:
                out.append({**q, "request_id": s["_id"], "request_title": s.get("title", ""),
                            "origin": s.get("origin"), "destination": s.get("destination"),
                            "status": s.get("status", "open"),
                            "selected": s.get("carrier_id") == uid})
    return out


class SelectQuoteIn(BaseModel):
    quote_id: str


@router.post("/logistics/requests/{req_id}/select-quote")
async def select_quote(req_id: str, body: SelectQuoteIn, user: dict = Depends(current_user)):
    d = await db.shipping_requests.find_one({"_id": req_id})
    if not d or (d.get("creator_id") != str(user["_id"]) and user["role"] != "admin"):
        raise HTTPException(status_code=404, detail="Spedizione non trovata")
    if d.get("carrier_id"):
        raise HTTPException(status_code=422, detail="Trasportatore già scelto")
    quote = next((q for q in d.get("quotes", []) if q.get("id") == body.quote_id), None)
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ev = {"id": str(uuid.uuid4()), "status": "assigned", "location": None, "note": quote.get("company_name"),
          "by": _name(user), "at": now_utc().isoformat()}
    snapshot = await snapshot_for("transport", float(quote.get("price") or 0))
    if user["role"] != "producer":  # the transport mediation fee is charged only to the producer who books
        snapshot = {**snapshot, "producer_fee": 0.0, "platform_revenue": snapshot["buyer_fee"], "note": "Prenotazione non da produttore"}
    res = await db.shipping_requests.update_one({"_id": req_id, "carrier_id": None}, {"$set": {
        "commercial_snapshot": snapshot, "booked_by_role": user["role"],
        "carrier_id": quote["company_id"], "selected_quote_id": quote["id"], "status": "assigned",
        "tracking_status": "assigned"}, "$push": {"tracking": ev}})
    if res.modified_count == 0:
        raise HTTPException(status_code=422, detail="Trasportatore già scelto")
    return {"ok": True, "carrier_id": quote["company_id"]}


class TrackingIn(BaseModel):
    status: Literal["assigned", "picked_up", "in_transit", "delivered", "issue"]
    location: Optional[str] = Field(None, max_length=200)
    note: Optional[str] = Field(None, max_length=500)
    pod_recipient: Optional[str] = Field(None, max_length=120)  # proof of delivery: who signed
    pod_photo_url: Optional[str] = Field(None, max_length=500)


@router.get("/logistics/tracking")
async def tracking_list(user: dict = Depends(current_user)):
    uid = str(user["_id"])
    if user["role"] == "logistics":
        q = {"quotes.company_id": uid}
    elif user["role"] == "admin":
        q = {}
    else:
        q = {"participants.user_id": uid}
    docs = await db.shipping_requests.find(q).sort("created_at", -1).to_list(200)
    return [{"id": d["_id"], "title": d.get("title", ""), "origin": d.get("origin"), "destination": d.get("destination"),
             "status": d.get("tracking_status") or "pending", "events": d.get("tracking", []),
             "is_carrier": d.get("carrier_id") == uid} for d in docs]


@router.post("/logistics/requests/{req_id}/tracking")
async def add_tracking(req_id: str, body: TrackingIn, user: dict = Depends(require_approved_roles("logistics"))):
    uid = str(user["_id"])
    d = await db.shipping_requests.find_one({"_id": req_id, "carrier_id": uid})
    if not d:
        raise HTTPException(status_code=403, detail="Solo il trasportatore scelto dal cliente può aggiornare il tracciamento")
    if d.get("tracking_status") == "delivered":
        raise HTTPException(status_code=422, detail="Spedizione già consegnata")
    if body.status == "delivered" and not (body.pod_recipient or "").strip():
        raise HTTPException(status_code=422, detail="Per la consegna serve la prova: nome di chi ha ricevuto la merce")
    ev = {"id": str(uuid.uuid4()), **body.model_dump(), "by": _name(user), "at": now_utc().isoformat()}
    upd = {"tracking_status": body.status}
    if body.status == "delivered":
        upd["pod"] = {"recipient": body.pod_recipient.strip(), "photo_url": body.pod_photo_url, "note": body.note,
                      "at": ev["at"], "by": _name(user)}
    await db.shipping_requests.update_one({"_id": req_id}, {"$push": {"tracking": ev}, "$set": upd})
    if body.status == "delivered":
        from routers.payments import release_shipment
        await release_shipment(req_id, "proof_of_delivery")
    return ev


# ----------------------------- Compliance documents (private) -----------------------------

DOC_TYPES = ("certificate", "lab_analysis", "tech_sheet", "haccp", "label", "other")
DOC_EXT = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@router.get("/compliance/documents")
async def list_documents(user: dict = Depends(require_roles("producer", "collaborator", "admin"))):
    docs = await db.compliance_documents.find({"owner_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(300)
    return [{k: v for k, v in _clean(d).items() if k != "path"} for d in docs]


@router.post("/compliance/documents")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=200),
    doc_type: str = Form("other"),
    expiry_date: Optional[str] = Form(None),
    user: dict = Depends(require_roles("producer", "collaborator", "admin")),
):
    if doc_type not in DOC_TYPES:
        doc_type = "other"
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File troppo grande (max 10MB)")
    parts = (file.filename or "doc.pdf").rsplit(".", 1)
    ext = parts[-1].lower() if len(parts) == 2 else "pdf"
    if ext not in DOC_EXT:
        raise HTTPException(status_code=422, detail="Formato non ammesso (PDF, JPG, PNG, WEBP)")
    path = f"{APP_NAME}/private/{user['_id']}/{uuid.uuid4()}.{ext}"
    try:
        await put_object(path, data, DOC_EXT[ext])
    except Exception:
        raise HTTPException(status_code=502, detail="Caricamento non riuscito, riprova")
    doc = {"_id": str(uuid.uuid4()), "owner_id": str(user["_id"]), "title": title, "doc_type": doc_type,
           "expiry_date": expiry_date or None, "filename": file.filename, "size": len(data), "ext": ext,
           "path": path, "deleted_at": None, "created_at": now_utc()}
    await db.compliance_documents.insert_one(doc)
    return {k: v for k, v in _clean(doc).items() if k != "path"}


@router.get("/compliance/documents/{doc_id}/file")
async def download_document(doc_id: str, token: Optional[str] = Query(None), credentials=Depends(bearer)):
    user = await user_from_token(token or (credentials.credentials if credentials else None))
    d = await db.compliance_documents.find_one({"_id": doc_id, "deleted_at": None})
    if not d or (d["owner_id"] != str(user["_id"]) and user["role"] != "admin"):
        raise HTTPException(status_code=404, detail="Documento non trovato")
    data, ctype = await get_object(d["path"])
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "private, no-store"})


@router.delete("/compliance/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(current_user)):
    res = await db.compliance_documents.update_one(
        {"_id": doc_id, "owner_id": str(user["_id"])}, {"$set": {"deleted_at": now_utc()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    return {"ok": True}


# ----------------------------- Admin: users & moderation -----------------------------

@router.get("/admin/users")
async def admin_users(role: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(require_roles("admin"))):
    query: dict = {}
    if role:
        query["role"] = role
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"email": rx}, {"name": rx}, {"company_name": rx}]
    docs = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).to_list(500)
    return [{"id": str(d["_id"]), "email": d.get("email"), "name": d.get("name"), "role": d.get("role"),
             "company_name": d.get("company_name"), "region": d.get("region"),
             "approved": d.get("approved", True), "suspended": bool(d.get("suspended")),
             "email_verified": d.get("email_verified", True)} for d in docs]


class SuspendIn(BaseModel):
    suspended: bool


@router.patch("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, body: SuspendIn, user: dict = Depends(require_roles("admin"))):
    if user_id == str(user["_id"]):
        raise HTTPException(status_code=422, detail="Non puoi sospendere te stesso")
    before = await db.users.find_one({"_id": user_id}, {"suspended": 1, "email": 1})
    if not before:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    await db.users.update_one({"_id": user_id}, {"$set": {"suspended": body.suspended}})
    await audit(user, "suspend" if body.suspended else "reactivate", "user", user_id, before=before, after={"suspended": body.suspended})
    return {"ok": True}


@router.get("/admin/moderation/offers")
async def moderation_offers(user: dict = Depends(require_roles("admin"))):
    docs = await db.b2b_offers.find({}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.patch("/admin/moderation/offers/{offer_id}/close")
async def moderation_close_offer(offer_id: str, user: dict = Depends(require_roles("admin"))):
    before = await db.b2b_offers.find_one({"_id": offer_id}, {"status": 1, "title": 1})
    if not before:
        raise HTTPException(status_code=404, detail="Offerta non trovata")
    await db.b2b_offers.update_one({"_id": offer_id}, {"$set": {"status": "closed", "moderated": True}})
    await audit(user, "close", "b2b_offer", offer_id, before=before, after={"status": "closed"})
    return {"ok": True}


# ----------------------------- Categories -----------------------------

DEFAULT_CATEGORIES = [
    ("olio", "Olio", "Olive oil"), ("formaggi", "Formaggi", "Cheese"), ("frutta_secca", "Frutta secca", "Nuts"),
    ("agrumi", "Agrumi", "Citrus"), ("dolci", "Dolci", "Sweets"), ("pasta", "Pasta", "Pasta"),
    ("vino", "Vino", "Wine"), ("conserve", "Conserve", "Preserves"),
]


async def seed_categories():
    if await db.categories.count_documents({}) == 0:
        await db.categories.insert_many([
            {"_id": slug, "name": it, "name_en": en, "order": i, "created_at": now_utc(), "deleted_at": None}
            for i, (slug, it, en) in enumerate(DEFAULT_CATEGORIES)
        ])


class CategoryIn(BaseModel):
    slug: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=80)
    name_en: Optional[str] = Field(None, max_length=80)


@router.get("/categories")
async def list_categories():
    docs = await db.categories.find({"deleted_at": None}).sort("order", 1).to_list(200)
    return [{"slug": d["_id"], "name": d["name"], "name_en": d.get("name_en"),
             "products": await db.products.count_documents({"category": d["_id"], "deleted_at": None})} for d in docs]


@router.post("/categories")
async def create_category(body: CategoryIn, user: dict = Depends(require_roles("admin"))):
    existing = await db.categories.find_one({"_id": body.slug})
    if existing and existing.get("deleted_at") is None:
        raise HTTPException(status_code=409, detail="Categoria già esistente")
    count = await db.categories.count_documents({})
    doc = {"name": body.name, "name_en": body.name_en, "order": count, "created_at": now_utc(), "deleted_at": None}
    await db.categories.update_one({"_id": body.slug}, {"$set": doc}, upsert=True)
    await audit(user, "create", "category", body.slug, before=existing, after=doc)
    return {"ok": True}


@router.delete("/categories/{slug}")
async def delete_category(slug: str, user: dict = Depends(require_roles("admin"))):
    if await db.products.count_documents({"category": slug, "deleted_at": None}):
        raise HTTPException(status_code=422, detail="Categoria in uso da prodotti: non eliminabile")
    before = await db.categories.find_one({"_id": slug, "deleted_at": None})
    if not before:
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    await db.categories.update_one({"_id": slug}, {"$set": {"deleted_at": now_utc()}})
    await audit(user, "soft_delete", "category", slug, before=before, after={"deleted_at": True})
    return {"ok": True}


# ----------------------------- Buyer analytics -----------------------------

@router.get("/buyer/analytics")
async def buyer_analytics(user: dict = Depends(require_perm("analytics:view"))):
    uid = str(user["_id"])
    spend, orders_count = 0.0, 0
    by_producer: dict = {}
    by_product: dict = {}
    async for o in db.orders.find({"user_id": uid}):
        orders_count += 1
        spend += float(o.get("total") or 0)
        for it in o.get("items", []):
            amt = it["price"] * it["qty"]
            pid = it.get("producer_id") or "—"
            by_producer[pid] = by_producer.get(pid, 0.0) + amt
            by_product[it["name"]] = by_product.get(it["name"], 0.0) + amt
    b2b_total, agreements = 0.0, 0
    async for a in db.agreements.find({"status": "accepted", "business_id": uid}):
        agreements += 1
        b2b_total += float(a.get("price") or 0) * float(a.get("qty") or 0)
    names = {}
    for pid in by_producer:
        u = await db.users.find_one({"_id": pid}, {"company_name": 1, "name": 1})
        names[pid] = (u or {}).get("company_name") or (u or {}).get("name") or "—"
    negotiations = await db.negotiations.count_documents({"business_id": uid})
    open_rfq = await db.rfqs.count_documents({"buyer_id": uid, "status": "open"})
    top = lambda d: [{"name": k, "amount": round(v, 2)} for k, v in sorted(d.items(), key=lambda x: -x[1])[:5]]
    return {
        "orders_count": orders_count, "orders_spend": round(spend, 2), "b2b_agreements": agreements,
        "b2b_spend": round(b2b_total, 2), "negotiations": negotiations, "open_requests": open_rfq,
        "top_producers": top({names[k]: v for k, v in by_producer.items()}), "top_products": top(by_product),
    }
