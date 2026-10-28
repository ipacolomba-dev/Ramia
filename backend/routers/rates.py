"""Logistics engine: carrier rate cards, transparent instant quotes (with price range) and booking."""
import statistics
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from models import now_utc
from core.rules import snapshot_for
from security import current_user, require_approved_roles, require_roles

router = APIRouter(tags=["logistics-engine"])

REGIONS = ["Sicilia", "Calabria", "Campania", "Puglia", "Basilicata", "Lazio", "Toscana", "Emilia-Romagna",
           "Lombardia", "Piemonte", "Veneto", "Liguria", "Marche", "Abruzzo", "Umbria", "Molise",
           "Friuli-Venezia Giulia", "Trentino-Alto Adige", "Valle d'Aosta", "Sardegna"]


class RateCardIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    origin_region: str = Field(min_length=1, max_length=60)       # "*" = any region
    destination_region: str = Field(min_length=1, max_length=60)  # "*" = any region
    service: Literal["groupage", "ftl", "refrigerated", "express"] = "groupage"
    price_per_pallet: float = Field(0, ge=0, le=10000)
    price_per_kg: float = Field(0, ge=0, le=100)
    min_charge: float = Field(0, ge=0, le=100000)
    fuel_surcharge_pct: float = Field(0, ge=0, le=50)
    transit_days: int = Field(ge=1, le=30)
    cold_chain: bool = False
    max_pallets: int = Field(33, ge=1, le=66)
    active: bool = True


def _clean(d: dict) -> dict:
    d = dict(d)
    d["id"] = d.pop("_id")
    for k in ("created_at", "updated_at"):
        if hasattr(d.get(k), "isoformat"):
            d[k] = d[k].isoformat()
    return d


@router.get("/logistics/regions")
async def regions(user: dict = Depends(current_user)):
    return REGIONS


