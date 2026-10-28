"""Accounts: email verification, password reset, optional TOTP 2FA, role onboarding (drafts),
company verification workflow (document checklist, admin review, expiry reminders, compliance log)."""
import asyncio
import base64
import csv
import hashlib
import hmac
import io
import logging
import os
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

import pyotp
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

from core import tokens
from core.audit import audit
from core.permissions import APPROVAL_ROLES
from db import db
from emailer import send_email
from models import now_utc
from security import SECRET, bearer, current_user, hash_password, make_token, require_roles, user_from_token
from storage import APP_NAME, get_object, put_object

log = logging.getLogger(__name__)
router = APIRouter(tags=["accounts"])

VERIFIABLE_ROLES = ("producer",) + tuple(APPROVAL_ROLES)
TWO_FA_ROLES = ("admin", "business")
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(("totp:" + SECRET).encode()).digest()))


def _now():
    return datetime.now(timezone.utc)


def _h(raw: str) -> str:
    return hmac.new(SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()


def _app_url() -> str:
    return os.environ.get("APP_WEB_URL") or os.environ.get("PUBLIC_APP_URL") or ""


async def get_setting(key: str, default: Any):
    d = await db.platform_settings.find_one({"_id": key})
    return d["value"] if d else default


# ============================== Seed (DB-configurable) ==============================

F = lambda key, it, en, kind="text", required=True, **kw: {"key": key, "label_it": it, "label_en": en, "kind": kind, "required": required, **kw}

ONBOARDING = {
    "producer": [
        {"key": "company", "title_it": "Anagrafica azienda", "title_en": "Company", "fields": [
            F("legal_name", "Ragione sociale", "Legal name"), F("vat_id", "Partita IVA", "VAT number", pattern="vat"),
            F("ateco", "Codice ATECO", "ATECO code", pattern=r"^\d{2}(\.\d{1,2}){0,2}$"), F("country", "Paese", "Country")]},
        {"key": "site", "title_it": "Sede", "title_en": "Site", "fields": [
            F("street", "Indirizzo sede", "Address"), F("city", "Comune", "City"), F("province", "Provincia", "Province"), F("zip", "CAP", "ZIP")]},
        {"key": "production", "title_it": "Produzione", "title_en": "Production", "fields": [
            F("categories", "Categorie merceologiche", "Product categories", "categories"),
            F("capacity", "Capacità produttiva annua", "Yearly production capacity"),
            F("certifications", "Certificazioni", "Certifications", "multi", False, options=["DOP", "IGP", "BIO", "IFS", "BRC", "HACCP"]),
            F("export_extra_eu", "Esporti fuori UE (es. USA)?", "Export outside EU (e.g. USA)?", "bool", False)]},
        {"key": "payout", "title_it": "Pagamenti e referente", "title_en": "Payout & contact", "fields": [
            F("iban", "IBAN", "IBAN", pattern="iban"), F("contact_name", "Referente", "Contact person"),
            F("contact_phone", "Telefono referente", "Contact phone"), F("contact_email", "Email referente", "Contact email", pattern="email")]},
    ],
    "business": [
        {"key": "company", "title_it": "Anagrafica", "title_en": "Company", "fields": [
            F("legal_name", "Ragione sociale", "Legal name"), F("vat_id", "Partita IVA / VAT", "VAT number"), F("country", "Paese", "Country")]},
        {"key": "profile", "title_it": "Profilo acquisti", "title_en": "Purchasing profile", "fields": [
            F("sector", "Settore", "Sector"),
            F("buyer_type", "Tipologia", "Type", "select", options=["importatore", "distributore", "horeca", "gdo"]),
            F("expected_volume", "Volumi attesi annui", "Expected yearly volume"),
            F("currency", "Valuta", "Currency", "select", options=["EUR", "USD", "GBP", "CHF"]),
            F("eori", "Codice EORI", "EORI number", required=False)]},
    ],
    "logistics": [
        {"key": "company", "title_it": "Anagrafica", "title_en": "Company", "fields": [
            F("legal_name", "Ragione sociale", "Legal name"), F("vat_id", "Partita IVA", "VAT number", pattern="vat"), F("country", "Paese", "Country")]},
        {"key": "service", "title_it": "Servizio", "title_en": "Service", "fields": [
            F("routes", "Tratte coperte", "Routes covered"),
            F("cargo_types", "Tipologie di carico", "Cargo types", "multi", options=["pallet", "collettame", "groupage", "container", "sfuso"]),
            F("temperature_controlled", "Temperatura controllata", "Temperature controlled", "bool", False),
            F("fleet", "Mezzi disponibili", "Fleet"), F("insurance", "Assicurazione (compagnia e massimale)", "Insurance (company and limit)")]},
    ],
    "collaborator": [
        {"key": "company", "title_it": "Anagrafica", "title_en": "Company", "fields": [
            F("legal_name", "Ragione sociale", "Legal name"), F("vat_id", "Partita IVA", "VAT number", pattern="vat")]},
        {"key": "lab", "title_it": "Laboratorio", "title_en": "Laboratory", "fields": [
            F("accreditations", "Accreditamenti (es. ACCREDIA)", "Accreditations"), F("labs", "Laboratori / sedi", "Laboratories / sites"),
            F("markets", "Mercati coperti", "Markets covered"), F("avg_days", "Tempi medi (giorni)", "Average turnaround (days)")]},
    ],
    "reseller": [
        {"key": "company", "title_it": "Anagrafica", "title_en": "Company", "fields": [
            F("legal_name", "Ragione sociale", "Legal name"), F("vat_id", "Partita IVA", "VAT number", pattern="vat"), F("country", "Paese", "Country")]},
        {"key": "shop", "title_it": "Negozio", "title_en": "Shop", "fields": [
            F("shop_name", "Nome del negozio", "Shop name"), F("shop_address", "Indirizzo del negozio", "Shop address"),
            F("tax_regime", "Regime fiscale", "Tax regime", "select", options=["ordinario", "forfettario", "semplificato"])]},
    ],
}

D = lambda key, it, en, required=True, expiry=False, when=None: {
    "key": key, "label_it": it, "label_en": en, "required": required, "requires_expiry": expiry, "when": when,
    "formats": ["pdf", "jpg", "jpeg", "png"], "max_mb": 10}

DOCUMENTS = {
    "producer": [
        D("visura", "Visura camerale", "Chamber of commerce extract"),
        D("health_registration", "Registrazione sanitaria / SCIA", "Health registration / SCIA"),
        D("haccp", "Piano HACCP", "HACCP plan", expiry=True),
        D("quality_certs", "Certificazioni DOP/IGP/BIO", "PDO/PGI/Organic certificates", required=False, expiry=True),
        D("rc_policy", "Polizza RC", "Liability insurance", expiry=True),
        D("fda_registration", "Registrazione FDA", "FDA registration", expiry=True, when="export_extra_eu"),
        D("us_agent", "Agente USA (US Agent)", "US Agent appointment", when="export_extra_eu"),
    ],
    "business": [
        D("visura", "Visura camerale / registro imprese", "Company register extract"),
        D("id_document", "Documento d'identità del referente", "Contact person ID", expiry=True),
        D("eori", "Codice EORI", "EORI certificate", required=False),
    ],
    "logistics": [
        D("transport_license", "Licenza / iscrizione albo autotrasporto", "Transport licence", expiry=True),
        D("atp", "Certificato ATP/ATF", "ATP/ATF certificate", expiry=True, when="temperature_controlled"),
        D("goods_rc", "Polizza RC merci", "Goods liability insurance", expiry=True),
    ],
    "collaborator": [D("visura", "Visura camerale", "Company register extract"), D("accreditation", "Certificato di accreditamento", "Accreditation certificate", expiry=True)],
    "reseller": [D("visura", "Visura camerale", "Company register extract"), D("id_document", "Documento d'identità del titolare", "Owner ID", expiry=True)],
}


async def seed_accounts():
    for role, steps in ONBOARDING.items():
        await db.onboarding_schemas.update_one({"_id": role}, {"$setOnInsert": {"steps": steps}}, upsert=True)
    for role, docs in DOCUMENTS.items():
        await db.document_requirements.update_one({"_id": role}, {"$setOnInsert": {"documents": docs}}, upsert=True)
    await db.platform_settings.update_one({"_id": "expiry_reminder_days"}, {"$setOnInsert": {"value": [30, 15, 5]}}, upsert=True)
    await db.platform_settings.update_one({"_id": "token_ttl_minutes"}, {"$setOnInsert": {"value": {"verify_email": 1440, "reset_password": 30, "totp_login": 5}}}, upsert=True)
    await db.auth_tokens.create_index("token_hash", unique=True)
    await db.auth_tokens.create_index("expires_at", expireAfterSeconds=0)
    # migrate existing accounts to the verification status model (existing approved accounts stay approved)
    async for u in db.users.find({"verification_status": {"$exists": False}, "role": {"$in": list(VERIFIABLE_ROLES)}}):
        st = "suspended" if u.get("suspended") else ("approved" if u.get("approved", True) else "pending")
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"verification_status": st, **({"verified_at": now_utc(), "verified_by": "migrazione"} if st == "approved" else {})}})


