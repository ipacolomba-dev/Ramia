from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import AccountReviewIn
from security import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])

COMMISSION_SALES = 0.05
COMMISSION_LOGISTICS = 0.01
COMMISSION_LABELS = 0.01


@router.get("/stats")
async def stats(user: dict = Depends(require_roles("admin"))):
    return {
        "users": await db.users.count_documents({}),
        "producers": await db.users.count_documents({"role": "producer"}),
        "products": await db.products.count_documents({"deleted_at": None}),
        "pending_products": await db.products.count_documents({"status": "pending", "deleted_at": None}),
        "orders": await db.orders.count_documents({}),
        "b2b_agreements": await db.agreements.count_documents({}),
        "shipping_requests": await db.shipping_requests.count_documents({}),
        "label_requests": await db.label_requests.count_documents({}),
        "pending_accounts": await db.users.count_documents({"role": {"$in": ["business", "collaborator", "logistics"]}, "approved": False}),
    }


@router.get("/pending-products")
async def pending_products(user: dict = Depends(require_roles("admin"))):
    docs = await db.products.find({"status": "pending", "deleted_at": None}).sort("created_at", -1).to_list(200)
    return [{**{k: v for k, v in d.items() if k != "_id"}, "id": d["_id"]} for d in docs]


@router.patch("/products/{product_id}/review")
async def review_product(product_id: str, body: dict, user: dict = Depends(require_roles("admin"))):
    status = (body or {}).get("status")
    if status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="Stato non valido")
    res = await db.products.update_one({"_id": product_id}, {"$set": {"status": status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    return {"ok": True}


PENDING_ROLES = ("business", "collaborator", "logistics")


@router.get("/accounts/pending")
async def pending_accounts(user: dict = Depends(require_roles("admin"))):
    docs = await db.users.find(
        {"role": {"$in": list(PENDING_ROLES)}, "approved": False}
    ).sort("created_at", -1).to_list(200)
    return [
        {
            "id": str(d["_id"]),
            "name": d.get("name", ""),
            "email": d.get("email", ""),
            "role": d.get("role", ""),
            "company_name": d.get("company_name") or d.get("name", ""),
            "region": d.get("region", ""),
            "business_type": d.get("business_type"),
            "specialty": d.get("specialty"),
            "fleet_info": d.get("fleet_info"),
        }
        for d in docs
    ]


@router.patch("/accounts/{account_id}/review")
async def review_account(account_id: str, body: AccountReviewIn, user: dict = Depends(require_roles("admin"))):
    approved = body.action == "approve"
    res = await db.users.update_one({"_id": account_id}, {"$set": {"approved": approved}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account non trovato")
    return {"ok": True, "approved": approved}


@router.get("/earnings")
async def earnings(user: dict = Depends(require_roles("admin"))):
    # Advertising: visibility packages purchased by producers
    advertising = 0.0
    async for p in db.purchases.find({}, {"price": 1}):
        advertising += float(p.get("price") or 0)

    # Sales: consumer orders + accepted B2B agreements
    sales_volume = 0.0
    async for o in db.orders.find({}, {"total": 1}):
        sales_volume += float(o.get("total") or 0)
    async for a in db.agreements.find({"status": "accepted"}, {"price": 1, "qty": 1}):
        sales_volume += float(a.get("price") or 0) * float(a.get("qty") or 0)

    # Logistics: estimated on the best (lowest) quote per shipment request
    logistics_volume = 0.0
    async for s in db.shipping_requests.find({}, {"quotes": 1}):
        quotes = s.get("quotes") or []
        prices = [float(q.get("price") or 0) for q in quotes if q.get("price")]
        if prices:
            logistics_volume += min(prices)

    # Labels: accepted label offers
    labels_volume = 0.0
    async for lr in db.label_requests.find({}, {"offers": 1}):
        for off in lr.get("offers") or []:
            if off.get("status") == "accepted":
                labels_volume += float(off.get("price") or 0)

    sales_commission = round(sales_volume * COMMISSION_SALES, 2)
    logistics_commission = round(logistics_volume * COMMISSION_LOGISTICS, 2)
    labels_commission = round(labels_volume * COMMISSION_LABELS, 2)
    advertising = round(advertising, 2)
    total = round(advertising + sales_commission + logistics_commission + labels_commission, 2)

    return {
        "advertising": advertising,
        "sales_volume": round(sales_volume, 2),
        "sales_commission": sales_commission,
        "logistics_volume": round(logistics_volume, 2),
        "logistics_commission": logistics_commission,
        "labels_volume": round(labels_volume, 2),
        "labels_commission": labels_commission,
        "total": total,
        "rates": {"sales": COMMISSION_SALES, "logistics": COMMISSION_LOGISTICS, "labels": COMMISSION_LABELS},
    }
