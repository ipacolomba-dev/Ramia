import asyncio
import json
import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from routers.advisor import _llm_chat, _perplexity_context
from routers.regulatory import create_snapshot, kb_requirements_for
from db import db
from models import (
    ExportPlanCreateIn, FindBuyersIn, StepToggleIn, TradeComplianceIn,
    TradeFindMarketsIn, TradeMarketIn, now_utc,
)
from security import require_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trade", tags=["trade"])

COMPLIANCE_FIELDS = ["ingredients", "allergens", "shelf_life", "net_weight", "packaging", "hs_code"]

# --- Durability of async market analyses ---
# A single run can't hang forever; stale pending docs are recovered/retried; failures become "error".
WORKER_TIMEOUT = 150        # max seconds for one analysis run before it's treated as failed
MAX_ATTEMPTS = 3            # total attempts before giving up (-> status "error")
STALE_SECONDS = 210         # a pending doc untouched for this long is considered orphaned/stuck
SWEEP_INTERVAL = 60         # periodic recovery sweep cadence
RETRY_DELAY = 5             # in-process delay before a controlled retry

DISCLAIMER = (
    "Le informazioni fornite dall'AI hanno finalità informative e operative e non sostituiscono "
    "il parere di autorità doganali, sanitarie, consulenti specializzati o professionisti qualificati."
)


def _parse_json(raw: str) -> dict:
    txt = (raw if isinstance(raw, str) else str(raw)).strip()
    if txt.startswith("```"):
        txt = txt.strip("`")
        txt = txt.replace("json", "", 1)
    start, end = txt.find("{"), txt.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(txt[start:end + 1])
    except Exception:
        return {}


