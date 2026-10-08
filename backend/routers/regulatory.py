"""Regulatory Intelligence Engine (core) for RA MIA Trade Assistant.

Minimum working path: SOURCE -> DOCUMENT -> VERSION -> REQUIREMENT -> KNOWLEDGE BASE
-> (consumed by) MARKET ANALYSIS / COMPLIANCE CHECK -> REGULATORY SNAPSHOT.

No fabricated normative data: requirements are only what an admin registers and are always
linked to a source (+document version). Demo records are explicitly flagged is_demo=True.
Confidence is explainable (computed from real factors), and conflicting sources are surfaced,
never silently resolved.
"""
import asyncio
import hashlib
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from models import (
    MonitorIn, RegDocIn, RegDocVersionIn, RequirementIn, SourceIn, SourceUpdateIn, now_utc,
)
from routers.push import send_push
from security import current_user, require_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/regulatory", tags=["regulatory"])

RECENT_YEARS = 3
CHANGE_SWEEP_INTERVAL = 6 * 3600  # periodic auto change-detection cadence (seconds)
_detector_task: "asyncio.Task | None" = None


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


# --------------------------- Alert engine ---------------------------

def _clean_alert(a: dict, read: bool = False) -> dict:
    d = _clean(a)
    d["read"] = read
    return d


async def _matching_monitor_producers(country: str, category: str | None) -> list[str]:
    """Producer ids monitoring this country (category-agnostic if the alert has no category,
    or if the monitor itself has no category)."""
    q: dict = {"country": {"$regex": f"^{country}$", "$options": "i"}}
    monitors = await db.reg_monitors.find(q).to_list(1000)
    ids = set()
    for m in monitors:
        mcat = (m.get("category") or "").lower()
        acat = (category or "").lower()
        if not acat or not mcat or mcat == acat:
            ids.add(m["producer_id"])
    return list(ids)


async def create_alert(alert_type: str, country: str, category: str | None, title: str,
                       detail: str, *, severity: str = "medium", diff: dict | None = None,
                       source_id: str | None = None, document_id: str | None = None,
                       requirement_id: str | None = None, is_demo: bool = False,
                       needs_verification: bool = False) -> str:
    alert_id = str(uuid.uuid4())
    doc = {
        "_id": alert_id, "type": alert_type, "country": country, "category": category,
        "title": title, "detail": detail, "severity": severity, "diff": diff,
        "source_id": source_id, "document_id": document_id, "requirement_id": requirement_id,
        "is_demo": is_demo, "needs_verification": needs_verification,
        "created_at": now_utc(),
    }
    await db.reg_alerts.insert_one(doc)
    producers = await _matching_monitor_producers(country, category)
    if producers:
        try:
            await send_push(
                recipients=producers,
                data={"title": f"Avviso normativo · {country}", "message": title,
                      "action_url": "/trade/alerts"},
                idempotency_key=f"regalert-{alert_id}",
            )
        except Exception as e:  # push must never block alert creation
            logger.warning("push for alert %s failed: %s", alert_id, e)
    return alert_id


# --------------------------- Change detector (official sources) ---------------------------

def _extract_text(html: str) -> str:
    """Very small HTML->text normalizer for fingerprinting (MVP, honest about limits)."""
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def check_source_for_changes(source: dict) -> dict | None:
    """Fetch a source URL, fingerprint its visible text, and raise an alert if it changed
    versus the last stored fingerprint. First observation only establishes the baseline."""
    url = source.get("url")
    if not url:
        return None
    now = now_utc()
    content = None
    reachable = False
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "RaMiaRegulatoryBot/1.0"})
        reachable = r.status_code < 400
        if reachable:
            content = _extract_text(r.text)
    except Exception as e:
        logger.info("change-detector unreachable %s: %s", source["_id"], e)

    upd: dict = {"content_checked_at": now, "reachable": reachable, "updated_at": now}
    result = None
    if content:
        fp = _hash(content)
        prev = source.get("content_fingerprint")
        upd["content_fingerprint"] = fp
        if prev and prev != fp:
            alert_id = await create_alert(
                "source_change", source.get("country", ""), source.get("category"),
                f"Possibile modifica alla fonte: {source.get('name')}",
                ("È stata rilevata una variazione nel contenuto della pagina ufficiale. "
                 "Richiede verifica da parte dell'amministratore prima di aggiornare i requisiti."),
                severity="high", source_id=source["_id"],
                is_demo=source.get("is_demo", False), needs_verification=True,
            )
            result = {"source_id": source["_id"], "alert_id": alert_id, "name": source.get("name")}
    await db.reg_sources.update_one({"_id": source["_id"]}, {"$set": upd})
    return result


