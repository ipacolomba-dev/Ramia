import asyncio
import json
import logging
import os
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import AdvisorChatIn, AiDraftIn, BuyerSearchIn, now_utc
from security import current_user, require_roles

logger = logging.getLogger(__name__)
router = APIRouter(tags=["advisor"])

VALID_CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"]

ADVISOR_SYSTEM = (
    "Sei il Consulente Export di ’Ra mia, assistente esperto per produttori e distributori "
    "agroalimentari che vogliono esportare. Rispondi in modo chiaro, pratico e strutturato "
    "(usa elenchi puntati quando utile). Copri: fiscalità internazionale, procedure doganali "
    "(documenti, dazi, codici HS di massima), approvazione presso enti alimentari esteri (es. FDA, "
    "autorità sanitarie UE), requisiti e adeguamenti delle etichette per il mercato di destinazione, "
    "qualifiche e certificazioni necessarie, oltre a eventi geopolitici, possibili crisi economiche e "
    "tendenze di domanda dei prodotti. Concludi SEMPRE con un breve avviso: sei una consulenza "
    "informativa e di orientamento, non sostituisci un consulente fiscale/legale né le autorità "
    "competenti; le approvazioni finali restano dell'ente e dei laboratori etichette. "
    "Se ti vengono forniti CONTESTI WEB con fonti, usali per riflettere regolamenti e condizioni recenti. "
    "Mantieni la risposta concisa e operativa (indicativamente max ~250 parole): vai al punto, evita ripetizioni."
)