async def set_company_status(target_id: str, status: str, actor: dict, reason: Optional[str] = None):
    before = await db.users.find_one({"_id": target_id}, {"verification_status": 1, "approved": 1, "suspended": 1, "email": 1})
    upd = {"verification_status": status, "approved": status == "approved", "suspended": status == "suspended"}
    if status == "approved":
        upd.update({"verified_at": now_utc(), "verified_by": actor.get("email")})
    await db.users.update_one({"_id": target_id}, {"$set": upd})
    await db.verification_events.insert_one({"_id": str(uuid.uuid4()), "company_id": target_id, "kind": "company_status", "status": status,
                                            "reason": reason, "actor_id": str(actor["_id"]), "actor_email": actor.get("email"), "at": now_utc()})
    await audit(actor, f"company_{status}", "company", target_id, before=before, after=upd, reason=reason)


# ============================== Email verification & password reset ==============================

async def issue_token(user_id: str, purpose: str) -> str:
    ttl = (await get_setting("token_ttl_minutes", {})).get(purpose, 30)
    raw = secrets.token_urlsafe(32)
    await db.auth_tokens.insert_one({"_id": str(uuid.uuid4()), "token_hash": _h(raw), "user_id": user_id, "purpose": purpose,
                                     "expires_at": _now() + timedelta(minutes=ttl), "used_at": None})
    return raw