async def _owned_product(product_id: str, user: dict) -> dict:
    q = {"_id": product_id, "deleted_at": None}
    if user["role"] != "admin":
        q["producer_id"] = str(user["_id"])
    doc = await db.products.find_one(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    return doc


def _product_ctx(p: dict, extra: dict | None) -> tuple[dict, list[str]]:
    ctx = {
        "name": p.get("name"),
        "category": p.get("category"),
        "description": p.get("description"),
        "unit": p.get("unit"),
        "origin": p.get("origin_region"),
        "ingredients": p.get("ingredients"),
        "allergens": p.get("allergens"),
        "shelf_life": p.get("shelf_life"),
        "net_weight": p.get("net_weight"),
        "packaging": p.get("packaging"),
        "hs_code": p.get("hs_code"),
    }
    if extra:
        for k, v in extra.items():
            if v:
                ctx[k] = v
    missing = [f for f in ["ingredients", "allergens", "shelf_life", "net_weight", "packaging"] if not ctx.get(f)]
    return ctx, missing


async def _producer_ctx(product: dict) -> dict:
    pid = product.get("producer_id")
    prod = (await db.users.find_one({"_id": pid})) if pid else None
    prod = prod or product
    return {
        "company_name": prod.get("company_name") or prod.get("name"),
        "country": "Italia",
        "region": prod.get("region"),
        "city": prod.get("city"),
        "certifications": [c.get("name") for c in (prod.get("certifications") or []) if c.get("name")],
    }


def _reliability_from_sources(live: bool) -> str:
    return "verified" if live else "unverified"


def _kb_context(kb: dict) -> str:
    """Build an LLM context block from verified/demo requirements in the Knowledge Base."""
    reqs = kb.get("requirements") or []
    if not reqs:
        return ("DATABASE NORMATIVO ’Ra mia: nessun requisito ufficiale verificato disponibile per questo "
                "paese/prodotto. Dove non hai una base certa scrivi esattamente "
                "'Fonte ufficiale non disponibile/verificata'.")
    lines = []
    for r in reqs[:40]:
        src = r.get("source_name") or "fonte"
        rel = r.get("source_reliability") or "D"
        demo = " [DEMO]" if r.get("is_demo") else ""
        lines.append(f"- [{r.get('requirement_type')}] {r.get('description')} "
                     f"(Fonte: {src}, affidabilità {rel}{demo})")
    txt = ("REQUISITI DAL DATABASE NORMATIVO ’Ra mia (usali come base autorevole e cita le relative fonti; "
           "i record [DEMO] sono di riferimento e da verificare):\n" + "\n".join(lines))
    conflicts = kb.get("conflicts") or []
    if conflicts:
        txt += "\n\nCONFLITTI TRA FONTI (segnalali, NON risolverli arbitrariamente):\n" + "\n".join(
            f"- {c['requirement_type']}: fonti discordanti, richiede verifica" for c in conflicts)
    return txt


def _kb_public(kb: dict) -> dict:
    """Trimmed KB payload surfaced to the client (requirements + sources + conflicts + provenance)."""
    sources = kb.get("sources") or []
    return {
        "requirements": [
            {
                "id": r.get("id"), "requirement_type": r.get("requirement_type"),
                "description": r.get("description"), "severity": r.get("severity"),
                "source_name": r.get("source_name"), "source_url": r.get("source_url"),
                "source_reliability": r.get("source_reliability"),
                "is_demo": r.get("is_demo"), "verification_status": r.get("verification_status"),
                "confidence": r.get("confidence"),
            }
            for r in (kb.get("requirements") or [])
        ],
        "sources": sources,
        "conflicts": kb.get("conflicts") or [],
        "has_official_source": any(
            s.get("reliability") in ("A", "B") and not s.get("is_demo") for s in sources
        ),
    }


# ----------------------------- Market analysis -----------------------------

MARKET_SYSTEM = (
    "Sei RA MIA Trade Assistant, analista esperto di export agroalimentare. NON sei un'autorità legale, "
    "doganale o sanitaria. Produci una Market Entry Analysis per esportare un prodotto alimentare verso un "
    "paese. Distingui informazione, requisito ufficiale e raccomandazione. NON inventare dati: se un dato non "
    "è disponibile scrivi esattamente 'Informazione non disponibile'. Restituisci SOLO un oggetto JSON valido "
    "(nessun testo fuori dal JSON) con questi campi: "
    "summary (string), accessibility (string), hs_code (string), customs (string), duties (string), taxes (string), "
    "health (string), food_safety (string), import_requirements (string), "
    "labeling (object: language, allergens, packaging, shelf_life, mandatory[array di string]), "
    "documents (array di string), certifications (array di string), importer_requirements (string), "
    "logistics (string), controls (string), risks (array di string), actions (array di string), "
    "missing_info (array di string: dati del produttore che servirebbero), "
    "sources (array di object: title, authority, url, date). "
    "Se il DATABASE NORMATIVO fornisce requisiti, basati su quelli e cita le relative fonti. "
    "Per le fonti indica portali/documenti ufficiali (autorità doganali/sanitarie, Commissione Europea, "
    "database tariffari ufficiali) ma NON garantirne la verifica."
)


@router.post("/market-analysis")
async def market_analysis(body: TradeMarketIn, background: BackgroundTasks, user: dict = Depends(require_roles("producer", "admin"))):
    p = await _owned_product(body.product_id, user)
    _, missing = _product_ctx(p, body.extra)

    now = now_utc()
    version = await db.trade_analyses.count_documents(
        {"producer_id": str(p["producer_id"]), "product_id": body.product_id, "country": body.country}
    ) + 1
    doc_id = str(uuid.uuid4())
    doc = {
        "_id": doc_id,
        "producer_id": str(p["producer_id"]),
        "product_id": body.product_id,
        "product_name": p.get("name"),
        "country": body.country,
        "version": version,
        "status": "pending",
        "data": {},
        "missing_info": missing,
        "extra": dict(body.extra or {}),
        "attempts": 0,
        "error": None,
        "live": False,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
    }
    await db.trade_analyses.insert_one(doc)
    background.add_task(_run_market_analysis, doc_id)
    return {"id": doc_id, "status": "pending", "country": body.country,
            "product_name": p.get("name"), "version": version, "missing_info": missing}


async def _compute_market(product: dict, extra: dict, country: str) -> tuple[dict, bool, dict]:
    """Run the LLM analysis grounded on the regulatory Knowledge Base.
    Returns (data_with_sources_and_kb, live, kb). Raises on failure/empty."""
    from emergentintegrations.llm.chat import UserMessage

    pctx, _ = _product_ctx(product, extra)
    prod_ctx = await _producer_ctx(product)
    category = product.get("category")
    kb = await kb_requirements_for(country, category, pctx.get("hs_code"))
    question = (
        f"Esportazione di {pctx.get('category')} ({pctx.get('name')}) dall'Italia verso {country}: "
        f"requisiti doganali, codice HS, dazi, requisiti sanitari e di sicurezza alimentare, requisiti di "
        f"etichettatura e lingua, documenti di importazione, certificazioni. Fonti ufficiali e aggiornate."
    )
    try:
        web_context, citations = await _perplexity_context(question)
    except Exception:
        web_context, citations = "", []
    live = bool(web_context)

    parts = [
        f"PRODOTTO:\n{json.dumps(pctx, ensure_ascii=False)}",
        f"PRODUTTORE:\n{json.dumps(prod_ctx, ensure_ascii=False)}",
        f"PAESE DI DESTINAZIONE: {country}",
        _kb_context(kb),
    ]
    if web_context:
        parts.append(f"CONTESTI WEB AGGIORNATI (con fonti):\n{web_context}")
    prompt = "\n\n".join(parts)

    chat = _llm_chat(f"trade-market-{uuid.uuid4()}", MARKET_SYSTEM)
    raw = await chat.send_message(UserMessage(text=prompt))
    data = _parse_json(raw)
    if not data:
        raise ValueError("empty_llm_response")

    sources = []
    if live and citations:
        for c in citations[:8]:
            sources.append({"title": c, "url": c, "authority": "", "date": "", "reliability": "verified"})
    else:
        for s in (data.get("sources") or [])[:8]:
            sources.append({
                "title": s.get("title") or s.get("authority") or "Fonte",
                "url": s.get("url") or "",
                "authority": s.get("authority") or "",
                "date": s.get("date") or "",
                "reliability": "to_verify",
            })
    data["sources"] = sources
    data["reliability"] = _reliability_from_sources(live)
    data["kb"] = _kb_public(kb)
    return data, live, kb


async def _run_market_analysis(doc_id: str):
    """Durable worker: claims the pending doc, runs with a hard timeout, and either completes
    (ready), schedules a controlled retry, or marks error when attempts are exhausted. Safe to
    invoke multiple times (idempotent claim); survives restarts via the recovery sweep."""
    now = now_utc()
    # Atomic claim: only proceed if still pending; bump attempts and heartbeat.
    claim = await db.trade_analyses.update_one(
        {"_id": doc_id, "status": "pending"},
        {"$inc": {"attempts": 1}, "$set": {"started_at": now, "updated_at": now}},
    )
    if claim.matched_count == 0:
        return  # already terminal (ready/error) or removed

    doc = await db.trade_analyses.find_one({"_id": doc_id})
    if not doc:
        return
    attempts = doc.get("attempts", 1)

    product = await db.products.find_one({"_id": doc["product_id"], "deleted_at": None})
    if not product:
        await db.trade_analyses.update_one(
            {"_id": doc_id}, {"$set": {"status": "error", "error": "product_not_found", "updated_at": now_utc()}}
        )
        return

    try:
        data, live, kb = await asyncio.wait_for(
            _compute_market(product, doc.get("extra") or {}, doc["country"]), timeout=WORKER_TIMEOUT
        )
        await db.trade_analyses.update_one(
            {"_id": doc_id},
            {"$set": {"status": "ready", "data": data, "live": live, "error": None, "updated_at": now_utc()}},
        )
        try:
            snap_id = await create_snapshot(doc_id, doc["country"], product.get("category"), kb)
            await db.trade_analyses.update_one({"_id": doc_id}, {"$set": {"snapshot_id": snap_id}})
        except Exception as se:  # snapshot must never break a completed analysis
            logger.warning("snapshot creation failed for %s: %s", doc_id, se)
        return
    except Exception as e:
        reason = "timeout" if isinstance(e, asyncio.TimeoutError) else str(e)[:300]
        logger.warning("market analysis attempt %s failed for %s: %s", attempts, doc_id, reason)
        if attempts >= MAX_ATTEMPTS:
            await db.trade_analyses.update_one(
                {"_id": doc_id},
                {"$set": {"status": "error", "error": reason, "updated_at": now_utc()}},
            )
            return
        # Controlled retry: keep status pending, refresh heartbeat, re-enqueue in-process.
        await db.trade_analyses.update_one(
            {"_id": doc_id}, {"$set": {"updated_at": now_utc(), "error": reason}}
        )
        asyncio.create_task(_delayed_retry(doc_id))


async def _delayed_retry(doc_id: str):
    try:
        await asyncio.sleep(RETRY_DELAY)
        await _run_market_analysis(doc_id)
    except asyncio.CancelledError:  # pragma: no cover
        raise
    except Exception as e:  # pragma: no cover
        logger.error("delayed retry error for %s: %s", doc_id, e)


async def recover_pending_analyses(startup: bool = False) -> int:
    """Durable recovery. On startup every pending doc is orphaned (its worker died with the
    process) and is re-enqueued. On periodic sweeps only docs untouched for STALE_SECONDS are
    recovered (a live worker refreshes updated_at). Docs past MAX_ATTEMPTS become 'error'."""
    now = now_utc()
    query: dict = {"status": "pending"}
    if not startup:
        query["updated_at"] = {"$lt": now - timedelta(seconds=STALE_SECONDS)}
    recovered = 0
    for doc in await db.trade_analyses.find(query).to_list(500):
        if doc.get("attempts", 0) >= MAX_ATTEMPTS:
            await db.trade_analyses.update_one(
                {"_id": doc["_id"], "status": "pending"},
                {"$set": {"status": "error", "error": "max_attempts_exceeded", "updated_at": now_utc()}},
            )
            continue
        recovered += 1
        asyncio.create_task(_run_market_analysis(doc["_id"]))
    if recovered:
        logger.info("recover_pending_analyses: re-enqueued %s analysis(es) (startup=%s)", recovered, startup)
    return recovered


_sweeper_task: asyncio.Task | None = None


async def _recovery_loop():
    while True:
        await asyncio.sleep(SWEEP_INTERVAL)
        try:
            await recover_pending_analyses(startup=False)
        except Exception as e:  # pragma: no cover
            logger.error("recovery loop error: %s", e)


async def start_recovery():
    """Run a startup recovery pass and launch the periodic sweeper. Called from app lifespan."""
    global _sweeper_task
    try:
        await recover_pending_analyses(startup=True)
    except Exception as e:  # pragma: no cover
        logger.error("startup recovery error: %s", e)
    if _sweeper_task is None or _sweeper_task.done():
        _sweeper_task = asyncio.create_task(_recovery_loop())


@router.get("/analyses")
async def list_analyses(user: dict = Depends(require_roles("producer", "admin"))):
    q = {} if user["role"] == "admin" else {"producer_id": str(user["_id"])}
    docs = await db.trade_analyses.find(q).sort("created_at", -1).to_list(100)
    return [
        {
            "id": str(d["_id"]), "product_id": d["product_id"], "product_name": d.get("product_name"),
            "country": d["country"], "version": d.get("version", 1), "live": d.get("live", False),
            "status": d.get("status", "ready"),
            "summary": (d.get("data") or {}).get("summary", ""),
            "created_at": d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else d["created_at"],
        }
        for d in docs
    ]


@router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str, user: dict = Depends(require_roles("producer", "admin"))):
    d = await db.trade_analyses.find_one({"_id": analysis_id})
    if not d or (user["role"] != "admin" and d["producer_id"] != str(user["_id"])):
        raise HTTPException(status_code=404, detail="Analisi non trovata")
    d["id"] = str(d.pop("_id"))
    if hasattr(d.get("created_at"), "isoformat"):
        d["created_at"] = d["created_at"].isoformat()
    return d