async def _perplexity_context(question: str) -> tuple[str, list[str]]:
    """Return (web_context, citations). Empty if no key configured."""
    key = (os.environ.get("PERPLEXITY_API_KEY") or "").strip()
    if not key:
        return "", []
    payload = {
        "model": "sonar-pro",
        "messages": [
            {"role": "system", "content": "Be precise. Prioritise official customs/food-authority and government sources. Include dates."},
            {"role": "user", "content": question},
        ],
        "search_recency_filter": "month",
        "temperature": 0.1,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post("https://api.perplexity.ai/v1/sonar", json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        citations = data.get("citations") or []
        return content, citations
    except Exception as e:
        logger.warning("Perplexity live search unavailable: %s", e)
        return "", []


def _llm_chat(session_id: str, system: str):
    from emergentintegrations.llm.chat import LlmChat

    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Configurazione AI mancante")
    return LlmChat(api_key=key, session_id=session_id, system_message=system).with_model("openai", "gpt-5.4")


@router.post("/advisor/chat")
async def advisor_chat(body: AdvisorChatIn, user: dict = Depends(require_roles("producer", "business", "admin", "collaborator"))):
    from emergentintegrations.llm.chat import UserMessage

    uid = str(user["_id"])
    session_key = f"advisor-{uid}-{body.session_id}"

    # Prior turns for multi-turn continuity (kept in our own DB).
    prior = await db.advisor_messages.find(
        {"user_id": uid, "session_id": body.session_id}
    ).sort("created_at", 1).to_list(30)
    history = "\n".join(
        f"{'Utente' if m['role'] == 'user' else 'Consulente'}: {m['text']}" for m in prior[-12:]
    )

    web_context, citations = await _perplexity_context(body.message)

    parts = []
    if history:
        parts.append(f"CONVERSAZIONE PRECEDENTE:\n{history}")
    if body.context:
        parts.append(f"CONTESTO PRODOTTO/ETICHETTA:\n{body.context}")
    if web_context:
        parts.append(f"CONTESTI WEB AGGIORNATI (con fonti):\n{web_context}")
    parts.append(f"DOMANDA:\n{body.message}")
    prompt = "\n\n".join(parts)

    chat = _llm_chat(session_key, ADVISOR_SYSTEM)
    try:
        reply = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=85)
    except asyncio.TimeoutError:
        logger.warning("Advisor LLM timeout for user %s", uid)
        raise HTTPException(status_code=504, detail="La risposta sta richiedendo troppo tempo. Riprova con una domanda più breve.")
    except Exception as e:
        logger.error("Advisor LLM error: %s", e)
        raise HTTPException(status_code=502, detail="Assistente non disponibile, riprova")
    reply = reply if isinstance(reply, str) else str(reply)

    now = now_utc()
    await db.advisor_messages.insert_many([
        {"_id": str(uuid.uuid4()), "user_id": uid, "session_id": body.session_id, "role": "user", "text": body.message, "created_at": now},
        {"_id": str(uuid.uuid4()), "user_id": uid, "session_id": body.session_id, "role": "assistant", "text": reply, "citations": citations, "created_at": now},
    ])
    return {"reply": reply, "citations": citations, "live": bool(web_context)}


@router.get("/advisor/history/{session_id}")
async def advisor_history(session_id: str, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    docs = await db.advisor_messages.find(
        {"user_id": uid, "session_id": session_id}
    ).sort("created_at", 1).to_list(100)
    return [
        {"role": d["role"], "text": d["text"], "citations": d.get("citations") or []}
        for d in docs
    ]


@router.post("/ai/search")
async def ai_search(body: BuyerSearchIn, user: dict = Depends(current_user)):
    from emergentintegrations.llm.chat import UserMessage

    prods = await db.products.find(
        {"status": "approved", "deleted_at": None}
    ).sort("created_at", -1).to_list(200)
    catalog = [
        {
            "id": str(p["_id"]),
            "name": p.get("name"),
            "category": p.get("category"),
            "price": p.get("price"),
            "price_wholesale": p.get("price_wholesale"),
            "unit": p.get("unit"),
            "company": p.get("company_name"),
            "region": p.get("origin_region"),
        }
        for p in prods
    ]
    shipments = await db.shipping_requests.find(
        {"status": "open", "shared": True}
    ).sort("created_at", -1).to_list(50)
    ships = [
        {"id": str(s["_id"]), "title": s.get("title"), "origin": s.get("origin"),
         "destination": s.get("destination"), "cold_chain": s.get("cold_chain", False)}
        for s in shipments
    ]

    req = {"query": body.query, "quantity": body.quantity, "destination": body.destination, "budget": body.budget}
    system = (
        "Sei l'assistente acquisti di ’Ra mia. Ricevi la richiesta di un compratore, il CATALOGO prodotti "
        "e le SPEDIZIONI CONDIVISE aperte. Scegli i prodotti più adatti (max 6) e spiega perché. "
        "Fai RISPARMIARE: se esiste una spedizione condivisa verso la stessa destinazione o vicina, "
        "suggerisci di unirsi indicando il risparmio stimato sul trasporto; oppure suggerisci di "
        "raggruppare produttori della stessa zona. Rispondi SOLO con JSON valido: "
        '{"product_ids": [..], "answer": "testo in italiano con consiglio e risparmio", "shipment_id": "id o null"}'
    )
    prompt = (
        f"RICHIESTA COMPRATORE:\n{json.dumps(req, ensure_ascii=False)}\n\n"
        f"CATALOGO:\n{json.dumps(catalog, ensure_ascii=False)}\n\n"
        f"SPEDIZIONI CONDIVISE:\n{json.dumps(ships, ensure_ascii=False)}"
    )
    chat = _llm_chat(f"buyer-search-{uuid.uuid4()}", system)
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.error("AI search error: %s", e)
        raise HTTPException(status_code=502, detail="Ricerca AI non disponibile, riprova")
    raw = raw if isinstance(raw, str) else str(raw)
    txt = raw.strip()
    if txt.startswith("```"):
        txt = txt.strip("`")
        txt = txt.replace("json", "", 1)
    start, end = txt.find("{"), txt.rfind("}")
    parsed = {}
    if start != -1 and end != -1:
        try:
            parsed = json.loads(txt[start:end + 1])
        except Exception:
            parsed = {}
    ids = parsed.get("product_ids") or []
    id_set = {str(i) for i in ids}
    matched = [await _product_public(p) for p in prods if str(p["_id"]) in id_set]
    return {
        "answer": parsed.get("answer") or "Ecco alcuni prodotti che potrebbero interessarti.",
        "products": matched,
        "shipment_id": parsed.get("shipment_id"),
    }


async def _product_public(p: dict) -> dict:
    from models import ProductDoc

    doc = ProductDoc.from_mongo(p)
    return doc.to_public() if doc else {}


@router.post("/ai/product-draft")
async def ai_product_draft(body: AiDraftIn, user: dict = Depends(require_roles("producer"))):
    from emergentintegrations.llm.chat import UserMessage

    system = (
        "Sei un assistente che aiuta un produttore siciliano a creare la scheda di un prodotto "
        "agroalimentare a partire da una descrizione a parole. Restituisci SOLO un oggetto JSON valido "
        "con questi campi: name (string), name_en (string), description (string, italiano, >=40 caratteri, "
        "invitante e realistica), description_en (string, inglese), "
        f"category (uno tra: {', '.join(VALID_CATEGORIES)}), price (number euro dettaglio stimato), "
        "unit (string es 'kg','0,5 L','pz','500 g'), price_wholesale (number, ~70% del dettaglio), "
        "moq (number quantità minima ingrosso), pack_per_carton (int), cartons_per_pallet (int). "
        "Stima valori plausibili se non indicati. Nessun testo fuori dal JSON."
    )
    hint = f"\nCategoria suggerita: {body.category}" if body.category else ""
    chat = _llm_chat(f"product-draft-{uuid.uuid4()}", system)
    try:
        raw = await chat.send_message(UserMessage(text=f"Descrizione del produttore:\n{body.description}{hint}"))
    except Exception as e:
        logger.error("AI draft error: %s", e)
        raise HTTPException(status_code=502, detail="Bozza AI non disponibile, riprova")
    raw = raw if isinstance(raw, str) else str(raw)
    txt = raw.strip()
    if txt.startswith("```"):
        txt = txt.strip("`").replace("json", "", 1)
    start, end = txt.find("{"), txt.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(status_code=422, detail="Non sono riuscito a generare la bozza, riprova")
    try:
        d = json.loads(txt[start:end + 1])
    except Exception:
        raise HTTPException(status_code=422, detail="Non sono riuscito a generare la bozza, riprova")
    cat = str(d.get("category", "")).lower()
    if cat not in VALID_CATEGORIES:
        cat = body.category if body.category in VALID_CATEGORIES else "conserve"
    return {
        "name": str(d.get("name", ""))[:120],
        "name_en": str(d.get("name_en", ""))[:120],
        "description": str(d.get("description", ""))[:2000],
        "description_en": str(d.get("description_en", ""))[:2000],
        "category": cat,
        "price": float(d.get("price", 0) or 0),
        "unit": str(d.get("unit", "pz"))[:20] or "pz",
        "price_wholesale": float(d.get("price_wholesale", 0) or 0),
        "moq": float(d.get("moq", 0) or 0),
        "pack_per_carton": int(d.get("pack_per_carton", 0) or 0),
        "cartons_per_pallet": int(d.get("cartons_per_pallet", 0) or 0),
    }