async def consume_token(raw: str, purpose: str) -> dict:
    doc = await db.auth_tokens.find_one_and_update(
        {"token_hash": _h(raw), "purpose": purpose, "used_at": None, "expires_at": {"$gt": _now()}}, {"$set": {"used_at": _now()}})
    if not doc:
        raise HTTPException(status_code=400, detail="Link non valido o scaduto")
    return doc


async def send_verification(user: dict):
    raw = await issue_token(str(user["_id"]), "verify_email")
    link = f"{_app_url()}/verify-email?token={raw}"
    try:
        await send_email(to=user["email"], subject="Conferma il tuo indirizzo email · 'Ra mia",
                         html=f"<p>Ciao {user.get('name','')},</p><p>conferma la tua email per completare l'accesso a 'Ra mia:</p><p><a href='{link}'>Conferma email</a></p>")
    except Exception as e:  # email failure must not block registration
        log.warning("verification email failed: %s", e)


class EmailIn(BaseModel):
    email: EmailStr


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class ResetIn(TokenIn):
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/auth/request-verification", status_code=202)
async def request_verification(user: dict = Depends(current_user)):
    if not user.get("email_verified", True):
        await send_verification(user)
    return {"message": "Se l'indirizzo è da verificare, ti abbiamo inviato un'email."}


