from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, ValidationError

from db import db
from core import tokens
from models import BuyerProfileIn, LocaleIn, LoginIn, ProducerProfileIn, RegisterIn, now_utc
from security import current_user, hash_password, make_token, verify_password, DUMMY_HASH

router = APIRouter(prefix="/auth", tags=["auth"])

# Legal document versions stamped on each consent (bump when the texts change).
TERMS_VERSION = "2026-06"
PRIVACY_VERSION = "2026-06"

PUBLIC_FIELDS = (
    "email", "name", "role", "locale", "company_name", "region",
    "business_type", "specialty", "fleet_info", "featured_until", "created_at",
    "approved", "bio", "bio_en", "website", "phone", "city",
    "logistics_service", "certifications", "awards", "fairs", "billing",
    "email_verified", "marketing_consent",
    "verification_status", "totp_enabled",
)


# Roles that operate immediately; others wait for owner approval.
AUTO_APPROVED_ROLES = ("consumer", "admin")


def public_user(u: dict) -> dict:
    from datetime import datetime

    d = {"id": str(u["_id"])}
    for f in PUBLIC_FIELDS:
        v = u.get(f)
        if f == "approved" and v is None:
            v = True
        if f == "email_verified" and v is None:
            v = True  # legacy accounts predate verification -> no banner
        d[f] = v.isoformat() if isinstance(v, datetime) else v
    return d


def _build_consents(body: RegisterIn) -> dict:
    now = now_utc()
    c = body.consents
    if not c or not c.terms or not c.privacy:
        raise HTTPException(status_code=422, detail="Devi accettare condizioni e informativa privacy")
    return {
        "terms": {"accepted": True, "version": TERMS_VERSION, "at": now},
        "privacy": {"accepted": True, "version": PRIVACY_VERSION, "at": now},
        "marketing": {"accepted": bool(c.marketing), "version": PRIVACY_VERSION, "at": now},
    }


def _normalize_profile(body: RegisterIn) -> tuple[dict, dict]:
    """Validate the role-specific profile (producer typed) and derive backward-compatible
    top-level fields. Returns (structured_profile, derived_top_level)."""
    profile: dict = {}
    derived: dict = {}
    if body.role == "producer" and body.profile:
        try:
            p = ProducerProfileIn(**body.profile)
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=f"Dati profilo non validi: {e.errors()[:1]}")
        profile = p.model_dump(exclude_none=True)
        derived["company_name"] = p.company.brand_name or p.company.legal_name or body.company_name
        derived["region"] = (p.legal_address.region or p.legal_address.city or body.region)
        derived["certifications"] = p.certifications or None
        if p.company.website:
            derived["website"] = p.company.website
        if p.company.phone:
            derived["phone"] = p.company.phone
        if p.legal_address.city:
            derived["city"] = p.legal_address.city
    elif body.role in ("business", "reseller") and body.profile:
        try:
            b = BuyerProfileIn(**body.profile)
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=f"Dati profilo non validi: {e.errors()[:1]}")
        profile = b.model_dump(exclude_none=True)
        derived["company_name"] = b.company.brand_name or b.company.legal_name or body.company_name
        derived["region"] = b.legal_address.region or b.legal_address.country or body.region
        if b.company.website:
            derived["website"] = b.company.website
        if b.company.phone:
            derived["phone"] = b.company.phone
        if b.legal_address.city:
            derived["city"] = b.legal_address.city
    elif body.profile:
        # Other roles (Fase 2): store the raw dict for now (still server-bounded in Fase 2).
        profile = body.profile
    return profile, derived


async def _register_user(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email già registrata")
    consents = _build_consents(body)
    profile, derived = _normalize_profile(body)
    user = {
        "_id": str(__import__("uuid").uuid4()),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "locale": body.locale,
        "company_name": derived.get("company_name") or body.company_name,
        "region": derived.get("region") or body.region,
        "business_type": body.business_type,
        "specialty": body.specialty,
        "fleet_info": body.fleet_info,
        "featured_until": None,
        "approved": body.role in AUTO_APPROVED_ROLES,
        # B2B features unlock only when the company verification reaches "approved"
        "verification_status": None if body.role in AUTO_APPROVED_ROLES else "draft",
        "email_verified": False,
        "consents": consents,
        "marketing_consent": consents["marketing"]["accepted"],
        "profile": profile or None,
        "created_at": now_utc(),
    }
    for k in ("certifications", "website", "phone", "city"):
        if derived.get(k):
            user[k] = derived[k]
    await db.users.insert_one(user)
    return user


@router.post("/register")
async def register(body: RegisterIn):
    user = await _register_user(body)
    from routers.accounts import send_verification
    await send_verification(user)
    return {"access_token": make_token(user), "refresh_token": await tokens.issue(str(user["_id"])), "token_type": "bearer", "user": public_user(user)}


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        verify_password(body.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account sospeso: contatta l'amministratore")
    if user.get("totp_enabled"):
        from routers.accounts import two_fa_challenge
        return {"two_factor_required": True, "challenge": await two_fa_challenge(user)}
    return {"access_token": make_token(user), "refresh_token": await tokens.issue(str(user["_id"])), "token_type": "bearer", "user": public_user(user)}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


@router.patch("/me")
async def update_me(body: LocaleIn, user: dict = Depends(current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"locale": body.locale}})
    user["locale"] = body.locale
    return public_user(user)


@router.post("/change-password")
async def change_password(body: dict, user: dict = Depends(current_user)):
    new_pwd = (body or {}).get("new_password", "")
    if len(new_pwd) < 8:
        raise HTTPException(status_code=422, detail="Password troppo corta (min 8)")
    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {"password_hash": hash_password(new_pwd)}}
    )
    return {"ok": True}


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


@router.post("/refresh")
async def refresh_token(body: RefreshIn):
    """Rotates the refresh token (one-time use) and issues a new access token."""
    res = await tokens.rotate(body.refresh_token)
    if not res:
        raise HTTPException(status_code=401, detail="Sessione scaduta, accedi di nuovo")
    user_id, new_refresh = res
    user = await db.users.find_one({"_id": user_id})
    if not user or user.get("suspended"):
        raise HTTPException(status_code=401, detail="Sessione non valida")
    return {"access_token": make_token(user), "refresh_token": new_refresh, "token_type": "bearer", "user": public_user(user)}


@router.post("/logout")
async def logout(body: RefreshIn):
    await tokens.revoke(body.refresh_token)
    return {"ok": True}


@router.post("/logout-all")
async def logout_all(user: dict = Depends(current_user)):
    await tokens.revoke_all(str(user["_id"]))
    return {"ok": True}