# ----------------------------- Find markets -----------------------------

FIND_SYSTEM = (
    "Sei RA MIA Trade Assistant. Classifica i mercati (paesi) più adatti per esportare un prodotto alimentare "
    "italiano, in modo TRASPARENTE. NON inventare dati di domanda/mercato: se non disponibili scrivi "
    "'Informazione non disponibile'. Usa il CONTESTO MARKETPLACE fornito (numero di distributori registrati). "
    "Restituisci SOLO JSON valido: {\"markets\":[{\"country\":string,\"score\":number 0-100,"
    "\"reasons\":[string],\"complexity\":\"bassa|media|alta\",\"data_available\":boolean}], \"note\":string}. "
    "Valuta compatibilità normativa, complessità d'ingresso, etichettatura, dazi, requisiti sanitari, logistica/distanza."
)


@router.post("/find-markets")
async def find_markets(body: TradeFindMarketsIn, user: dict = Depends(require_roles("producer", "admin"))):
    p = await _owned_product(body.product_id, user)
    pctx, _ = _product_ctx(p, None)

    # Marketplace context: distributors by region (no demand data invented)
    biz = await db.users.find({"role": "business", "approved": True}).to_list(300)
    regions: dict = {}
    for b in biz:
        r = (b.get("region") or "").strip() or "n/d"
        regions[r] = regions.get(r, 0) + 1
    mkt_ctx = {"distributori_per_area": regions, "totale_distributori": len(biz)}

    from emergentintegrations.llm.chat import UserMessage
    prompt = (
        f"PRODOTTO:\n{json.dumps(pctx, ensure_ascii=False)}\n\n"
        f"CONTESTO MARKETPLACE (solo questi dati reali):\n{json.dumps(mkt_ctx, ensure_ascii=False)}"
    )
    chat = _llm_chat(f"trade-find-{uuid.uuid4()}", FIND_SYSTEM)
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.error("find markets error: %s", e)
        raise HTTPException(status_code=502, detail="Ricerca mercati non disponibile, riprova")
    data = _parse_json(raw)
    markets = data.get("markets") or []
    markets = sorted(markets, key=lambda m: m.get("score", 0), reverse=True)[:8]
    return {"markets": markets, "note": data.get("note", ""), "reliability": "unverified"}