@router.post("/auth/verify-email")
async def verify_email(body: TokenIn):
    t = await consume_token(body.token, "verify_email")
    await db.users.update_one({"_id": t["user_id"]}, {"$set": {"email_verified": True, "email_verified_at": now_utc()}})
    return {"ok": True}


@router.post("/auth/request-password-reset", status_code=202)
async def request_reset(body: EmailIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        raw = await issue_token(str(user["_id"]), "reset_password")
        try:
            await send_email(to=user["email"], subject="Reimposta la password · 'Ra mia",
                             html=f"<p>Hai chiesto di reimpostare la password.</p><p><a href='{_app_url()}/reset-password?token={raw}'>Imposta una nuova password</a></p><p>Se non sei stato tu, ignora questa email.</p>")
        except Exception as e:
            log.warning("reset email failed: %s", e)
    return {"message": "Se l'indirizzo è registrato, ti abbiamo inviato un link."}


@router.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    t = await consume_token(body.token, "reset_password")
    await db.users.update_one({"_id": t["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await tokens.revoke_all(t["user_id"])
    return {"ok": True}


# ============================== Optional TOTP 2FA ==============================

class CodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class TwoFaLoginIn(CodeIn):
    challenge: str = Field(min_length=20, max_length=200)


@router.post("/auth/2fa/setup")
async def setup_2fa(user: dict = Depends(require_roles(*TWO_FA_ROLES))):
    secret = pyotp.random_base32()
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"totp_secret_enc": _fernet.encrypt(secret.encode()).decode(), "totp_enabled": False}})
    return {"otpauth_uri": pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name="'Ra mia"), "secret": secret}


def _totp_ok(user: dict, code: str) -> bool:
    enc = user.get("totp_secret_enc")
    return bool(enc) and pyotp.TOTP(_fernet.decrypt(enc.encode()).decode()).verify(code, valid_window=1)


@router.post("/auth/2fa/confirm")
async def confirm_2fa(body: CodeIn, user: dict = Depends(require_roles(*TWO_FA_ROLES))):
    if not _totp_ok(user, body.code):
        raise HTTPException(status_code=400, detail="Codice non valido")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"totp_enabled": True}})
    return {"enabled": True}


@router.post("/auth/2fa/disable")
async def disable_2fa(body: CodeIn, user: dict = Depends(current_user)):
    if not _totp_ok(user, body.code):
        raise HTTPException(status_code=400, detail="Codice non valido")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"totp_enabled": False, "totp_secret_enc": None}})
    return {"enabled": False}


async def two_fa_challenge(user: dict) -> str:
    return await issue_token(str(user["_id"]), "totp_login")


@router.post("/auth/2fa/login")
async def login_2fa(body: TwoFaLoginIn):
    t = await consume_token(body.challenge, "totp_login")
    user = await db.users.find_one({"_id": t["user_id"]})
    if not user or not _totp_ok(user, body.code):
        raise HTTPException(status_code=401, detail="Codice di autenticazione non valido")
    from routers.auth import public_user
    return {"access_token": make_token(user), "refresh_token": await tokens.issue(str(user["_id"])), "token_type": "bearer", "user": public_user(user)}


# ============================== Onboarding (drafts + resume) ==============================

class DraftIn(BaseModel):
    step: int = Field(ge=0, le=20)
    data: Dict[str, Any]