async def run_change_detection() -> dict:
    """Sweep all non-disabled sources. Returns summary of detected changes."""
    sources = await db.reg_sources.find({"status": {"$ne": "disabled"}}).to_list(500)
    changes = []
    for s in sources:
        try:
            res = await check_source_for_changes(s)
            if res:
                changes.append(res)
        except Exception as e:  # pragma: no cover
            logger.warning("change-detector error for %s: %s", s.get("_id"), e)
    logger.info("change-detection: %s source(s) scanned, %s change(s)", len(sources), len(changes))
    return {"scanned": len(sources), "changes": changes, "changes_count": len(changes)}


async def _detector_loop():
    while True:
        await asyncio.sleep(CHANGE_SWEEP_INTERVAL)
        try:
            await run_change_detection()
        except Exception as e:  # pragma: no cover
            logger.error("change-detector loop error: %s", e)


async def start_change_detector():
    """Baseline sweep on startup + periodic auto-detection (called from app lifespan)."""
    global _detector_task
    try:
        await run_change_detection()
    except Exception as e:  # pragma: no cover
        logger.error("startup change-detection error: %s", e)
    if _detector_task is None or _detector_task.done():
        _detector_task = asyncio.create_task(_detector_loop())


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
    await create_alert(
        "version", doc.get("country", ""), doc.get("category"),
        f"Nuova versione del documento: {doc.get('title')}",
        body.note or "È stata pubblicata una nuova versione del documento normativo.",
        severity="high", diff=diff, document_id=document_id, source_id=doc.get("source_id"),
        is_demo=doc.get("is_demo", False),
    )
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
    await create_alert(
        "requirement_new", body.country, body.category,
        f"Nuovo requisito ({body.requirement_type}) per {body.country}",
        body.description[:300], severity=body.severity,
        requirement_id=doc["_id"], source_id=body.source_id, document_id=body.document_id,
        is_demo=is_demo,
    )
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
    await create_alert(
        "requirement_verified", r.get("country", ""), r.get("category"),
        f"Requisito verificato ({r.get('requirement_type')}) per {r.get('country')}",
        "Un amministratore ha verificato ufficialmente questo requisito.",
        severity="low", requirement_id=req_id, source_id=r.get("source_id"),
    )
    return {"ok": True, "verification_status": "HUMAN_VERIFIED"}


# --------------------------- Monitors (producer "follow") ---------------------------

@router.post("/monitors")
async def create_monitor(body: MonitorIn, user: dict = Depends(require_roles("producer", "admin"))):
    pid = str(user["_id"])
    category = body.category
    product_name = None
    if body.product_id:
        p = await db.products.find_one({"_id": body.product_id})
        if p:
            category = category or p.get("category")
            product_name = p.get("name")
    existing = await db.reg_monitors.find_one({
        "producer_id": pid, "country": {"$regex": f"^{body.country}$", "$options": "i"},
        "product_id": body.product_id,
    })
    if existing:
        return _clean(existing)
    doc = {
        "_id": str(uuid.uuid4()), "producer_id": pid, "product_id": body.product_id,
        "product_name": product_name, "country": body.country, "category": category,
        "created_at": now_utc(),
    }
    await db.reg_monitors.insert_one(doc)
    return _clean(doc)


