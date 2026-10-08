"""Regulatory Intelligence Engine (core) for RA MIA Trade Assistant.

Minimum working path: SOURCE -> DOCUMENT -> VERSION -> REQUIREMENT -> KNOWLEDGE BASE
-> (consumed by) MARKET ANALYSIS / COMPLIANCE CHECK -> REGULATORY SNAPSHOT.

No fabricated normative data: requirements are only what an admin registers and are always
linked to a source (+document version). Demo records are explicitly flagged is_demo=True.
Confidence is explainable (computed from real factors), and conflicting sources are surfaced,
never silently resolved.
"""
import hashlib
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import (
    RegDocIn, RegDocVersionIn, RequirementIn, SourceIn, SourceUpdateIn, now_utc,
)
from security import current_user, require_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/regulatory", tags=["regulatory"])

RECENT_YEARS = 3


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


async def _audit(actor: dict, action: str, entity: str, entity_id: str, before=None, after=None, reason=None):
    await db.reg_audit_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "actor_id": str(actor["_id"]), "actor_email": actor.get("email"),
        "action": action, "entity": entity, "entity_id": entity_id,
        "before": before, "after": after, "reason": reason, "at": now_utc(),
    })


def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    d = dict(doc)
    d["id"] = str(d.pop("_id"))
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


# --------------------------- Confidence & conflict ---------------------------

def _recency_ok(effective_date) -> bool:
    if not effective_date:
        return False
    try:
        y = int(str(effective_date)[:4])
        return y >= (datetime.now(timezone.utc).year - RECENT_YEARS)
    except Exception:
        return False


def build_confidence(req: dict, country_match: bool, category_match: bool,
                     product_match: bool, conflict: bool) -> dict:
    """Explainable confidence from real factors, not an arbitrary AI percentage."""
    reasons = []
    score = 0
    rel = req.get("source_reliability", "D")
    if rel == "A":
        score += 3; reasons.append("Fonte primaria ufficiale (A)")
    elif rel == "B":
        score += 2; reasons.append("Fonte istituzionale/autorevole (B)")
    elif rel == "C":
        score += 1; reasons.append("Fonte secondaria (C)")
    else:
        reasons.append("Fonte non verificata (D)")
    if req.get("verification_status") == "HUMAN_VERIFIED":
        score += 2; reasons.append("Verificata da un amministratore")
    if _recency_ok(req.get("effective_date")):
        score += 1; reasons.append("Documento recente")
    if country_match:
        score += 1; reasons.append("Corrispondenza paese")
    if category_match:
        score += 1; reasons.append("Corrispondenza categoria")
    if product_match:
        score += 1; reasons.append("Corrispondenza prodotto/HS code")
    if req.get("document_id"):
        reasons.append("Collegata a versione documento")
    if req.get("is_demo"):
        reasons.append("DEMO DATA (non normativa reale)")
    if conflict:
        score -= 2; reasons.append("Possibile conflitto tra fonti")

    if req.get("is_demo") or rel == "D":
        level = "UNVERIFIED"
    elif conflict:
        level = "LOW"
    elif score >= 6:
        level = "HIGH"
    elif score >= 4:
        level = "MEDIUM"
    else:
        level = "LOW"
    return {"level": level, "reasons": reasons}


def detect_conflicts(reqs: list[dict]) -> list[dict]:
    """Flag requirements of the same (type) whose descriptions differ across distinct sources."""
    conflicts = []
    by_type: dict = {}
    for r in reqs:
        by_type.setdefault(r["requirement_type"], []).append(r)
    for rtype, group in by_type.items():
        sources = {r.get("source_id") for r in group}
        descs = {(r.get("description") or "").strip().lower() for r in group}
        if len(sources) > 1 and len(descs) > 1:
            conflicts.append({
                "requirement_type": rtype,
                "entries": [{"source": r.get("source_name"), "description": r.get("description")} for r in group],
                "status": "Richiede verifica",
                "note": "Verificare con l'autorità competente o un professionista qualificato.",
            })
    return conflicts


# --------------------------- Knowledge Base query (used by Trade Assistant) ---------------------------

