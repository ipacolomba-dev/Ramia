"""Governance: business rules (versioned), audit log, permission matrix, off-platform deal declarations,
visibility packages, fee quotes."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.audit import audit
from core.permissions import ROLES, get_matrix, invalidate_cache, require_perm
from core.rules import compute_snapshot, get_active_rules, publish_rules
from db import db
from models import now_utc
from security import current_user, require_roles

router = APIRouter(tags=["governance"])


def _clean(d: dict) -> dict:
    d = dict(d)
    d["id"] = str(d.pop("_id"))
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


# ----------------------------- Business rules -----------------------------

class ServiceRuleIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    buyer_pct: float = Field(ge=0, le=100)
    producer_pct: float = Field(ge=0, le=100)
    min_fee: float = Field(ge=0)
    window_months: Optional[int] = Field(None, ge=1, le=120)


class DiscountIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    service: str
    pct_off: float = Field(gt=0, le=100)
    active: bool = True


class RulesIn(BaseModel):
    services: Dict[str, ServiceRuleIn]
    discounts: List[DiscountIn] = Field(default_factory=list)
    note: Optional[str] = Field(None, max_length=300)


REQUIRED_SERVICES = ("mediated_sale", "introduction", "transport", "labels")


@router.get("/business-rules/active")
async def active_rules(user: dict = Depends(current_user)):
    r = await get_active_rules()
    return {"version": r["version"], "services": r["services"], "currency": r.get("currency", "EUR")}


@router.get("/admin/business-rules")
async def list_rules(user: dict = Depends(require_roles("admin"))):
    docs = await db.business_rules.find({}).sort("version", -1).to_list(100)
    return [_clean(d) for d in docs]


@router.put("/admin/business-rules")
async def update_rules(body: RulesIn, user: dict = Depends(require_roles("admin"))):
    if not (body.note or "").strip() or len(body.note.strip()) < 3:
        raise HTTPException(status_code=422, detail="Indica la motivazione della modifica")
    missing = [s for s in REQUIRED_SERVICES if s not in body.services]
    if missing:
        raise HTTPException(status_code=422, detail=f"Servizi mancanti: {', '.join(missing)}")
    if not body.services["introduction"].window_months:
        raise HTTPException(status_code=422, detail="La quota di introduzione richiede la finestra in mesi")
    for d in body.discounts:
        if d.service not in body.services and d.service != "*":
            raise HTTPException(status_code=422, detail=f"Sconto su servizio inesistente: {d.service}")
    before = await get_active_rules()
    data = body.model_dump()
    data["services"] = {k: {kk: vv for kk, vv in v.items() if vv is not None} for k, v in data["services"].items()}
    doc = await publish_rules(data, user, body.note)
    await audit(user, "publish", "business_rules", doc["_id"],
                before={"version": before["version"], "services": before["services"], "discounts": before.get("discounts", [])},
                after={"version": doc["version"], "services": doc["services"], "discounts": doc["discounts"]}, reason=body.note)
    return _clean(doc)


# ----------------------------- Audit log -----------------------------

@router.get("/admin/audit-logs")
async def audit_logs(entity: Optional[str] = None, limit: int = 100, user: dict = Depends(require_roles("admin"))):
    q = {"entity": entity} if entity else {}
    docs = await db.audit_logs.find(q).sort("at", -1).to_list(min(max(limit, 1), 500))
    return [_clean(d) for d in docs]


# ----------------------------- Permission matrix -----------------------------

class PermissionsIn(BaseModel):
    permissions: List[str]


@router.get("/admin/permissions")
async def permissions(user: dict = Depends(require_roles("admin"))):
    return await get_matrix(force=True)


@router.put("/admin/permissions/{role}")
async def set_permissions(role: str, body: PermissionsIn, user: dict = Depends(require_roles("admin"))):
    if role not in ROLES or role == "admin":
        raise HTTPException(status_code=422, detail="Ruolo non modificabile")
    before = (await get_matrix(force=True)).get(role, [])
    perms = sorted(set(p.strip() for p in body.permissions if p.strip()))
    await db.role_permissions.update_one({"_id": role}, {"$set": {"permissions": perms}}, upsert=True)
    invalidate_cache()
    await audit(user, "update", "role_permissions", role, before={"permissions": before}, after={"permissions": perms})
    return {"role": role, "permissions": perms}


@router.get("/me/permissions")
async def my_permissions(user: dict = Depends(current_user)):
    if user["role"] == "admin":
        return ["*"]
    return (await get_matrix()).get(user["role"], [])


# ----------------------------- Fee quote (shown before confirming) -----------------------------

class QuoteIn(BaseModel):
    service: str
    amount: float = Field(ge=0)
    discount_code: Optional[str] = None


@router.post("/fees/quote")
async def fee_quote(body: QuoteIn, user: dict = Depends(current_user)):
    rules = await get_active_rules()
    if body.service not in rules["services"]:
        raise HTTPException(status_code=422, detail="Servizio sconosciuto")
    return compute_snapshot(rules, body.service, body.amount, body.discount_code)


# ----------------------------- Off-platform deal declarations -----------------------------

class DeclarationIn(BaseModel):
    buyer_id: str
    amount: float = Field(gt=0)
    closed_on: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    description: str = Field(min_length=3, max_length=1000)


async def _first_contact(producer_id: str, buyer_id: str) -> Optional[datetime]:
    m = await db.match_registry.find_one({"producer_id": producer_id, "buyer_id": buyer_id})
    if m:
        fc = m["first_contact_at"]
        return fc if fc.tzinfo else fc.replace(tzinfo=timezone.utc)
    dates = []
    n = await db.negotiations.find_one({"producer_id": producer_id, "business_id": buyer_id}, sort=[("created_at", 1)])
    if n:
        dates.append(n["created_at"])
    async for r in db.rfqs.find({"buyer_id": buyer_id, "responses.producer_id": producer_id}):
        for resp in r.get("responses", []):
            if resp["producer_id"] == producer_id:
                dates.append(datetime.fromisoformat(resp["created_at"]))
    dates = [d if d.tzinfo else d.replace(tzinfo=timezone.utc) for d in dates]
    return min(dates) if dates else None


@router.get("/matches")
async def list_matches(user: dict = Depends(current_user)):
    """Match Registry entries visible to the caller (admin: all)."""
    uid = str(user["_id"])
    q = {} if user["role"] == "admin" else {"$or": [{"producer_id": uid}, {"buyer_id": uid}]}
    docs = await db.match_registry.find(q).sort("seq", -1).to_list(500)
    names: Dict[str, str] = {}
    for d in docs:
        for k in ("producer_id", "buyer_id"):
            if d[k] not in names:
                u = await db.users.find_one({"_id": d[k]}, {"company_name": 1, "name": 1})
                names[d[k]] = (u or {}).get("company_name") or (u or {}).get("name", "—")
    now = now_utc()
    out = []
    for d in docs:
        exp = d["expires_at"] if d["expires_at"].tzinfo else d["expires_at"].replace(tzinfo=timezone.utc)
        out.append({"id": d["_id"], "seq": d["seq"], "producer_id": d["producer_id"], "producer_name": names[d["producer_id"]],
                    "buyer_id": d["buyer_id"], "buyer_name": names[d["buyer_id"]], "source": d["source"], "source_id": d["source_id"],
                    "first_contact_at": d["first_contact_at"].isoformat(), "expires_at": exp.isoformat(),
                    "window_months": d["window_months"], "active": exp > now, "hash": d["hash"], "prev_hash": d["prev_hash"]})
    return out


@router.get("/admin/matches/verify")
async def verify_matches(user: dict = Depends(require_roles("admin"))):
    from core.matches import verify_chain
    return await verify_chain()


@router.get("/deals/contacts")
async def deal_contacts(user: dict = Depends(require_perm("deals:declare"))):
    """Buyers this producer has been introduced to through the platform."""
    uid = str(user["_id"])
    ids = set(await db.negotiations.distinct("business_id", {"producer_id": uid}))
    ids |= set(await db.rfqs.distinct("buyer_id", {"responses.producer_id": uid}))
    ids |= set(await db.match_registry.distinct("buyer_id", {"producer_id": uid}))
    out = []
    for bid in ids:
        b = await db.users.find_one({"_id": bid}, {"company_name": 1, "name": 1})
        fc = await _first_contact(uid, bid)
        out.append({"buyer_id": bid, "name": (b or {}).get("company_name") or (b or {}).get("name", "—"),
                    "first_contact_at": fc.isoformat() if fc else None})
    return out


@router.post("/deals/declarations")
async def declare_deal(body: DeclarationIn, user: dict = Depends(require_perm("deals:declare"))):
    uid = str(user["_id"])
    fc = await _first_contact(uid, body.buyer_id)
    if not fc:
        raise HTTPException(status_code=422, detail="Nessun primo contatto tramite 'Ra mia con questo buyer")
    rules = await get_active_rules()
    window = int(rules["services"]["introduction"].get("window_months") or 0)
    closed = datetime.fromisoformat(body.closed_on).replace(tzinfo=timezone.utc)
    within = closed <= fc + timedelta(days=round(window * 30.44))
    snapshot = compute_snapshot(rules, "introduction", body.amount) if within else None
    buyer = await db.users.find_one({"_id": body.buyer_id}, {"company_name": 1, "name": 1})
    doc = {
        "_id": str(uuid.uuid4()), "producer_id": uid, "producer_name": user.get("company_name") or user.get("name", ""),
        "buyer_id": body.buyer_id, "buyer_name": (buyer or {}).get("company_name") or (buyer or {}).get("name", ""),
        "amount": body.amount, "closed_on": body.closed_on, "description": body.description,
        "first_contact_at": fc, "window_months": window, "within_window": within,
        "commercial_snapshot": snapshot, "status": "declared", "deleted_at": None, "created_at": now_utc(),
    }
    await db.deal_declarations.insert_one(doc)
    return _clean(doc)


@router.get("/deals/declarations")
async def list_declarations(user: dict = Depends(current_user)):
    q = {"deleted_at": None}
    if user["role"] != "admin":
        q["producer_id"] = str(user["_id"])
    docs = await db.deal_declarations.find(q).sort("created_at", -1).to_list(300)
    return [_clean(d) for d in docs]


# ----------------------------- Visibility packages (DB-configured) -----------------------------

DEFAULT_VISIBILITY = [
    {"_id": "boost7", "days": 7, "price": 19.0, "name": "Evidenza 7 giorni", "name_en": "Featured for 7 days",
     "perks_it": ["Prodotti in testa alla home", "Badge In Evidenza"], "perks_en": ["Products on top of home", "Featured badge"]},
    {"_id": "boost30", "days": 30, "price": 49.0, "name": "Evidenza 30 giorni", "name_en": "Featured for 30 days",
     "perks_it": ["Prodotti in testa alla home", "Badge In Evidenza", "Newsletter curatore"],
     "perks_en": ["Products on top of home", "Featured badge", "Curator newsletter"]},
    {"_id": "boost90", "days": 90, "price": 99.0, "name": "Top Producer 90 giorni", "name_en": "Top Producer for 90 days",
     "perks_it": ["Prodotti in testa alla home", "Badge Top Producer", "Newsletter curatore", "Priorità etichette"],
     "perks_en": ["Products on top of home", "Top Producer badge", "Curator newsletter", "Label priority"]},
]


async def seed_visibility():
    for i, p in enumerate(DEFAULT_VISIBILITY):
        await db.visibility_packages.update_one({"_id": p["_id"]}, {"$setOnInsert": {**p, "order": i, "active": True, "deleted_at": None}}, upsert=True)


async def visibility_plans() -> list:
    docs = await db.visibility_packages.find({"active": True, "deleted_at": None}).sort("order", 1).to_list(50)
    return [{**{k: v for k, v in d.items() if k != "_id"}, "id": d["_id"]} for d in docs]


class VisibilityIn(BaseModel):
    price: float = Field(ge=0)
    days: int = Field(ge=1, le=365)
    active: bool = True


@router.patch("/admin/visibility-packages/{pkg_id}")
async def update_visibility(pkg_id: str, body: VisibilityIn, user: dict = Depends(require_roles("admin"))):
    before = await db.visibility_packages.find_one({"_id": pkg_id})
    if not before:
        raise HTTPException(status_code=404, detail="Pacchetto non trovato")
    await db.visibility_packages.update_one({"_id": pkg_id}, {"$set": body.model_dump()})
    await audit(user, "update", "visibility_package", pkg_id, before=before, after=body.model_dump())
    return {"ok": True}