# ----------------------------- Compliance / label -----------------------------

COMPLIANCE_SYSTEM = (
    "Sei RA MIA Trade Assistant. Confronta i DATI PRODOTTO con i requisiti del mercato di destinazione e genera "
    "un report di compatibilità. NON usare 'conforme' in senso giuridico: usa stati 'ok' (compatibile con i "
    "requisiti rilevati), 'warn' (da verificare), 'missing' (informazione/requisito mancante). NON inventare: se "
    "un dato non è disponibile usa 'warn' con nota. Restituisci SOLO JSON valido: "
    "{\"items\":[{\"area\":string,\"label\":string,\"status\":\"ok|warn|missing\",\"note\":string}], "
    "\"missing_fields\":[string], \"label_adjustment_recommended\":boolean, \"summary\":string}. "
    "Se il DATABASE NORMATIVO fornisce requisiti, confronta i dati del prodotto proprio con quelli e cita le fonti. "
    "Copri: nome alimento, quantità netta, elenco ingredienti, allergeni, lingua richiesta, origine, produttore/"
    "importatore, dichiarazione nutrizionale, shelf life, packaging, eventuali claim."
)


@router.post("/compliance")
async def compliance(body: TradeComplianceIn, user: dict = Depends(require_roles("producer", "admin"))):
    p = await _owned_product(body.product_id, user)
    pctx, missing = _product_ctx(p, body.extra)
    kb = await kb_requirements_for(body.country, p.get("category"), pctx.get("hs_code"))

    from emergentintegrations.llm.chat import UserMessage
    parts = [
        f"DATI PRODOTTO:\n{json.dumps(pctx, ensure_ascii=False)}",
        f"PAESE DI DESTINAZIONE: {body.country}",
        _kb_context(kb),
    ]
    if body.label_text:
        parts.append(f"TESTO ETICHETTA FORNITO:\n{body.label_text}")
    chat = _llm_chat(f"trade-compliance-{uuid.uuid4()}", COMPLIANCE_SYSTEM)
    try:
        raw = await chat.send_message(UserMessage(text="\n\n".join(parts)))
    except Exception as e:
        logger.error("compliance error: %s", e)
        raise HTTPException(status_code=502, detail="Verifica non disponibile, riprova")
    data = _parse_json(raw)
    if not data:
        raise HTTPException(status_code=422, detail="Non sono riuscito a generare il report, riprova")
    data.setdefault("items", [])
    data.setdefault("missing_fields", missing)
    data["reliability"] = "unverified"
    data["image_url"] = body.image_url
    data["kb"] = _kb_public(kb)
    return data