async def kb_requirements_for(country: str, category: str | None, hs_code: str | None = None) -> dict:
    """Return verified+demo requirements relevant to (country, category) with source metadata,
    computed confidence and detected conflicts. Honest: empty when no source available."""
    q: dict = {"country": {"$regex": f"^{country}$", "$options": "i"}, "active": True}
    docs = await db.reg_requirements.find(q).to_list(200)
    out = []
    source_ids = {d["source_id"] for d in docs if d.get("source_id")}
    sources = {}
    for sid in source_ids:
        s = await db.reg_sources.find_one({"_id": sid})
        if s:
            sources[sid] = s
    for d in docs:
        s = sources.get(d.get("source_id")) or {}
        cat_match = bool(category) and ((d.get("category") or "").lower() == (category or "").lower())
        hs_match = bool(hs_code) and bool(d.get("hs_code")) and d.get("hs_code") == hs_code
        enriched = {
            **d,
            "id": str(d["_id"]),
            "source_name": s.get("name"),
            "source_authority": s.get("authority"),
            "source_url": s.get("url"),
            "source_reliability": s.get("reliability", "D"),
            "source_last_verified": _iso(s.get("last_checked")),
            "country_match": True,
            "category_match": cat_match,
            "product_match": hs_match,
        }
        out.append(enriched)
    # keep category matches (or all if none match category) to avoid dropping country-wide rules
    cat_filtered = [r for r in out if not category or r["category_match"] or not r.get("category")]
    use = cat_filtered or out
    conflicts = detect_conflicts(use)
    conflict_types = {c["requirement_type"] for c in conflicts}
    for r in use:
        r.pop("_id", None)
        r["confidence"] = build_confidence(
            r, r["country_match"], r["category_match"], r["product_match"],
            r["requirement_type"] in conflict_types,
        )
        for k, v in list(r.items()):
            if isinstance(v, datetime):
                r[k] = v.isoformat()
    source_list = [{
        "id": str(s["_id"]), "name": s.get("name"), "authority": s.get("authority"),
        "url": s.get("url"), "reliability": s.get("reliability"),
        "last_verified": _iso(s.get("last_checked")), "is_demo": s.get("is_demo", False),
        "status": s.get("status"),
    } for s in sources.values()]
    return {"requirements": use, "sources": source_list, "conflicts": conflicts}


async def create_snapshot(analysis_id: str, country: str, category: str | None, kb: dict) -> str:
    snap_id = str(uuid.uuid4())
    await db.reg_snapshots.insert_one({
        "_id": snap_id,
        "analysis_id": analysis_id,
        "country": country,
        "category": category,
        "sources_used": kb.get("sources", []),
        "requirement_ids": [r["id"] for r in kb.get("requirements", [])],
        "requirements_count": len(kb.get("requirements", [])),
        "sources_count": len(kb.get("sources", [])),
        "conflicts_count": len(kb.get("conflicts", [])),
        "has_official_source": any(s.get("reliability") in ("A", "B") and not s.get("is_demo") for s in kb.get("sources", [])),
        "created_at": now_utc(),
    })
    return snap_id


# --------------------------- Sources ---------------------------

@router.post("/sources")
async def create_source(body: SourceIn, user: dict = Depends(require_roles("admin"))):
    now = now_utc()
    doc = {
        "_id": str(uuid.uuid4()), **body.model_dump(),
        "status": "to_verify", "last_checked": None, "next_check": None,
        "reachable": None, "created_at": now, "updated_at": now,
    }
    await db.reg_sources.insert_one(doc)
    await _audit(user, "create", "source", doc["_id"], after=body.model_dump())
    return _clean(doc)


@router.get("/sources")
async def list_sources(user: dict = Depends(require_roles("admin")),
                       country: str | None = None, reliability: str | None = None,
                       status: str | None = None):
    q: dict = {}
    if country:
        q["country"] = {"$regex": f"^{country}$", "$options": "i"}
    if reliability:
        q["reliability"] = reliability
    if status:
        q["status"] = status
    docs = await db.reg_sources.find(q).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.patch("/sources/{source_id}")
async def update_source(source_id: str, body: SourceUpdateIn, user: dict = Depends(require_roles("admin"))):
    before = await db.reg_sources.find_one({"_id": source_id})
    if not before:
        raise HTTPException(status_code=404, detail="Fonte non trovata")
    upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    upd["updated_at"] = now_utc()
    await db.reg_sources.update_one({"_id": source_id}, {"$set": upd})
    await _audit(user, "update", "source", source_id, before=_clean(before), after=upd)
    return _clean(await db.reg_sources.find_one({"_id": source_id}))


