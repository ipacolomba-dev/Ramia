"""Impostazioni di piattaforma: dati legali in un unico documento, con segnaposto espliciti."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.audit import audit
from db import db
from models import now_utc
from security import require_roles

router = APIRouter(tags=["settings"])

LEGAL_ID = "legal"
LEGAL_FIELDS = (
    "ragione_sociale", "forma_giuridica", "sede_legale", "partita_iva",
    "codice_fiscale", "rea", "pec", "email_contatti", "email_privacy",
    "telefono", "paese",
)
REQUIRED_TO_COMPLETE = ("ragione_sociale", "forma_giuridica", "sede_legale", "partita_iva", "pec")


def _public(doc: dict) -> dict:
    out = {f: doc.get(f, "") for f in LEGAL_FIELDS}
    out["is_placeholder"] = bool(doc.get("is_placeholder", True))
    return out


async def get_legal() -> dict:
    doc = await db.platform_settings.find_one({"_id": LEGAL_ID})
    if not doc:
        doc = {"_id": LEGAL_ID, **{f: "" for f in LEGAL_FIELDS},
               "ragione_sociale": "’Ra mia", "paese": "IT",
               "is_placeholder": True, "updated_at": now_utc()}
        await db.platform_settings.insert_one(doc)
    return doc


@router.get("/settings/legal")
async def legal_public():
    return _public(await get_legal())


class LegalIn(BaseModel):
    ragione_sociale: Optional[str] = Field(None, max_length=200)
    forma_giuridica: Optional[str] = Field(None, max_length=80)
    sede_legale: Optional[str] = Field(None, max_length=300)
    partita_iva: Optional[str] = Field(None, max_length=20)
    codice_fiscale: Optional[str] = Field(None, max_length=20)
    rea: Optional[str] = Field(None, max_length=40)
    pec: Optional[str] = Field(None, max_length=120)
    email_contatti: Optional[str] = Field(None, max_length=120)
    email_privacy: Optional[str] = Field(None, max_length=120)
    telefono: Optional[str] = Field(None, max_length=40)
    paese: Optional[str] = Field(None, max_length=2)


@router.get("/admin/settings/legal")
async def legal_admin(user: dict = Depends(require_roles("admin"))):
    doc = await get_legal()
    return {**_public(doc), "missing": [f for f in REQUIRED_TO_COMPLETE if not doc.get(f)]}


@router.put("/admin/settings/legal")
async def update_legal(body: LegalIn, user: dict = Depends(require_roles("admin"))):
    before = await get_legal()
    patch = {k: v.strip() for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=422, detail="Nessun campo da aggiornare")
    merged = {**before, **patch}
    merged["is_placeholder"] = any(not merged.get(f) for f in REQUIRED_TO_COMPLETE)
    merged["updated_at"] = now_utc()
    fields = {k: merged[k] for k in LEGAL_FIELDS}
    fields["is_placeholder"] = merged["is_placeholder"]
    fields["updated_at"] = merged["updated_at"]
    await db.platform_settings.update_one({"_id": LEGAL_ID}, {"$set": fields})
    await audit(user, "update", "platform_settings", LEGAL_ID,
                before={f: before.get(f) for f in LEGAL_FIELDS},
                after={f: merged.get(f) for f in LEGAL_FIELDS})
    return {**_public(merged), "missing": [f for f in REQUIRED_TO_COMPLETE if not merged.get(f)]}


async def seed_legal():
    await get_legal()