# ----------------------------- Export plan -----------------------------

def _build_plan_steps(country: str, label_recommended: bool) -> list[dict]:
    defs = [
        ("product", "Prodotto identificato", "Prodotto selezionato per l'analisi di export.", None),
        ("customs", "Classificazione doganale (HS Code)", f"Verifica il codice HS e i dazi per {country} con l'autorità doganale.", None),
        ("health", "Requisiti sanitari e sicurezza alimentare", f"Verifica i requisiti sanitari richiesti da {country}.", None),
        ("label", "Adeguamento etichetta", f"Adegua l'etichetta ai requisiti di {country} (lingua, allergeni, informazioni obbligatorie).", {"kind": "label_lab"}),
        ("documents", "Documentazione da preparare", "Prepara i documenti di importazione ed export necessari.", None),
        ("importer", "Identificazione importatore", f"Individua un importatore/compratore in {country}.", {"kind": "b2b"}),
        ("logistics", "Logistica e trasporto", f"Organizza e quota il trasporto verso {country}.", {"kind": "logistics"}),
        ("b2b", "Ricerca compratori B2B", f"Cerca compratori B2B compatibili per {country}.", {"kind": "b2b"}),
        ("order", "Primo ordine B2B", "Negozia e concludi il primo ordine.", None),
        ("monitor", "Monitoraggio post-ingresso", f"Monitora aggiornamenti normativi per {country}.", None),
    ]
    steps = []
    for i, (typ, title, desc, action) in enumerate(defs):
        steps.append({
            "id": str(uuid.uuid4()), "order": i, "type": typ, "title": title,
            "description": desc, "action": action, "done": False,
        })
    return steps