def _check_field(f: dict, v: Any) -> Optional[str]:
    import re
    empty = v in (None, "", []) or v is False and f["kind"] != "bool"
    if f["required"] and f["kind"] != "bool" and empty:
        return f"{f['label_it']}: obbligatorio"
    if empty or not isinstance(v, str):
        return None
    pat = f.get("pattern")
    if pat == "vat" and not re.fullmatch(r"(IT)?\d{11}", v.replace(" ", ""), re.I):
        return f"{f['label_it']}: 11 cifre"
    if pat == "iban" and not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", v.replace(" ", "").upper()):
        return f"{f['label_it']}: formato IBAN non valido"
    if pat == "email" and not re.fullmatch(r"\S+@\S+\.\S+", v):
        return f"{f['label_it']}: email non valida"
    if pat and pat not in ("vat", "iban", "email") and not re.fullmatch(pat, v):
        return f"{f['label_it']}: formato non valido"
    return None


@router.get("/onboarding")
async def get_onboarding(user: dict = Depends(current_user)):
    schema = await db.onboarding_schemas.find_one({"_id": user["role"]})
    draft = await db.onboarding_drafts.find_one({"_id": str(user["_id"])}) or {}
    return {"role": user["role"], "steps": (schema or {}).get("steps", []), "step": draft.get("step", 0), "data": draft.get("data", {}),
            "status": user.get("verification_status"), "submitted_at": draft.get("submitted_at"),
            "email_verified": user.get("email_verified", True)}


@router.put("/onboarding/draft")
async def save_draft(body: DraftIn, user: dict = Depends(current_user)):
    if user.get("verification_status") in ("approved", "suspended"):
        raise HTTPException(status_code=422, detail="Profilo già verificato: contatta l'amministratore per modifiche")
    await db.onboarding_drafts.update_one({"_id": str(user["_id"])}, {"$set": {"step": body.step, "data": body.data, "updated_at": now_utc()}}, upsert=True)
    return {"ok": True}


@router.post("/onboarding/submit")
async def submit_onboarding(user: dict = Depends(current_user)):
    if user["role"] not in VERIFIABLE_ROLES:
        raise HTTPException(status_code=422, detail="Il tuo profilo non richiede verifica")
    schema = await db.onboarding_schemas.find_one({"_id": user["role"]})
    draft = await db.onboarding_drafts.find_one({"_id": str(user["_id"])}) or {}
    data = draft.get("data", {})
    errors = [e for s in schema["steps"] for f in s["fields"] if (e := _check_field(f, data.get(f["key"])))]
    checklist = await _checklist(user, data)
    missing = [c["label_it"] for c in checklist if c["required"] and c["status"] in ("missing", "rejected", "expired")]
    if missing:
        errors.append("Documenti mancanti: " + ", ".join(missing))
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors[:6]))
    await db.onboarding_drafts.update_one({"_id": str(user["_id"])}, {"$set": {"submitted_at": now_utc()}})
    await db.verification_documents.update_many({"owner_id": str(user["_id"]), "status": "uploaded", "deleted_at": None}, {"$set": {"status": "in_review"}})
    profile_upd = {k: data[k] for k in ("legal_name", "vat_id", "city", "country") if data.get(k)}
    if data.get("legal_name"):
        profile_upd["company_name"] = data["legal_name"]
    await db.users.update_one({"_id": user["_id"]}, {"$set": {**profile_upd, "verification_status": "pending", "approved": False}})
    await db.verification_events.insert_one({"_id": str(uuid.uuid4()), "company_id": str(user["_id"]), "kind": "submitted", "status": "pending",
                                            "actor_id": str(user["_id"]), "actor_email": user["email"], "at": now_utc()})
    return {"ok": True, "status": "pending"}


# ============================== Document checklist ==============================

