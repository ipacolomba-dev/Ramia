"""Idempotent seed for the Regulatory Intelligence Engine (DEMO data).

All records are flagged is_demo=True. We only use REAL official source URLs/authorities
(EUR-Lex, European Commission, FDA, TARIC). Requirement descriptions summarise real,
publicly known regulations but are clearly marked DEMO until an admin human-verifies them.
We never fabricate "global coverage": only a handful of representative markets are seeded.
"""
import hashlib
import logging
import uuid

from db import db
from models import now_utc

logger = logging.getLogger(__name__)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# Real, official regulatory sources (used as DEMO references)
SOURCES = {
    "eurlex_1169": {
        "name": "Regolamento (UE) n. 1169/2011 — Informazioni sugli alimenti ai consumatori",
        "authority": "EUR-Lex / Unione Europea",
        "country": "UE",
        "category": None,
        "url": "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32011R1169",
        "source_type": "OFFICIAL_EU",
        "reliability": "A",
    },
    "ec_food_safety": {
        "name": "Commissione Europea — Sicurezza alimentare",
        "authority": "Commissione Europea (DG SANTE)",
        "country": "UE",
        "category": None,
        "url": "https://food.ec.europa.eu/food-safety_en",
        "source_type": "OFFICIAL_EU",
        "reliability": "A",
    },
    "taric": {
        "name": "TARIC — Tariffa integrata dell'Unione Europea",
        "authority": "Commissione Europea (TAXUD)",
        "country": "UE",
        "category": None,
        "url": "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp",
        "source_type": "OFFICIAL_TARIFF",
        "reliability": "A",
    },
    "fda_food": {
        "name": "FDA — Food (importazione alimenti negli USA)",
        "authority": "U.S. Food and Drug Administration",
        "country": "USA",
        "category": None,
        "url": "https://www.fda.gov/food/importing-food-products-united-states",
        "source_type": "OFFICIAL_FOODSAFETY",
        "reliability": "A",
    },
}

# Document content summaries (DEMO, hashed for versioning)
DOCS = {
    "eurlex_1169": (
        "Il Reg. (UE) 1169/2011 stabilisce le indicazioni obbligatorie sull'etichetta degli alimenti "
        "preimballati: denominazione, elenco degli ingredienti, allergeni evidenziati, quantità netta, "
        "termine minimo di conservazione o data di scadenza, condizioni di conservazione, nome e indirizzo "
        "dell'operatore responsabile, paese d'origine ove richiesto e dichiarazione nutrizionale. Le "
        "informazioni devono essere in una lingua facilmente comprensibile per il consumatore dello Stato "
        "membro di commercializzazione."
    ),
    "ec_food_safety": (
        "La normativa UE sull'igiene (Reg. CE 852/2004 e 853/2004) impone requisiti di sicurezza alimentare, "
        "tracciabilità (Reg. CE 178/2002) e controlli ufficiali. Gli alimenti di origine animale richiedono "
        "stabilimenti riconosciuti e certificazione sanitaria."
    ),
    "taric": (
        "La classificazione doganale (codice HS/TARIC) determina dazi, misure e documenti richiesti "
        "all'importazione. Le aliquote e le misure vanno verificate nel database TARIC per il codice specifico."
    ),
    "fda_food": (
        "Per importare alimenti negli USA è richiesta la registrazione della struttura alimentare (Food "
        "Facility Registration), il rispetto del Foreign Supplier Verification Program (FSVP), la Prior "
        "Notice delle spedizioni e l'etichettatura secondo FDA (Nutrition Facts, allergeni FALCPA, lingua inglese)."
    ),
}

EU_COUNTRIES = ["Germania", "Francia", "Spagna"]