@router.post("/export-plan")
async def create_export_plan(body: ExportPlanCreateIn, user: dict = Depends(require_roles("producer", "admin"))):
    p = await _owned_product(body.product_id, user)
    now = now_utc()
    doc = {
        "_id": str(uuid.uuid4()),
        "producer_id": str(p["producer_id"]),
        "product_id": body.product_id,
        "product_name": p.get("name"),
        "country": body.country,
        "analysis_id": body.analysis_id,
        "steps": _build_plan_steps(body.country, True),
        "created_at": now,
    }
    await db.export_plans.insert_one(doc)
    doc["id"] = doc.pop("_id")
    doc["created_at"] = now.isoformat()
    return doc


@router.get("/export-plans")
async def list_plans(user: dict = Depends(require_roles("producer", "admin"))):
    q = {} if user["role"] == "admin" else {"producer_id": str(user["_id"])}
    docs = await db.export_plans.find(q).sort("created_at", -1).to_list(100)
    out = []
    for d in docs:
        steps = d.get("steps") or []
        out.append({
            "id": str(d["_id"]), "product_id": d["product_id"], "product_name": d.get("product_name"),
            "country": d["country"], "total": len(steps), "done": sum(1 for s in steps if s.get("done")),
            "created_at": d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else d["created_at"],
        })
    return out


@router.get("/export-plans/{plan_id}")
async def get_plan(plan_id: str, user: dict = Depends(require_roles("producer", "admin"))):
    d = await db.export_plans.find_one({"_id": plan_id})
    if not d or (user["role"] != "admin" and d["producer_id"] != str(user["_id"])):
        raise HTTPException(status_code=404, detail="Piano non trovato")
    d["id"] = str(d.pop("_id"))
    if hasattr(d.get("created_at"), "isoformat"):
        d["created_at"] = d["created_at"].isoformat()
    return d