@router.get("/monitors")
async def list_monitors(user: dict = Depends(require_roles("producer", "admin"))):
    q = {} if user["role"] == "admin" else {"producer_id": str(user["_id"])}
    docs = await db.reg_monitors.find(q).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.delete("/monitors/{monitor_id}")
async def delete_monitor(monitor_id: str, user: dict = Depends(require_roles("producer", "admin"))):
    q = {"_id": monitor_id}
    if user["role"] != "admin":
        q["producer_id"] = str(user["_id"])
    res = await db.reg_monitors.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Monitoraggio non trovato")
    return {"ok": True}


# --------------------------- Alerts ---------------------------

async def _alerts_for_producer(pid: str) -> list[dict]:
    monitors = await db.reg_monitors.find({"producer_id": pid}).to_list(500)
    if not monitors:
        return []
    ors = []
    for m in monitors:
        clause: dict = {"country": {"$regex": f"^{m['country']}$", "$options": "i"}}
        if m.get("category"):
            clause["$or"] = [{"category": None}, {"category": {"$regex": f"^{m['category']}$", "$options": "i"}}]
        ors.append(clause)
    return await db.reg_alerts.find({"$or": ors}).sort("created_at", -1).to_list(200)


@router.get("/alerts")
async def list_alerts(user: dict = Depends(require_roles("producer", "admin")),
                      type: str | None = Query(None), severity: str | None = Query(None)):
    if user["role"] == "admin":
        q: dict = {}
        if type:
            q["type"] = type
        if severity:
            q["severity"] = severity
        docs = await db.reg_alerts.find(q).sort("created_at", -1).to_list(300)
        reads = set()
    else:
        pid = str(user["_id"])
        docs = await _alerts_for_producer(pid)
        if type:
            docs = [a for a in docs if a.get("type") == type]
        if severity:
            docs = [a for a in docs if a.get("severity") == severity]
        read_docs = await db.reg_alert_reads.find({"producer_id": pid}).to_list(1000)
        reads = {r["alert_id"] for r in read_docs}
    return [_clean_alert(a, read=a["_id"] in reads) for a in docs]


@router.post("/alerts/read-all")
async def mark_all_read(user: dict = Depends(require_roles("producer", "admin"))):
    if user["role"] == "admin":
        return {"ok": True, "marked": 0}
    pid = str(user["_id"])
    docs = await _alerts_for_producer(pid)
    now = now_utc()
    marked = 0
    for a in docs:
        await db.reg_alert_reads.update_one(
            {"producer_id": pid, "alert_id": a["_id"]},
            {"$set": {"producer_id": pid, "alert_id": a["_id"], "at": now}},
            upsert=True,
        )
        marked += 1
    return {"ok": True, "marked": marked}


@router.get("/alerts/unread-count")
async def unread_count(user: dict = Depends(require_roles("producer", "admin"))):
    if user["role"] == "admin":
        return {"count": await db.reg_alerts.count_documents({})}
    pid = str(user["_id"])
    docs = await _alerts_for_producer(pid)
    read_docs = await db.reg_alert_reads.find({"producer_id": pid}).to_list(1000)
    reads = {r["alert_id"] for r in read_docs}
    return {"count": sum(1 for a in docs if a["_id"] not in reads)}


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, user: dict = Depends(require_roles("producer", "admin"))):
    pid = str(user["_id"])
    await db.reg_alert_reads.update_one(
        {"producer_id": pid, "alert_id": alert_id},
        {"$set": {"producer_id": pid, "alert_id": alert_id, "at": now_utc()}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/change-detection/run")
async def change_detection_run(user: dict = Depends(require_roles("admin"))):
    """Manually trigger a change-detection sweep over official sources."""
    return await run_change_detection()


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
        "changes_detected": await db.reg_alerts.count_documents({"type": "source_change"}),
        "alerts_generated": await db.reg_alerts.count_documents({}),
        "monitors": await db.reg_monitors.count_documents({}),
    }


@router.get("/audit")
async def audit_log(user: dict = Depends(require_roles("admin"))):
    docs = await db.reg_audit_logs.find({}).sort("at", -1).to_list(100)
    return [_clean(d) for d in docs]