@router.post("/sources/{source_id}/verify")
async def verify_source(source_id: str, user: dict = Depends(require_roles("admin"))):
    """Check reachability only. Reachability != regulatory freshness (kept distinct)."""
    s = await db.reg_sources.find_one({"_id": source_id})
    if not s:
        raise HTTPException(status_code=404, detail="Fonte non trovata")
    reachable = False
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            r = await client.get(s["url"])
        reachable = r.status_code < 400
    except Exception as e:
        logger.info("source %s unreachable: %s", source_id, e)
    now = now_utc()
    status = s.get("status")
    if status != "disabled":
        status = "active" if reachable else "unreachable"
    await db.reg_sources.update_one({"_id": source_id}, {"$set": {
        "reachable": reachable, "last_checked": now, "status": status, "updated_at": now,
    }})
    await _audit(user, "verify", "source", source_id, after={"reachable": reachable})
    return {"reachable": reachable, "status": status, "last_checked": now.isoformat(),
            "note": "La raggiungibilità dell'URL non implica l'aggiornamento normativo."}


# --------------------------- Documents & versions ---------------------------

@router.post("/documents")
async def create_document(body: RegDocIn, user: dict = Depends(require_roles("admin"))):
    src = await db.reg_sources.find_one({"_id": body.source_id})
    if not src:
        raise HTTPException(status_code=404, detail="Fonte non trovata")
    now = now_utc()
    doc_id = str(uuid.uuid4())
    fingerprint = _hash(body.content)
    doc = {
        "_id": doc_id, "source_id": body.source_id, "title": body.title,
        "url": body.url or src.get("url"), "country": body.country,
        "category": body.category, "language": body.language,
        "published_date": body.published_date, "effective_date": body.effective_date,
        "abrogated_date": None, "current_version": 1, "status": "active",
        "is_demo": body.is_demo or src.get("is_demo", False),
        "acquired_at": now, "last_verified": now, "updated_at": now,
    }
    await db.reg_documents.insert_one(doc)
    await db.reg_doc_versions.insert_one({
        "_id": str(uuid.uuid4()), "document_id": doc_id, "version": 1,
        "content": body.content, "fingerprint": fingerprint,
        "effective_date": body.effective_date, "note": "versione iniziale", "created_at": now,
    })
    await _audit(user, "create", "document", doc_id, after={"title": body.title, "version": 1})
    return _clean(doc)


