import io
import json
import logging
import os
import uuid
from html import escape

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pypdf import PdfReader

from db import db
from emailer import send_email
from models import now_utc
from security import require_roles

logger = logging.getLogger(__name__)
router = APIRouter(tags=["import"])

VALID_CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"]

EXTRACT_SYSTEM = (
    "Sei un assistente che estrae prodotti agroalimentari da un listino/catalogo. "
    "Ricevi il testo grezzo di un catalogo PDF e restituisci SOLO un array JSON valido, "
    "senza testo aggiuntivo, senza markdown. Ogni elemento ha esattamente questi campi: "
    "name (string), description (string, almeno 10 caratteri; se assente inventane una breve e realistica dal nome), "
    "category (uno tra: olio, formaggi, frutta_secca, agrumi, dolci, pasta, vino, conserve), "
    "price (number in euro; se assente usa 0), unit (string es. 'kg','0,5 L','pz','500 g'; se assente usa 'pz'), "
    "stock (number; se assente usa 0). Estrai tutti i prodotti che trovi. Rispondi solo con l'array JSON."
)


def _extract_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages[:40]:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts).strip()


def _coerce_products(raw: str) -> list[dict]:
    txt = raw.strip()
    if txt.startswith("```"):
        txt = txt.split("```", 2)[1] if "```" in txt else txt
        txt = txt.replace("json", "", 1).strip("` \n")
    start, end = txt.find("["), txt.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        items = json.loads(txt[start : end + 1])
    except Exception:
        return []
    out = []
    for it in items if isinstance(items, list) else []:
        try:
            name = str(it.get("name", "")).strip()
            if not name:
                continue
            cat = str(it.get("category", "")).strip().lower()
            if cat not in VALID_CATEGORIES:
                cat = "conserve"
            desc = str(it.get("description", "")).strip() or f"{name} — prodotto siciliano selezionato."
            if len(desc) < 10:
                desc = f"{desc} — prodotto siciliano selezionato."
            price = float(it.get("price", 0) or 0)
            stock = float(it.get("stock", 0) or 0)
            unit = str(it.get("unit", "pz")).strip() or "pz"
            out.append({
                "name": name[:120], "description": desc[:2000], "category": cat,
                "price": max(price, 0.0), "unit": unit[:20], "stock": max(stock, 0.0),
            })
        except Exception:
            continue
    return out


async def _parse_with_llm(text: str) -> list[dict]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Configurazione AI mancante")
    chat = LlmChat(
        api_key=key,
        session_id=f"pdf-import-{uuid.uuid4()}",
        system_message=EXTRACT_SYSTEM,
    ).with_model("gemini", "gemini-3-flash-preview")
    snippet = text[:20000]
    try:
        reply = await chat.send_message(UserMessage(text=f"Testo del catalogo:\n\n{snippet}"))
    except Exception as e:
        logger.error(f"LLM parse error: {e}")
        raise HTTPException(status_code=502, detail="Lettura del PDF non riuscita, riprova")
    return _coerce_products(reply if isinstance(reply, str) else str(reply))


async def notify_admin_products(producer: dict, products: list[dict], filename: str | None = None, source: str = "PDF"):
    to = os.environ.get("NOTIFY_EMAIL") or os.environ.get("ADMIN_EMAIL")
    if not to:
        return
    company = producer.get("company_name") or producer.get("name", "")
    rows = []
    for p in products:
        img = p.get("image_url")
        img_cell = (
            f'<img src="{escape(img)}" alt="" width="56" height="56" '
            f'style="border-radius:6px;object-fit:cover" />'
            if img and str(img).startswith("https://")
            else '<span style="color:#7C6A5E;font-size:12px">nessuna immagine</span>'
        )
        rows.append(
            f'<tr>'
            f'<td style="padding:8px;border-bottom:1px solid #EDE5DC">{img_cell}</td>'
            f'<td style="padding:8px;border-bottom:1px solid #EDE5DC;font-family:Arial,sans-serif">'
            f'<strong style="color:#2C221E">{escape(str(p["name"]))}</strong><br/>'
            f'<span style="color:#7C6A5E;font-size:12px">Etichetta: {escape(str(p["category"]))}</span></td>'
            f'<td style="padding:8px;border-bottom:1px solid #EDE5DC;font-family:Arial,sans-serif;'
            f'color:#C05632;font-weight:bold;white-space:nowrap">€{float(p["price"]):.2f} / {escape(str(p["unit"]))}</td>'
            f'</tr>'
        )
    origin = f" dal catalogo <em>{escape(filename)}</em>" if filename else f" ({escape(source)})"
    subject = f"Sapori di Sicilia — {len(products)} prodotti da approvare ({company})"
    html = (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto">'
        f'<tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2 style="color:#2C221E;margin:0 0 4px">Nuovi prodotti in attesa di approvazione</h2>'
        f'<p style="color:#5C4A3E;margin:0 0 16px">Il produttore <strong>{escape(company)}</strong> '
        f'ha aggiunto <strong>{len(products)}</strong> prodotti{origin}. '
        f'Accedi al pannello admin dell\'app per approvarli o rifiutarli.</p>'
        f'<table role="presentation" width="100%" style="border-collapse:collapse">{"".join(rows)}</table>'
        f'<p style="font-size:12px;color:#7C6A5E;margin-top:20px">Inviata da Sapori di Sicilia. '
        f'Non chiediamo mai password o dati di pagamento via email.</p>'
        f'</td></tr></table>'
    )
    await send_email(to=to, subject=subject, html=html)


@router.post("/products/import-pdf")
async def import_pdf(file: UploadFile = File(...), user: dict = Depends(require_roles("producer"))):
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF troppo grande (max 15MB)")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Carica un file PDF")
    try:
        text = _extract_text(data)
    except Exception:
        raise HTTPException(status_code=422, detail="Impossibile leggere il PDF")
    if len(text) < 20:
        raise HTTPException(status_code=422, detail="Il PDF non contiene testo leggibile (forse è solo immagini)")

    parsed = await _parse_with_llm(text)
    if not parsed:
        raise HTTPException(status_code=422, detail="Nessun prodotto riconosciuto nel catalogo")

    created = []
    for p in parsed[:100]:
        doc = {
            "_id": str(uuid.uuid4()),
            **p,
            "name_en": None,
            "description_en": None,
            "image_url": None,
            "origin_region": user.get("region"),
            "producer_id": str(user["_id"]),
            "producer_name": user.get("name", ""),
            "company_name": user.get("company_name") or user.get("name", ""),
            "status": "pending",
            "featured_until": None,
            "created_at": now_utc(),
            "deleted_at": None,
            "source": "pdf_import",
        }
        await db.products.insert_one(doc)
        created.append({"name": p["name"], "category": p["category"], "price": p["price"], "unit": p["unit"], "image_url": None})

    await notify_admin_products(user, created, filename=file.filename or "catalogo.pdf")

    return {"imported": len(created), "products": created}
