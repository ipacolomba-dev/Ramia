import uuid

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import (
    AgreementIn, AgreementRespondIn, B2BMessageIn, B2BOfferIn, LabelAcceptIn,
    LabelOfferIn, LabelRequestIn, LabelStatusIn, NegotiationStartIn, now_utc,
)
from security import current_user, require_approved_roles, require_roles

router = APIRouter(tags=["b2b"])


async def get_offer(offer_id: str) -> dict:
    doc = await db.b2b_offers.find_one({"_id": offer_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Offerta non trovata")
    return doc


def _clean(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


# ---------------- B2B Offers ----------------

@router.get("/b2b/offers")
async def list_offers(mine: bool = False, user: dict = Depends(current_user)):
    if mine:
        query = {"producer_id": str(user["_id"])}
    else:
        query = {"status": "open"}
    docs = await db.b2b_offers.find(query).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/b2b/offers")
async def create_offer(body: B2BOfferIn, user: dict = Depends(require_roles("producer"))):
    doc = {
        "_id": str(uuid.uuid4()),
        **body.model_dump(),
        "producer_id": str(user["_id"]),
        "producer_name": user.get("name", ""),
        "company_name": user.get("company_name") or user.get("name", ""),
        "status": "open",
        "created_at": now_utc(),
    }
    await db.b2b_offers.insert_one(doc)
    return _clean(doc)


@router.get("/b2b/offers/{offer_id}")
async def get_single_offer(offer_id: str, user: dict = Depends(current_user)):
    doc = await get_offer(offer_id)
    return _clean(doc)


@router.patch("/b2b/offers/{offer_id}/close")
async def close_offer(offer_id: str, user: dict = Depends(require_roles("producer"))):
    res = await db.b2b_offers.update_one(
        {"_id": offer_id, "producer_id": str(user["_id"])}, {"$set": {"status": "closed"}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Offerta non trovata")
    return {"ok": True}


# ---------------- Negotiations ----------------

@router.post("/b2b/offers/{offer_id}/negotiations")
async def start_negotiation(offer_id: str, body: NegotiationStartIn, user: dict = Depends(require_approved_roles("business"))):
    offer = await get_offer(offer_id)
    existing = await db.negotiations.find_one({
        "offer_id": offer_id, "business_id": str(user["_id"]), "status": {"$ne": "closed"},
    })
    if existing:
        return _clean(existing)
    doc = {
        "_id": str(uuid.uuid4()),
        "offer_id": offer_id,
        "offer_title": offer["title"],
        "business_id": str(user["_id"]),
        "business_name": user.get("company_name") or user.get("name", ""),
        "producer_id": offer["producer_id"],
        "producer_name": offer.get("producer_name", ""),
        "status": "open",
        "messages": [
            {
                "id": str(uuid.uuid4()), "kind": "system", "sender_id": "", "sender_name": "",
                "sender_role": "", "text": "Trattativa avviata", "at": now_utc().isoformat(),
            }
        ],
        "created_at": now_utc(),
    }
    if body.message:
        doc["messages"].append({
            "id": str(uuid.uuid4()), "kind": "message", "sender_id": str(user["_id"]),
            "sender_name": user.get("company_name") or user.get("name", ""), "sender_role": "business",
            "text": body.message, "at": now_utc().isoformat(),
        })
    await db.negotiations.insert_one(doc)
    await db.b2b_offers.update_one({"_id": offer_id}, {"$set": {"status": "in_negotiation"}})
    return _clean(doc)


@router.get("/b2b/negotiations/mine")
async def my_negotiations(user: dict = Depends(current_user)):
    uid = str(user["_id"])
    docs = await db.negotiations.find({"$or": [{"business_id": uid}, {"producer_id": uid}]}).sort("created_at", -1).to_list(100)
    return [_clean(d) for d in docs]


async def _get_neg(neg_id: str) -> dict:
    doc = await db.negotiations.find_one({"_id": neg_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Trattativa non trovata")
    return doc


def _ensure_participant(neg: dict, user: dict):
    uid = str(user["_id"])
    if uid not in (neg.get("business_id"), neg.get("producer_id")) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Non partecipi a questa trattativa")


@router.get("/b2b/negotiations/{neg_id}")
async def get_negotiation(neg_id: str, user: dict = Depends(current_user)):
    doc = await _get_neg(neg_id)
    _ensure_participant(doc, user)
    return _clean(doc)


@router.post("/b2b/negotiations/{neg_id}/messages")
async def post_message(neg_id: str, body: B2BMessageIn, user: dict = Depends(current_user)):
    neg = await _get_neg(neg_id)
    _ensure_participant(neg, user)
    if not body.text and not body.price:
        raise HTTPException(status_code=422, detail="Messaggio vuoto")
    msg = {
        "id": str(uuid.uuid4()), "kind": "message", "sender_id": str(user["_id"]),
        "sender_name": user.get("company_name") or user.get("name", ""),
        "sender_role": user["role"], "text": body.text or "",
        "price": body.price, "qty": body.qty, "at": now_utc().isoformat(),
    }
    await db.negotiations.update_one({"_id": neg_id}, {"$push": {"messages": msg}})
    neg["messages"].append(msg)
    return _clean(neg)


@router.post("/b2b/negotiations/{neg_id}/agreements")
async def propose_agreement(neg_id: str, body: AgreementIn, user: dict = Depends(current_user)):
    neg = await _get_neg(neg_id)
    _ensure_participant(neg, user)
    msg = {
        "id": str(uuid.uuid4()), "kind": "agreement", "sender_id": str(user["_id"]),
        "sender_name": user.get("company_name") or user.get("name", ""),
        "sender_role": user["role"], "text": body.terms or "",
        "price": body.price, "qty": body.qty, "agreement_status": "proposed",
        "at": now_utc().isoformat(),
    }
    await db.negotiations.update_one({"_id": neg_id}, {"$push": {"messages": msg}})
    neg["messages"].append(msg)
    return _clean(neg)


@router.patch("/b2b/negotiations/{neg_id}/agreement")
async def respond_agreement(neg_id: str, body: AgreementRespondIn, user: dict = Depends(current_user)):
    neg = await _get_neg(neg_id)
    _ensure_participant(neg, user)
    proposals = [m for m in neg.get("messages", []) if m.get("kind") == "agreement" and m.get("agreement_status") == "proposed"]
    if not proposals:
        raise HTTPException(status_code=422, detail="Nessuna proposta da valutare")
    last = proposals[-1]
    if last["sender_id"] == str(user["_id"]):
        raise HTTPException(status_code=403, detail="Non puoi valutare la tua proposta")
    new_status = "accepted" if body.action == "accept" else "rejected"
    await db.negotiations.update_one(
        {"_id": neg_id, "messages.id": last["id"]},
        {"$set": {"messages.$.agreement_status": new_status}},
    )
    if body.action == "accept":
        await db.negotiations.update_one({"_id": neg_id}, {"$set": {"status": "agreed"}})
        await db.b2b_offers.update_one({"_id": neg["offer_id"]}, {"$set": {"status": "closed"}})
        sys_msg = {
            "id": str(uuid.uuid4()), "kind": "system", "sender_id": "", "sender_name": "",
            "sender_role": "", "text": "Accordo commerciale stipulato", "at": now_utc().isoformat(),
        }
        await db.negotiations.update_one({"_id": neg_id}, {"$push": {"messages": sys_msg}})
        await db.agreements.insert_one({
            "_id": str(uuid.uuid4()), "negotiation_id": neg_id, "offer_id": neg["offer_id"],
            "offer_title": neg.get("offer_title", ""), "producer_id": neg["producer_id"],
            "producer_name": neg.get("producer_name", ""), "business_id": neg["business_id"],
            "business_name": neg.get("business_name", ""), "price": last["price"], "qty": last["qty"],
            "terms": last.get("text", ""), "status": "accepted", "created_at": now_utc(),
        })
    neg = await _get_neg(neg_id)
    return _clean(neg)


# ---------------- Label compliance ----------------

@router.post("/labels/requests")
async def create_label_request(body: LabelRequestIn, user: dict = Depends(require_roles("producer"))):
    doc = {
        "_id": str(uuid.uuid4()),
        **body.model_dump(),
        "producer_id": str(user["_id"]),
        "producer_name": user.get("company_name") or user.get("name", ""),
        "status": "open",
        "offers": [],
        "assigned_collaborator_id": None,
        "assigned_collaborator_name": None,
        "created_at": now_utc(),
    }
    await db.label_requests.insert_one(doc)
    return _clean(doc)


@router.get("/labels/requests")
async def list_label_requests(mine: bool = False, user: dict = Depends(current_user)):
    role = user["role"]
    if mine and role == "producer":
        docs = await db.label_requests.find({"producer_id": str(user["_id"])}).sort("created_at", -1).to_list(100)
    elif role == "collaborator":
        docs = await db.label_requests.find({"status": {"$in": ["open", "in_progress"]}}).sort("created_at", -1).to_list(100)
    elif role == "admin":
        docs = await db.label_requests.find().sort("created_at", -1).to_list(200)
    else:
        docs = []
    return [_clean(d) for d in docs]


async def _get_label_request(req_id: str) -> dict:
    doc = await db.label_requests.find_one({"_id": req_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    return doc


@router.get("/labels/requests/{req_id}")
async def get_label_request(req_id: str, user: dict = Depends(current_user)):
    doc = await _get_label_request(req_id)
    if user["role"] not in ("collaborator", "admin") and doc["producer_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return _clean(doc)


@router.post("/labels/requests/{req_id}/offers")
async def create_label_offer(req_id: str, body: LabelOfferIn, user: dict = Depends(require_approved_roles("collaborator"))):
    req = await _get_label_request(req_id)
    if req["status"] != "open":
        raise HTTPException(status_code=422, detail="Richiesta non più aperta")
    uid = str(user["_id"])
    if any(o["collaborator_id"] == uid for o in req.get("offers", [])):
        raise HTTPException(status_code=422, detail="Hai già inviato una proposta")
    offer = {
        "id": str(uuid.uuid4()), "collaborator_id": uid,
        "collaborator_name": user.get("company_name") or user.get("name", ""),
        "specialty": user.get("specialty", ""),
        "price": body.price, "days": body.days, "message": body.message or "",
        "status": "pending", "created_at": now_utc().isoformat(),
    }
    await db.label_requests.update_one({"_id": req_id}, {"$push": {"offers": offer}})
    req = await _get_label_request(req_id)
    return _clean(req)


@router.post("/labels/requests/{req_id}/accept")
async def accept_label_offer(req_id: str, body: LabelAcceptIn, user: dict = Depends(require_roles("producer"))):
    req = await _get_label_request(req_id)
    if req["producer_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if req["status"] != "open":
        raise HTTPException(status_code=422, detail="Richiesta già assegnata")
    offer = next((o for o in req.get("offers", []) if o["collaborator_id"] == body.collaborator_id), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Proposta non trovata")
    await db.label_requests.update_one(
        {"_id": req_id, "offers.collaborator_id": body.collaborator_id},
        {"$set": {"offers.$.status": "accepted"}},
    )
    await db.label_requests.update_one(
        {"_id": req_id, "offers.status": "pending"},
        {"$set": {"offers.$.status": "rejected"}},
    )
    await db.label_requests.update_one(
        {"_id": req_id},
        {"$set": {
            "status": "in_progress",
            "assigned_collaborator_id": body.collaborator_id,
            "assigned_collaborator_name": offer["collaborator_name"],
        }},
    )
    req = await _get_label_request(req_id)
    return _clean(req)


@router.patch("/labels/requests/{req_id}/status")
async def update_label_status(req_id: str, body: LabelStatusIn, user: dict = Depends(current_user)):
    req = await _get_label_request(req_id)
    uid = str(user["_id"])
    is_assigned = user["role"] == "collaborator" and req.get("assigned_collaborator_id") == uid
    is_owner = user["role"] == "producer" and req["producer_id"] == uid
    if not (is_assigned or is_owner or user["role"] == "admin"):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.label_requests.update_one({"_id": req_id}, {"$set": {"status": body.status}})
    req = await _get_label_request(req_id)
    return _clean(req)
