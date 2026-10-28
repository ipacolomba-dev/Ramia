"""Commercial rules engine ('Ra mia golden rule).

All rates, minimums and fees live in MongoDB (`business_rules`, versioned and immutable).
Every billable event stores `commercial_snapshot` = the exact rule version + computed fees.
Snapshots are written once and never updated, so later rule changes never alter closed deals.
"""
import uuid
from typing import Optional

from db import db
from models import now_utc

# Seed values for the FIRST rules version only. At runtime every number is read from the database.
DEFAULT_RULES = {
    "services": {
        "mediated_sale": {"label": "Commissione di mediazione", "buyer_pct": 3.0, "producer_pct": 2.0, "min_fee": 0.0},
        "introduction": {"label": "Quota di introduzione (affare dichiarato)", "buyer_pct": 0.0, "producer_pct": 2.0, "min_fee": 0.0, "window_months": 18},
        "transport": {"label": "Mediazione trasporto", "buyer_pct": 0.0, "producer_pct": 1.0, "min_fee": 0.0},
        "labels": {"label": "Mediazione adeguamento etichette", "buyer_pct": 0.0, "producer_pct": 1.0, "min_fee": 0.0},
    },
    "discounts": [],  # e.g. {"code": "LAUNCH", "service": "mediated_sale", "pct_off": 50, "active": True}
    "currency": "EUR",
}


async def seed_rules():
    if await db.business_rules.count_documents({}) == 0:
        await db.business_rules.insert_one({
            "_id": str(uuid.uuid4()), "version": 1, **DEFAULT_RULES, "active": True,
            "created_at": now_utc(), "created_by": "seed", "note": "Regole iniziali",
        })


async def get_active_rules() -> dict:
    doc = await db.business_rules.find_one({"active": True}, sort=[("version", -1)])
    if not doc:
        await seed_rules()
        doc = await db.business_rules.find_one({"active": True}, sort=[("version", -1)])
    return doc


async def publish_rules(new_rules: dict, actor: dict, note: Optional[str]) -> dict:
    """Creates a NEW immutable version; previous versions stay readable for old snapshots."""
    current = await get_active_rules()
    doc = {
        "_id": str(uuid.uuid4()), "version": current["version"] + 1,
        "services": new_rules["services"], "discounts": new_rules.get("discounts", []),
        "currency": new_rules.get("currency", current.get("currency", "EUR")),
        "active": True, "created_at": now_utc(), "created_by": str(actor["_id"]), "note": note,
    }
    await db.business_rules.insert_one(doc)
    await db.business_rules.update_many({"_id": {"$ne": doc["_id"]}, "active": True}, {"$set": {"active": False}})
    return doc


def _fee(amount: float, pct: float, min_fee: float) -> float:
    if pct <= 0:
        return 0.0
    return round(max(amount * pct / 100.0, min_fee), 2)


def compute_snapshot(rules: dict, service: str, amount: float, discount_code: Optional[str] = None) -> dict:
    cfg = rules["services"][service]
    disc = next((d for d in rules.get("discounts", []) if d.get("active") and d.get("code") == discount_code
                 and d.get("service") in (service, "*")), None) if discount_code else None
    factor = 1 - (float(disc["pct_off"]) / 100.0) if disc else 1.0
    buyer_fee = round(_fee(amount, cfg.get("buyer_pct", 0), cfg.get("min_fee", 0)) * factor, 2)
    producer_fee = round(_fee(amount, cfg.get("producer_pct", 0), cfg.get("min_fee", 0)) * factor, 2)
    return {
        "rules_id": rules["_id"], "rules_version": rules["version"], "service": service,
        "base_amount": round(amount, 2), "currency": rules.get("currency", "EUR"),
        "buyer_pct": cfg.get("buyer_pct", 0), "producer_pct": cfg.get("producer_pct", 0), "min_fee": cfg.get("min_fee", 0),
        "discount": disc, "buyer_fee": buyer_fee, "producer_fee": producer_fee,
        "platform_revenue": round(buyer_fee + producer_fee, 2),
        "computed_at": now_utc().isoformat(),
    }


async def snapshot_for(service: str, amount: float, discount_code: Optional[str] = None) -> dict:
    return compute_snapshot(await get_active_rules(), service, amount, discount_code)
