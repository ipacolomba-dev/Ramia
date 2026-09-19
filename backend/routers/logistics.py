import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import QuoteIn, ShippingRequestIn, now_utc
from security import current_user, require_roles

router = APIRouter(tags=["logistics"])


def _clean(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("/logistics/requests")
async def list_requests(mine: bool = False, user: dict = Depends(current_user)):
    query = {"creator_id": str(user["_id"])} if mine else {}
    docs = await db.shipping_requests.find(query).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/logistics/requests")
async def create_request(body: ShippingRequestIn, user: dict = Depends(require_roles("producer", "business"))):
    doc = {
        "_id": str(uuid.uuid4()),
        **body.model_dump(),
        "creator_id": str(user["_id"]),
        "creator_name": user.get("company_name") or user.get("name", ""),
        "creator_role": user["role"],
        "status": "open",
        "participants": [{
            "user_id": str(user["_id"]),
            "name": user.get("company_name") or user.get("name", ""),
            "role": user["role"],
        }],
        "quotes": [],
        "created_at": now_utc(),
    }
    await db.shipping_requests.insert_one(doc)
    return _clean(doc)


async def _get_request(req_id: str) -> dict:
    doc = await db.shipping_requests.find_one({"_id": req_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Spedizione non trovata")
    return doc


@router.get("/logistics/requests/{req_id}")
async def get_request(req_id: str, user: dict = Depends(current_user)):
    doc = await _get_request(req_id)
    out = _clean(doc)
    uid = str(user["_id"])
    out["can_view_quotes"] = (
        user["role"] in ("logistics", "admin")
        or doc["creator_id"] == uid
        or any(p["user_id"] == uid for p in doc.get("participants", []))
    )
    if not out["can_view_quotes"]:
        out["quotes"] = [{"price": q["price"], "transit_days": q["transit_days"]} for q in doc.get("quotes", [])]
    return out


@router.post("/logistics/requests/{req_id}/join")
async def join_request(req_id: str, user: dict = Depends(require_roles("producer", "business"))):
    doc = await _get_request(req_id)
    if not doc.get("shared", True):
        raise HTTPException(status_code=422, detail="Spedizione non condivisibile")
    uid = str(user["_id"])
    if any(p["user_id"] == uid for p in doc.get("participants", [])):
        raise HTTPException(status_code=422, detail="Partecipi già a questa spedizione")
    participant = {
        "user_id": uid,
        "name": user.get("company_name") or user.get("name", ""),
        "role": user["role"],
    }
    await db.shipping_requests.update_one({"_id": req_id}, {"$push": {"participants": participant}})
    doc = await _get_request(req_id)
    return _clean(doc)


@router.post("/logistics/requests/{req_id}/quotes")
async def add_quote(req_id: str, body: QuoteIn, user: dict = Depends(require_roles("logistics"))):
    doc = await _get_request(req_id)
    quote = {
        "id": str(uuid.uuid4()),
        "company_id": str(user["_id"]),
        "company_name": user.get("company_name") or user.get("name", ""),
        "price": body.price,
        "transit_days": body.transit_days,
        "message": body.message or "",
        "created_at": now_utc().isoformat(),
    }
    await db.shipping_requests.update_one({"_id": req_id}, {"$push": {"quotes": quote}})
    doc = await _get_request(req_id)
    return _clean(doc)


@router.get("/logistics/partners")
async def list_partners(user: dict = Depends(current_user)):
    docs = await db.users.find({"role": "logistics"}).sort("created_at", -1).to_list(100)
    return [
        {
            "id": str(d["_id"]),
            "company_name": d.get("company_name") or d.get("name", ""),
            "region": d.get("region", ""),
            "fleet_info": d.get("fleet_info", ""),
        }
        for d in docs
    ]