async def _checklist(user: dict, data: Optional[dict] = None) -> list:
    if data is None:
        data = ((await db.onboarding_drafts.find_one({"_id": str(user["_id"])})) or {}).get("data", {})
    reqs = ((await db.document_requirements.find_one({"_id": user["role"]})) or {}).get("documents", [])
    docs = await db.verification_documents.find({"owner_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(200)
    out = []
    for r in reqs:
        if r.get("when") and not data.get(r["when"]):
            continue
        d = next((x for x in docs if x["req_key"] == r["key"]), None)
        out.append({**r, "status": d["status"] if d else "missing", "document": {k: (v.isoformat() if isinstance(v, datetime) else v)
                    for k, v in d.items() if k not in ("path",)} if d else None})
    return out


@router.get("/verification/checklist")
async def checklist(user: dict = Depends(current_user)):
    return {"status": user.get("verification_status"), "items": await _checklist(user)}


@router.post("/verification/documents")
async def upload_verification_doc(file: UploadFile = File(...), req_key: str = Form(...), expiry_date: Optional[str] = Form(None),
                                  user: dict = Depends(current_user)):
    reqs = ((await db.document_requirements.find_one({"_id": user["role"]})) or {}).get("documents", [])
    r = next((x for x in reqs if x["key"] == req_key), None)
    if not r:
        raise HTTPException(status_code=422, detail="Documento non previsto per il tuo profilo")
    if user.get("verification_status") == "suspended":
        raise HTTPException(status_code=403, detail="Azienda sospesa")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in r["formats"]:
        raise HTTPException(status_code=422, detail=f"Formato non ammesso: {', '.join(r['formats'])}")
    data = await file.read()
    if len(data) > r["max_mb"] * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File troppo grande (max {r['max_mb']} MB)")
    if r["requires_expiry"]:
        try:
            if date.fromisoformat(expiry_date or "") <= date.today():
                raise HTTPException(status_code=422, detail="La scadenza deve essere futura")
        except ValueError:
            raise HTTPException(status_code=422, detail="Indica la data di scadenza (AAAA-MM-GG)")
    path = f"{APP_NAME}/private/verification/{user['_id']}/{uuid.uuid4()}.{ext}"
    ctype = "application/pdf" if ext == "pdf" else f"image/{'jpeg' if ext == 'jpg' else ext}"
    try:
        await put_object(path, data, ctype)
    except Exception:
        raise HTTPException(status_code=502, detail="Caricamento non riuscito, riprova")
    await db.verification_documents.update_many({"owner_id": str(user["_id"]), "req_key": req_key, "deleted_at": None}, {"$set": {"deleted_at": now_utc()}})
    status = "in_review" if user.get("verification_status") in ("pending", "approved") else "uploaded"
    doc = {"_id": str(uuid.uuid4()), "owner_id": str(user["_id"]), "req_key": req_key, "label": r["label_it"], "filename": file.filename,
           "ext": ext, "size": len(data), "path": path, "expiry_date": expiry_date or None, "status": status,
           "reminders_sent": [], "deleted_at": None, "created_at": now_utc()}
    await db.verification_documents.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "path"} | {"created_at": doc["created_at"].isoformat()}


@router.get("/verification/documents/{doc_id}/file")
async def verification_file(doc_id: str, token: Optional[str] = Query(None), credentials=Depends(bearer)):
    user = await user_from_token(token or (credentials.credentials if credentials else None))
    d = await db.verification_documents.find_one({"_id": doc_id})
    if not d or (d["owner_id"] != str(user["_id"]) and user["role"] != "admin"):
        raise HTTPException(status_code=404, detail="Documento non trovato")
    data, ctype = await get_object(d["path"])
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "private, no-store"})


# ============================== Admin verification console ==============================

class DocReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    reason: Optional[str] = Field(None, max_length=500)


class CompanyDecisionIn(BaseModel):
    status: str = Field(pattern="^(approved|rejected|suspended|pending)$")
    reason: Optional[str] = Field(None, max_length=500)


@router.get("/admin/verification/queue")
async def verification_queue(status: str = "pending", user: dict = Depends(require_roles("admin"))):
    docs = await db.users.find({"verification_status": status, "role": {"$in": list(VERIFIABLE_ROLES)}}, {"password_hash": 0, "totp_secret_enc": 0}).sort("created_at", -1).to_list(300)
    out = []
    for u in docs:
        cl = await _checklist(u)
        out.append({"id": u["_id"], "company_name": u.get("company_name") or u.get("name"), "email": u["email"], "role": u["role"],
                    "status": u.get("verification_status"), "docs_total": len(cl), "docs_approved": sum(c["status"] == "approved" for c in cl),
                    "docs_to_review": sum(c["status"] in ("uploaded", "in_review") for c in cl)})
    return out