def _requirements_for(country: str, src_ids: dict) -> list[dict]:
    """Return DEMO requirements for an EU country (reuses EU-wide regulations)."""
    return [
        {"requirement_type": "LABEL", "severity": "high",
         "description": (f"Etichettatura conforme al Reg. (UE) 1169/2011: denominazione, ingredienti, "
                         f"allergeni evidenziati, quantità netta, TMC/scadenza, operatore responsabile e "
                         f"dichiarazione nutrizionale, nella lingua di {country}."),
         "source_key": "eurlex_1169"},
        {"requirement_type": "ALLERGEN", "severity": "high",
         "description": "Dichiarazione obbligatoria dei 14 allergeni evidenziati nell'elenco ingredienti.",
         "source_key": "eurlex_1169"},
        {"requirement_type": "FOOD_SAFETY", "severity": "medium",
         "description": "Conformità ai regolamenti UE di igiene (CE 852/2004) e tracciabilità (CE 178/2002).",
         "source_key": "ec_food_safety"},
        {"requirement_type": "TARIFF", "severity": "medium",
         "description": "Verifica del codice HS/TARIC e dei dazi applicabili per l'ingresso nel mercato UE.",
         "source_key": "taric"},
    ]


def _requirements_usa(src_ids: dict) -> list[dict]:
    return [
        {"requirement_type": "DOCUMENT", "severity": "high",
         "description": ("Registrazione della struttura alimentare presso FDA (Food Facility Registration), "
                         "Prior Notice delle spedizioni e importatore con programma FSVP."),
         "source_key": "fda_food"},
        {"requirement_type": "LABEL", "severity": "high",
         "description": ("Etichettatura FDA: Nutrition Facts, elenco ingredienti e allergeni (FALCPA) in lingua "
                         "inglese, dichiarazione del paese d'origine."),
         "source_key": "fda_food"},
    ]


async def seed_regulatory():
    if await db.reg_sources.count_documents({}) > 0:
        return
    logger.info("Seeding regulatory DEMO data...")
    now = now_utc()

    src_ids: dict = {}
    for key, s in SOURCES.items():
        sid = str(uuid.uuid4())
        src_ids[key] = sid
        await db.reg_sources.insert_one({
            "_id": sid, **s, "language": "it", "notes": "Dato DEMO di riferimento, da verificare dall'amministratore.",
            "is_demo": True, "status": "to_verify", "last_checked": None, "next_check": None,
            "reachable": None, "created_at": now, "updated_at": now,
        })
        # one document + initial version per source
        doc_id = str(uuid.uuid4())
        content = DOCS[key]
        await db.reg_documents.insert_one({
            "_id": doc_id, "source_id": sid, "title": s["name"], "url": s["url"],
            "country": s["country"], "category": None, "language": "it",
            "published_date": None, "effective_date": None, "abrogated_date": None,
            "current_version": 1, "status": "active", "is_demo": True,
            "acquired_at": now, "last_verified": now, "updated_at": now,
        })
        await db.reg_doc_versions.insert_one({
            "_id": str(uuid.uuid4()), "document_id": doc_id, "version": 1,
            "content": content, "fingerprint": _hash(content),
            "effective_date": None, "note": "versione iniziale (DEMO)", "created_at": now,
        })
        src_ids[key + "_doc"] = doc_id

    async def _insert_reqs(country: str, reqs: list[dict]):
        for r in reqs:
            key = r["source_key"]
            sid = src_ids[key]
            await db.reg_requirements.insert_one({
                "_id": str(uuid.uuid4()), "country": country, "market": None,
                "category": None, "product_type": None, "hs_code": None, "ingredient": None,
                "requirement_type": r["requirement_type"], "description": r["description"],
                "severity": r["severity"], "effective_date": None, "expiry_date": None,
                "source_id": sid, "document_id": src_ids.get(key + "_doc"),
                "source_name": SOURCES[key]["name"], "source_reliability": SOURCES[key]["reliability"],
                "document_version": 1, "verification_status": "DEMO", "is_demo": True,
                "active": True, "last_verified": now, "confidence_hint": None,
                "created_at": now, "updated_at": now,
            })

    for c in EU_COUNTRIES:
        await _insert_reqs(c, _requirements_for(c, src_ids))
    await _insert_reqs("USA", _requirements_usa(src_ids))

    logger.info("Regulatory DEMO seed completato: %d fonti", len(SOURCES))