@router.get("/logistics/rate-cards/mine")
async def my_cards(user: dict = Depends(require_roles("logistics"))):
    docs = await db.rate_cards.find({"carrier_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/logistics/rate-cards")
async def create_card(body: RateCardIn, user: dict = Depends(require_approved_roles("logistics"))):
    doc = {"_id": str(uuid.uuid4()), **body.model_dump(), "carrier_id": str(user["_id"]),
           "carrier_name": user.get("company_name") or user.get("name", ""), "deleted_at": None, "created_at": now_utc()}
    await db.rate_cards.insert_one(doc)
    return _clean(doc)


@router.patch("/logistics/rate-cards/{card_id}")
async def update_card(card_id: str, body: RateCardIn, user: dict = Depends(require_approved_roles("logistics"))):
    res = await db.rate_cards.update_one({"_id": card_id, "carrier_id": str(user["_id"]), "deleted_at": None},
                                         {"$set": {**body.model_dump(), "updated_at": now_utc()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tariffa non trovata")
    return _clean(await db.rate_cards.find_one({"_id": card_id}))


@router.delete("/logistics/rate-cards/{card_id}")
async def delete_card(card_id: str, user: dict = Depends(require_roles("logistics"))):
    res = await db.rate_cards.update_one({"_id": card_id, "carrier_id": str(user["_id"])}, {"$set": {"deleted_at": now_utc()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tariffa non trovata")
    return {"ok": True}


class QuoteRequest(BaseModel):
    origin_region: str = Field(min_length=1, max_length=60)
    destination_region: str = Field(min_length=1, max_length=60)
    pallets: int = Field(1, ge=1, le=66)
    weight_kg: float = Field(0, ge=0, le=40000)
    cold_chain: bool = False


def _matches(card: dict, q: QuoteRequest) -> bool:
    def ok(card_region: str, wanted: str) -> bool:
        return card_region == "*" or card_region.strip().lower() == wanted.strip().lower()
    return (ok(card["origin_region"], q.origin_region) and ok(card["destination_region"], q.destination_region)
            and (card.get("cold_chain") or not q.cold_chain) and q.pallets <= card.get("max_pallets", 33))


def price_card(card: dict, q: QuoteRequest) -> dict:
    base = q.pallets * float(card["price_per_pallet"]) + q.weight_kg * float(card["price_per_kg"])
    base = max(base, float(card["min_charge"]))
    fuel = base * float(card["fuel_surcharge_pct"]) / 100
    return {"base": round(base, 2), "fuel": round(fuel, 2), "carrier_price": round(base + fuel, 2)}


@router.post("/logistics/instant-quote")
async def instant_quote(body: QuoteRequest, user: dict = Depends(require_roles("producer", "business", "reseller", "admin"))):
    cards = await db.rate_cards.find({"active": True, "deleted_at": None}).to_list(500)
    options = []
    for c in cards:
        if not _matches(c, body):
            continue
        p = price_card(c, body)
        snap = await snapshot_for("transport", p["carrier_price"])
        fee = snap["producer_fee"] if user["role"] == "producer" else 0.0
        options.append({"card_id": c["_id"], "carrier_id": c["carrier_id"], "carrier_name": c["carrier_name"],
                        "card_name": c["name"], "service": c["service"], "transit_days": c["transit_days"],
                        "cold_chain": c.get("cold_chain", False),
                        "breakdown": {**p, "platform_fee": fee, "platform_pct": snap["producer_pct"] if fee else 0,
                                      "total": round(p["carrier_price"] + fee, 2)}})
    options.sort(key=lambda o: o["breakdown"]["total"])
    prices = [o["breakdown"]["total"] for o in options]
    rng = {"min": min(prices), "max": max(prices), "median": round(statistics.median(prices), 2)} if prices else None
    return {"options": options, "range": rng, "count": len(options)}


class BookIn(QuoteRequest):
    card_id: str
    title: str = Field(min_length=3, max_length=120)
    cargo_type: str = Field("Alimentari", max_length=80)
    origin_address: Optional[str] = Field(None, max_length=200)
    destination_address: Optional[str] = Field(None, max_length=200)
    ready_date: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=1000)


@router.post("/logistics/instant-quote/book")
async def book(body: BookIn, user: dict = Depends(require_roles("producer", "business", "reseller"))):
    card = await db.rate_cards.find_one({"_id": body.card_id, "active": True, "deleted_at": None})
    if not card or not _matches(card, body):
        raise HTTPException(status_code=404, detail="Tariffa non disponibile per questa tratta")
    p = price_card(card, body)  # recomputed server-side, never trusted from the client
    snapshot = await snapshot_for("transport", p["carrier_price"])
    if user["role"] != "producer":
        snapshot = {**snapshot, "producer_fee": 0.0, "platform_revenue": snapshot["buyer_fee"], "note": "Prenotazione non da produttore"}
    now = now_utc().isoformat()
    name = user.get("company_name") or user.get("name", "")
    quote = {"id": str(uuid.uuid4()), "company_id": card["carrier_id"], "company_name": card["carrier_name"],
             "price": p["carrier_price"], "transit_days": card["transit_days"], "message": f"Tariffa: {card['name']}",
             "rate_card_id": card["_id"], "breakdown": p, "created_at": now}
    doc = {
        "_id": str(uuid.uuid4()), "title": body.title, "cargo_type": body.cargo_type,
        "origin": f"{body.origin_address + ', ' if body.origin_address else ''}{body.origin_region}",
        "destination": f"{body.destination_address + ', ' if body.destination_address else ''}{body.destination_region}",
        "ready_date": body.ready_date, "weight_kg": body.weight_kg or None, "pallets": body.pallets, "notes": body.notes,
        "shared": False, "cold_chain": body.cold_chain, "service_size": None,
        "creator_id": str(user["_id"]), "creator_name": name, "creator_role": user["role"], "status": "assigned",
        "participants": [{"user_id": str(user["_id"]), "name": name, "role": user["role"]}],
        "quotes": [quote], "carrier_id": card["carrier_id"], "selected_quote_id": quote["id"],
        "commercial_snapshot": snapshot, "booked_by_role": user["role"], "booking_source": "rate_card",
        "tracking_status": "assigned",
        "tracking": [{"id": str(uuid.uuid4()), "status": "assigned", "location": None, "note": card["carrier_name"], "by": name, "at": now}],
        "created_at": now_utc(),
    }
    await db.shipping_requests.insert_one(doc)
    return {"id": doc["_id"], "price": p["carrier_price"], "platform_fee": snapshot["producer_fee"],
            "total": round(p["carrier_price"] + snapshot["producer_fee"], 2)}


async def seed_rate_cards():
    carrier = await db.users.find_one({"email": "logistica@demo.it"})
    if not carrier or await db.rate_cards.count_documents({"carrier_id": str(carrier["_id"])}) > 0:
        return
    base = {"carrier_id": str(carrier["_id"]), "carrier_name": carrier.get("company_name") or carrier.get("name", ""),
            "active": True, "deleted_at": None, "created_at": now_utc()}
    cards = [
        {"name": "Groupage Sicilia → Lombardia", "origin_region": "Sicilia", "destination_region": "Lombardia", "service": "groupage",
         "price_per_pallet": 95, "price_per_kg": 0.02, "min_charge": 120, "fuel_surcharge_pct": 8, "transit_days": 3, "cold_chain": False, "max_pallets": 10},
        {"name": "Refrigerato Sicilia → Italia", "origin_region": "Sicilia", "destination_region": "*", "service": "refrigerated",
         "price_per_pallet": 140, "price_per_kg": 0.03, "min_charge": 180, "fuel_surcharge_pct": 10, "transit_days": 2, "cold_chain": True, "max_pallets": 20},
        {"name": "Camion completo Sicilia → Lazio", "origin_region": "Sicilia", "destination_region": "Lazio", "service": "ftl",
         "price_per_pallet": 0, "price_per_kg": 0, "min_charge": 1450, "fuel_surcharge_pct": 9, "transit_days": 2, "cold_chain": False, "max_pallets": 33},
    ]
    await db.rate_cards.insert_many([{"_id": str(uuid.uuid4()), **base, **c} for c in cards])