@router.get("/admin/verification/companies/{company_id}")
async def company_detail(company_id: str, user: dict = Depends(require_roles("admin"))):
    u = await db.users.find_one({"_id": company_id}, {"password_hash": 0, "totp_secret_enc": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Azienda non trovata")
    draft = await db.onboarding_drafts.find_one({"_id": company_id}) or {}
    events = await db.verification_events.find({"company_id": company_id}).sort("at", -1).to_list(100)
    return {"id": u["_id"], "company_name": u.get("company_name") or u.get("name"), "email": u["email"], "role": u["role"],
            "status": u.get("verification_status"), "verified_by": u.get("verified_by"),
            "verified_at": u["verified_at"].isoformat() if isinstance(u.get("verified_at"), datetime) else None,
            "onboarding": draft.get("data", {}), "checklist": await _checklist(u, draft.get("data", {})),
            "events": [{**{k: v for k, v in e.items() if k != "_id"}, "at": e["at"].isoformat()} for e in events]}


@router.patch("/admin/verification/documents/{doc_id}")
async def review_document(doc_id: str, body: DocReviewIn, user: dict = Depends(require_roles("admin"))):
    d = await db.verification_documents.find_one({"_id": doc_id, "deleted_at": None})
    if not d:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    if body.action == "reject" and not (body.reason or "").strip():
        raise HTTPException(status_code=422, detail="Indica la motivazione del rifiuto")
    st = "approved" if body.action == "approve" else "rejected"
    upd = {"status": st, "review_reason": body.reason, "reviewed_by": user["email"], "reviewed_at": now_utc()}
    await db.verification_documents.update_one({"_id": doc_id}, {"$set": upd})
    await db.verification_events.insert_one({"_id": str(uuid.uuid4()), "company_id": d["owner_id"], "kind": "document", "document": d["req_key"],
                                            "status": st, "reason": body.reason, "actor_id": str(user["_id"]), "actor_email": user["email"], "at": now_utc()})
    await audit(user, f"document_{st}", "verification_document", doc_id, before={"status": d["status"]}, after=upd, reason=body.reason)
    return {"ok": True, "status": st}


@router.patch("/admin/verification/companies/{company_id}")
async def decide_company(company_id: str, body: CompanyDecisionIn, user: dict = Depends(require_roles("admin"))):
    u = await db.users.find_one({"_id": company_id})
    if not u or u["role"] not in VERIFIABLE_ROLES:
        raise HTTPException(status_code=404, detail="Azienda non trovata")
    if body.status in ("rejected", "suspended") and not (body.reason or "").strip():
        raise HTTPException(status_code=422, detail="Indica la motivazione")
    if body.status == "approved":
        cl = await _checklist(u)
        pending = [c["label_it"] for c in cl if c["required"] and c["status"] != "approved"]
        if pending:
            raise HTTPException(status_code=422, detail="Documenti obbligatori non approvati: " + ", ".join(pending))
    await set_company_status(company_id, body.status, user, body.reason)
    return {"ok": True, "status": body.status}


@router.get("/admin/compliance-log.csv")
async def compliance_log(user: dict = Depends(require_roles("admin"))):
    """Trader traceability log (marketplace 'know your business customer'): identity, contacts, registration, verification trail."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["azienda_id", "ruolo", "ragione_sociale", "partita_iva", "indirizzo", "paese", "email", "telefono", "stato_verifica",
                "verificato_da", "verificato_il", "documenti", "ultimo_evento"])
    async for u in db.users.find({"role": {"$in": list(VERIFIABLE_ROLES)}}):
        draft = (await db.onboarding_drafts.find_one({"_id": u["_id"]}) or {}).get("data", {})
        docs = await db.verification_documents.find({"owner_id": u["_id"], "deleted_at": None}).to_list(50)
        last = await db.verification_events.find_one({"company_id": u["_id"]}, sort=[("at", -1)])
        w.writerow([u["_id"], u["role"], draft.get("legal_name") or u.get("company_name") or u.get("name"), draft.get("vat_id", ""),
                    " ".join(filter(None, [draft.get("street"), draft.get("city") or u.get("city"), draft.get("zip")])),
                    draft.get("country", ""), u["email"], draft.get("contact_phone") or u.get("phone") or "", u.get("verification_status", ""),
                    u.get("verified_by", ""), u["verified_at"].isoformat() if isinstance(u.get("verified_at"), datetime) else "",
                    " | ".join(f"{d['req_key']}:{d['status']}:{d.get('expiry_date') or '-'}:{d.get('reviewed_by') or '-'}" for d in docs),
                    f"{last['kind']}:{last['status']}:{last['actor_email']}:{last['at'].isoformat()}" if last else ""])
    await audit(user, "export", "compliance_log", "csv")
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=ramia-compliance-{date.today().isoformat()}.csv"})


# ============================== Expiry job ==============================

async def run_expiry_check():
    days = sorted(await get_setting("expiry_reminder_days", [30, 15, 5]), reverse=True)
    today = date.today()
    async for d in db.verification_documents.find({"deleted_at": None, "expiry_date": {"$ne": None}, "status": {"$in": ["approved", "in_review", "uploaded"]}}):
        try:
            left = (date.fromisoformat(d["expiry_date"]) - today).days
        except ValueError:
            continue
        owner = await db.users.find_one({"_id": d["owner_id"]})
        if not owner:
            continue
        if left <= 0:
            await db.verification_documents.update_one({"_id": d["_id"]}, {"$set": {"status": "expired"}})
            await db.verification_events.insert_one({"_id": str(uuid.uuid4()), "company_id": d["owner_id"], "kind": "document", "document": d["req_key"],
                                                    "status": "expired", "actor_id": "system", "actor_email": "system", "at": now_utc()})
            await _notify(owner, f"Documento scaduto: {d['label']}", "Carica la versione aggiornata per mantenere la verifica.")
            continue
        # closest threshold reached and not yet notified; larger thresholds are considered covered (no back-fill spam)
        reached = [x for x in days if left <= x]
        due = min(reached) if reached and min(reached) not in d.get("reminders_sent", []) else None
        if due is not None:
            await db.verification_documents.update_one({"_id": d["_id"]}, {"$addToSet": {"reminders_sent": {"$each": reached}}})
            await _notify(owner, f"{d['label']} scade tra {left} giorni", f"Scadenza: {d['expiry_date']}. Caricane una versione aggiornata.")


async def _notify(user: dict, title: str, body: str):
    await db.notifications.insert_one({"_id": str(uuid.uuid4()), "user_id": str(user["_id"]), "title": title, "body": body, "read": False, "created_at": now_utc()})
    try:
        await send_email(to=user["email"], subject=f"{title} · 'Ra mia", html=f"<p>{body}</p>")
    except Exception as e:
        log.warning("reminder email failed: %s", e)


async def _expiry_loop():
    while True:
        try:
            await run_expiry_check()
        except Exception as e:
            log.warning("expiry check failed: %s", e)
        await asyncio.sleep(int(await get_setting("expiry_check_seconds", 21600)))


def start_expiry_job():
    asyncio.create_task(_expiry_loop())


@router.get("/notifications")
async def my_notifications(user: dict = Depends(current_user)):
    docs = await db.notifications.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(100)
    return [{**{k: v for k, v in d.items() if k != "_id"}, "id": d["_id"], "created_at": d["created_at"].isoformat()} for d in docs]


@router.post("/admin/verification/run-expiry")
async def run_expiry_now(user: dict = Depends(require_roles("admin"))):
    await run_expiry_check()
    return {"ok": True}