@router.post("/documents/{document_id}/versions")
async def add_version(document_id: str, body: RegDocVersionIn, user: dict = Depends(require_roles("admin"))):
    doc = await db.reg_documents.find_one({"_id": document_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    fingerprint = _hash(body.content)
    last = await db.reg_doc_versions.find({"document_id": document_id}).sort("version", -1).to_list(1)
    prev = last[0] if last else None
    if prev and prev.get("fingerprint") == fingerprint:
        raise HTTPException(status_code=409, detail="Contenuto identico alla versione corrente")
    new_v = (prev["version"] if prev else 0) + 1
    now = now_utc()
    await db.reg_doc_versions.insert_one({
        "_id": str(uuid.uuid4()), "document_id": document_id, "version": new_v,
        "content": body.content, "fingerprint": fingerprint,
        "effective_date": body.effective_date, "note": body.note, "created_at": now,
    })
    await db.reg_documents.update_one({"_id": document_id}, {"$set": {
        "current_version": new_v, "updated_at": now, "last_verified": now,
        "effective_date": body.effective_date or doc.get("effective_date"),
    }})
    diff = _diff_versions(prev.get("content") if prev else "", body.content)
    await _audit(user, "version", "document", document_id, before={"version": prev["version"] if prev else 0},
                 after={"version": new_v})
    return {"document_id": document_id, "version": new_v, "diff": diff}


def _diff_versions(old: str, new: str) -> dict:
    old_lines = {l.strip() for l in old.splitlines() if l.strip()}
    new_lines = {l.strip() for l in new.splitlines() if l.strip()}
    return {
        "added": sorted(new_lines - old_lines)[:50],
        "removed": sorted(old_lines - new_lines)[:50],
    }


@router.get("/documents")
async def list_documents(user: dict = Depends(require_roles("admin")), country: str | None = None):
    q = {"country": {"$regex": f"^{country}$", "$options": "i"}} if country else {}
    docs = await db.reg_documents.find(q).sort("updated_at", -1).to_list(300)
    return [_clean(d) for d in docs]


@router.get("/documents/{document_id}/versions")
async def list_versions(document_id: str, user: dict = Depends(require_roles("admin"))):
    docs = await db.reg_doc_versions.find({"document_id": document_id}).sort("version", 1).to_list(100)
    return [_clean(d) for d in docs]


# --------------------------- Requirements ---------------------------

@router.post("/requirements")
async def create_requirement(body: RequirementIn, user: dict = Depends(require_roles("admin"))):
    src = await db.reg_sources.find_one({"_id": body.source_id})
    if not src:
        raise HTTPException(status_code=404, detail="Fonte non trovata")
    doc_version = None
    if body.document_id:
        doc = await db.reg_documents.find_one({"_id": body.document_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Documento non trovato")
        doc_version = doc.get("current_version")
    now = now_utc()
    is_demo = body.is_demo or src.get("is_demo", False)
    doc = {
        "_id": str(uuid.uuid4()), **body.model_dump(),
        "is_demo": is_demo,
        "source_name": src.get("name"), "source_reliability": src.get("reliability", "D"),
        "document_version": doc_version,
        "verification_status": "DEMO" if is_demo else "AI_DETECTED",
        "active": True, "last_verified": now, "confidence_hint": None,
        "created_at": now, "updated_at": now,
    }
    await db.reg_requirements.insert_one(doc)
    await _audit(user, "create", "requirement", doc["_id"], after={"type": body.requirement_type, "country": body.country})
    return _clean(doc)


@router.get("/requirements")
async def list_requirements(user: dict = Depends(require_roles("admin")),
                            country: str | None = None, category: str | None = None):
    q: dict = {"active": True}
    if country:
        q["country"] = {"$regex": f"^{country}$", "$options": "i"}
    if category:
        q["category"] = {"$regex": f"^{category}$", "$options": "i"}
    docs = await db.reg_requirements.find(q).sort("created_at", -1).to_list(300)
    return [_clean(d) for d in docs]


@router.post("/requirements/{req_id}/verify")
async def verify_requirement(req_id: str, user: dict = Depends(require_roles("admin"))):
    r = await db.reg_requirements.find_one({"_id": req_id})
    if not r:
        raise HTTPException(status_code=404, detail="Requisito non trovato")
    if r.get("is_demo"):
        raise HTTPException(status_code=400, detail="Un requisito DEMO non può essere verificato come reale")
    await db.reg_requirements.update_one({"_id": req_id}, {"$set": {
        "verification_status": "HUMAN_VERIFIED", "last_verified": now_utc(),
    }})
    await _audit(user, "verify", "requirement", req_id, reason="human_verified")
    return {"ok": True, "verification_status": "HUMAN_VERIFIED"}


# --------------------------- Knowledge Base (producer read) ---------------------------

@router.get("/knowledge")
async def knowledge(country: str, category: str | None = None,
                    user: dict = Depends(require_roles("producer", "admin"))):
    """Producer-facing KB lookup: verified/demo requirements + sources + confidence + conflicts."""
    return await kb_requirements_for(country, category)


# --------------------------- Snapshots ---------------------------

@router.get("/snapshots/{analysis_id}")
async def get_snapshot(analysis_id: str, user: dict = Depends(current_user)):
    snap = await db.reg_snapshots.find_one({"analysis_id": analysis_id})
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot non trovato")
    # ownership: analysis must belong to the user (or admin)
    an = await db.trade_analyses.find_one({"_id": analysis_id})
    if an and user["role"] != "admin" and an.get("producer_id") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return _clean(snap)


# --------------------------- Admin Regulatory Center ---------------------------

@router.get("/center")
async def regulatory_center(user: dict = Depends(require_roles("admin"))):
    sources_active = await db.reg_sources.count_documents({"status": "active"})
    sources_to_verify = await db.reg_sources.count_documents({"status": "to_verify"})
    sources_unreachable = await db.reg_sources.count_documents({"status": "unreachable"})
    return {
        "sources_active": sources_active,
        "sources_to_verify": sources_to_verify,
        "sources_unreachable": sources_unreachable,
        "sources_total": await db.reg_sources.count_documents({}),
        "documents": await db.reg_documents.count_documents({}),
        "requirements": await db.reg_requirements.count_documents({"active": True}),
        "requirements_demo": await db.reg_requirements.count_documents({"active": True, "is_demo": True}),
        "snapshots": await db.reg_snapshots.count_documents({}),
        "changes_detected": 0,
        "alerts_generated": 0,
    }


@router.get("/audit")
async def audit_log(user: dict = Depends(require_roles("admin"))):
    docs = await db.reg_audit_logs.find({}).sort("at", -1).to_list(100)
    return [_clean(d) for d in docs]