@router.patch("/export-plans/{plan_id}/steps/{step_id}")
async def toggle_step(plan_id: str, step_id: str, body: StepToggleIn, user: dict = Depends(require_roles("producer", "admin"))):
    q = {"_id": plan_id}
    if user["role"] != "admin":
        q["producer_id"] = str(user["_id"])
    res = await db.export_plans.update_one(
        {**q, "steps.id": step_id}, {"$set": {"steps.$.done": body.done}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Passo non trovato")
    return {"ok": True}


# ----------------------------- Buyers -----------------------------

@router.post("/find-buyers")
async def find_buyers(body: FindBuyersIn, user: dict = Depends(require_roles("producer", "admin"))):
    q = {"role": "business", "approved": True}
    buyers = await db.users.find(q).sort("company_name", 1).to_list(200)
    out = []
    for b in buyers:
        region = b.get("region") or ""
        if body.country and body.country.lower() not in region.lower() and region:
            # keep all but mark match; do not fabricate — show all approved distributors
            pass
        out.append({
            "id": str(b["_id"]),
            "company_name": b.get("company_name") or b.get("name"),
            "business_type": b.get("business_type"),
            "region": region,
            "match": bool(body.country and region and body.country.lower() in region.lower()),
        })
    # matched first
    out.sort(key=lambda x: (not x["match"], x["company_name"] or ""))
    return {"buyers": out}


# ----------------------------- Dashboard -----------------------------

@router.get("/dashboard")
async def dashboard(user: dict = Depends(require_roles("producer", "admin"))):
    pid = str(user["_id"])
    q = {} if user["role"] == "admin" else {"producer_id": pid}
    analyses = await db.trade_analyses.find(q).to_list(500)
    plans = await db.export_plans.find(q).to_list(500)

    ready = [a for a in analyses if a.get("status", "ready") == "ready"]
    markets = {a["country"] for a in ready}
    products_analyzed = {a["product_id"] for a in ready}
    open_actions = 0
    label_todo = 0
    docs_missing = 0
    for pl in plans:
        for s in pl.get("steps") or []:
            if not s.get("done"):
                open_actions += 1
                if s.get("type") == "label":
                    label_todo += 1
                if s.get("type") == "documents":
                    docs_missing += 1

    recent = sorted(ready, key=lambda a: a["created_at"], reverse=True)[:5]
    activities = [
        {"country": a["country"], "product_name": a.get("product_name"),
         "summary": (a.get("data") or {}).get("summary", "")[:120]}
        for a in recent
    ]
    # Regulatory alerts: unread alerts matching this producer's monitors
    alerts_count = 0
    recent_alerts = []
    monitors = await db.reg_monitors.find({} if user["role"] == "admin" else {"producer_id": pid}).to_list(500)
    if user["role"] == "admin":
        alerts_count = await db.reg_alerts.count_documents({})
        alert_docs = await db.reg_alerts.find({}).sort("created_at", -1).to_list(300)
        reads = set()
    elif monitors:
        ors = []
        for m in monitors:
            clause = {"country": {"$regex": f"^{m['country']}$", "$options": "i"}}
            if m.get("category"):
                clause["$or"] = [{"category": None}, {"category": {"$regex": f"^{m['category']}$", "$options": "i"}}]
            ors.append(clause)
        alert_docs = await db.reg_alerts.find({"$or": ors}).sort("created_at", -1).to_list(300)
        read_docs = await db.reg_alert_reads.find({"producer_id": pid}).to_list(1000)
        reads = {r["alert_id"] for r in read_docs}
        alerts_count = sum(1 for a in alert_docs if a["_id"] not in reads)
    else:
        alert_docs, reads = [], set()
    for a in alert_docs[:5]:
        recent_alerts.append({
            "id": str(a["_id"]), "type": a.get("type"), "country": a.get("country"),
            "title": a.get("title"), "severity": a.get("severity"),
            "read": a["_id"] in reads,
            "created_at": a["created_at"].isoformat() if hasattr(a.get("created_at"), "isoformat") else a.get("created_at"),
        })
    return {
        "markets_monitored": len(markets),
        "products_analyzed": len(products_analyzed),
        "analyses_completed": len(ready),
        "open_actions": open_actions,
        "alerts": alerts_count,
        "recent_alerts": recent_alerts,
        "labels_todo": label_todo,
        "docs_missing": docs_missing,
        "opportunities": 0,
        "activities": activities,
        "disclaimer": DISCLAIMER,
    }
