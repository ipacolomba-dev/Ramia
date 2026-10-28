from fastapi import APIRouter, Depends, HTTPException

from core.audit import audit
from core.permissions import APPROVAL_ROLES
from core.rules import compute_snapshot, get_active_rules
from db import db
from models import AccountReviewIn
from security import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])


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
        "pending_accounts": await db.users.count_documents({"role": {"$in": list(APPROVAL_ROLES)}, "approved": False}),
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
    before = await db.products.find_one({"_id": product_id}, {"status": 1, "name": 1})
    if not before:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    await db.products.update_one({"_id": product_id}, {"$set": {"status": status}})
    await audit(user, "review", "product", product_id, before=before, after={"status": status})
    return {"ok": True}


PENDING_ROLES = APPROVAL_ROLES


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
    before = await db.users.find_one({"_id": account_id}, {"approved": 1, "email": 1, "role": 1})
    if not before:
        raise HTTPException(status_code=404, detail="Account non trovato")
    await db.users.update_one({"_id": account_id}, {"$set": {"approved": approved}})
    await audit(user, "review", "user", account_id, before=before, after={"approved": approved})
    return {"ok": True, "approved": approved}


async def _revenue(coll, amount_of, service: str, rules: dict, query: dict | None = None):
    """Sums platform revenue from stored snapshots; legacy records without snapshot are estimated with active rules."""
    volume = revenue = estimated = 0.0
    async for d in db[coll].find(query or {}):
        snap = d.get("commercial_snapshot")
        amount = amount_of(d)
        if not amount:
            continue
        volume += amount
        if snap:
            revenue += float(snap.get("platform_revenue") or 0)
        else:
            est = compute_snapshot(rules, service, amount)["platform_revenue"]
            revenue += est
            estimated += est
    return round(volume, 2), round(revenue, 2), round(estimated, 2)


@router.get("/earnings")
async def earnings(user: dict = Depends(require_roles("admin"))):
    rules = await get_active_rules()
    advertising = 0.0
    async for p in db.purchases.find({"status": {"$ne": "pending"}}, {"price": 1}):
        advertising += float(p.get("price") or 0)

    o_vol, o_rev, o_est = await _revenue("orders", lambda o: float(o.get("goods_total", o.get("total")) or 0), "mediated_sale", rules,
                                         {"status": {"$nin": ["awaiting_payment", "cancelled", "refunded"]}})
    a_vol, a_rev, a_est = await _revenue("agreements", lambda a: float(a.get("price") or 0) * float(a.get("qty") or 0),
                                         "mediated_sale", rules, {"status": "accepted"})
    i_vol, i_rev, _ = await _revenue("deal_declarations", lambda d: float(d.get("amount") or 0) if d.get("within_window") else 0,
                                     "introduction", rules, {"deleted_at": None})
    l_vol, l_rev, l_est = await _revenue(
        "shipping_requests",
        lambda s: float(next((q["price"] for q in s.get("quotes", []) if q.get("id") == s.get("selected_quote_id")), 0) or 0),
        "transport", rules, {"selected_quote_id": {"$ne": None}})
    lb_vol, lb_rev, lb_est = await _revenue(
        "label_requests",
        lambda r: float(next((o["price"] for o in r.get("offers", []) if o.get("status") == "accepted"), 0) or 0),
        "labels", rules)

    sales_commission = round(o_rev + a_rev + i_rev, 2)
    total = round(advertising + sales_commission + l_rev + lb_rev, 2)
    svc = rules["services"]
    return {
        "advertising": round(advertising, 2),
        "sales_volume": round(o_vol + a_vol + i_vol, 2),
        "sales_commission": sales_commission,
        "introduction_volume": i_vol, "introduction_commission": i_rev,
        "logistics_volume": l_vol, "logistics_commission": l_rev,
        "labels_volume": lb_vol, "labels_commission": lb_rev,
        "estimated_legacy": round(o_est + a_est + l_est + lb_est, 2),
        "total": total,
        "rules_version": rules["version"],
        "rates": {
            "sales": (svc["mediated_sale"]["buyer_pct"] + svc["mediated_sale"]["producer_pct"]) / 100,
            "logistics": svc["transport"]["producer_pct"] / 100,
            "labels": (svc["labels"]["producer_pct"] + svc["labels"].get("buyer_pct", 0)) / 100,
        },
    }
