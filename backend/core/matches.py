"""Match Registry: append-only, hash-chained log of first contacts producer <-> buyer.

One "introduction" entry per pair (the FIRST contact through 'Ra mia). Entries are never updated or
deleted; each one stores the hash of the previous entry so any tampering breaks the chain (verify_chain).
The introduction window (months) is read from the active commercial rules and frozen on the entry.
"""
import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo.errors import DuplicateKeyError

from db import db
from models import now_utc
from core.rules import get_active_rules

_lock = asyncio.Lock()
GENESIS = "0" * 64


def _iso(v) -> str:
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()
    return str(v)


def entry_hash(e: dict) -> str:
    payload = {k: _iso(e[k]) if isinstance(e.get(k), datetime) else e.get(k) for k in (
        "seq", "producer_id", "buyer_id", "source", "source_id", "first_contact_at",
        "window_months", "expires_at", "rules_version", "prev_hash")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


async def ensure_indexes():
    await db.match_registry.create_index([("producer_id", 1), ("buyer_id", 1)], unique=True)
    await db.match_registry.create_index("seq", unique=True)


async def register_match(producer_id: str, buyer_id: str, source: str, source_id: str,
                         at: Optional[datetime] = None) -> Optional[dict]:
    """Idempotent: returns the existing entry if the pair was already introduced."""
    if not producer_id or not buyer_id or producer_id == buyer_id:
        return None
    existing = await db.match_registry.find_one({"producer_id": producer_id, "buyer_id": buyer_id})
    if existing:
        return existing
    rules = await get_active_rules()
    window = int(rules["services"]["introduction"].get("window_months") or 0)
    first = at or now_utc()
    first = first if first.tzinfo else first.replace(tzinfo=timezone.utc)
    first = first.replace(microsecond=first.microsecond // 1000 * 1000)  # Mongo stores milliseconds
    async with _lock:
        last = await db.match_registry.find_one({}, sort=[("seq", -1)])
        entry = {
            "_id": str(uuid.uuid4()), "seq": (last["seq"] + 1) if last else 1,
            "producer_id": producer_id, "buyer_id": buyer_id, "source": source, "source_id": source_id,
            "first_contact_at": first, "window_months": window,
            "expires_at": first + timedelta(days=round(window * 30.44)),
            "rules_version": rules["version"], "prev_hash": last["hash"] if last else GENESIS,
            "recorded_at": now_utc(),
        }
        entry["hash"] = entry_hash(entry)
        try:
            await db.match_registry.insert_one(entry)
        except DuplicateKeyError:
            return await db.match_registry.find_one({"producer_id": producer_id, "buyer_id": buyer_id})
    return entry


async def verify_chain() -> dict:
    prev, count = GENESIS, 0
    async for e in db.match_registry.find({}).sort("seq", 1):
        count += 1
        if e.get("prev_hash") != prev or entry_hash(e) != e.get("hash") or e["seq"] != count:
            return {"valid": False, "entries": count, "broken_at_seq": e.get("seq")}
        prev = e["hash"]
    return {"valid": True, "entries": count, "broken_at_seq": None}


async def backfill():
    """Registers historical first contacts (negotiations, RFQ responses, orders) once."""
    events = []
    async for n in db.negotiations.find({}, {"producer_id": 1, "business_id": 1, "created_at": 1}):
        events.append((n.get("created_at"), n.get("producer_id"), n.get("business_id"), "negotiation", n["_id"]))
    async for r in db.rfqs.find({"responses.0": {"$exists": True}}):
        for resp in r.get("responses", []):
            events.append((datetime.fromisoformat(resp["created_at"]), resp["producer_id"], r["buyer_id"], "rfq_response", r["_id"]))
    events = [e for e in events if isinstance(e[0], datetime)]
    events.sort(key=lambda e: e[0] if e[0].tzinfo else e[0].replace(tzinfo=timezone.utc))
    for at, pid, bid, src, sid in events:
        await register_match(pid, bid, src, sid, at)
