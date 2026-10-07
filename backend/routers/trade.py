import json
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from routers.advisor import _llm_chat, _perplexity_context
from db import db
from models import (
    ExportPlanCreateIn, FindBuyersIn, StepToggleIn, TradeComplianceIn,
    TradeFindMarketsIn, TradeMarketIn, now_utc,
)
from security import require_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trade", tags=["trade"])

COMPLIANCE_FIELDS = ["ingredients", "allergens", "shelf_life", "net_weight", "packaging", "hs_code"]

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


async def _producer_ctx(user: dict, product: dict) -> dict:
    pid = product.get("producer_id")
    prod = await db.users.find_one({"_id": pid}) if pid else user
    prod = prod or user
    return {
        "company_name": prod.get("company_name") or prod.get("name"),
        "country": "Italia",
        "region": prod.get("region"),
        "city": prod.get("city"),
        "certifications": [c.get("name") for c in (prod.get("certifications") or []) if c.get("name")],
    }


def _reliability_from_sources(live: bool) -> str:
    return "verified" if live else "unverified"


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
        "live": False,
        "created_at": now,
    }
    await db.trade_analyses.insert_one(doc)
    background.add_task(_run_market_analysis, doc_id, p, dict(body.extra or {}), body.country, await _producer_ctx(user, p))
    return {"id": doc_id, "status": "pending", "country": body.country,
            "product_name": p.get("name"), "version": version, "missing_info": missing}


async def _run_market_analysis(doc_id: str, p: dict, extra: dict, country: str, prod_ctx: dict):
    from emergentintegrations.llm.chat import UserMessage

    pctx, _ = _product_ctx(p, extra)
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
    ]
    if web_context:
        parts.append(f"CONTESTI WEB AGGIORNATI (con fonti):\n{web_context}")
    prompt = "\n\n".join(parts)

    try:
        chat = _llm_chat(f"trade-market-{doc_id}", MARKET_SYSTEM)
        raw = await chat.send_message(UserMessage(text=prompt))
        data = _parse_json(raw)
    except Exception as e:
        logger.error("market analysis worker error: %s", e)
        data = {}

    if not data:
        await db.trade_analyses.update_one({"_id": doc_id}, {"$set": {"status": "error"}})
        return

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
    await db.trade_analyses.update_one(
        {"_id": doc_id}, {"$set": {"status": "ready", "data": data, "live": live}}
    )


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
    "Copri: nome alimento, quantità netta, elenco ingredienti, allergeni, lingua richiesta, origine, produttore/"
    "importatore, dichiarazione nutrizionale, shelf life, packaging, eventuali claim."
)


@router.post("/compliance")
async def compliance(body: TradeComplianceIn, user: dict = Depends(require_roles("producer", "admin"))):
    p = await _owned_product(body.product_id, user)
    pctx, missing = _product_ctx(p, body.extra)

    from emergentintegrations.llm.chat import UserMessage
    parts = [
        f"DATI PRODOTTO:\n{json.dumps(pctx, ensure_ascii=False)}",
        f"PAESE DI DESTINAZIONE: {body.country}",
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
    return {
        "markets_monitored": len(markets),
        "products_analyzed": len(products_analyzed),
        "analyses_completed": len(ready),
        "open_actions": open_actions,
        "alerts": 0,
        "labels_todo": label_todo,
        "docs_missing": docs_missing,
        "opportunities": 0,
        "activities": activities,
        "disclaimer": DISCLAIMER,
    }
