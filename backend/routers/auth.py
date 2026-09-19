from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr

from db import db
from models import LocaleIn, LoginIn, RegisterIn, now_utc
from security import current_user, hash_password, make_token, verify_password, DUMMY_HASH

router = APIRouter(prefix="/auth", tags=["auth"])

PUBLIC_FIELDS = (
    "email", "name", "role", "locale", "company_name", "region",
    "business_type", "specialty", "fleet_info", "featured_until", "created_at",
)


def public_user(u: dict) -> dict:
    from datetime import datetime

    d = {"id": str(u["_id"])}
    for f in PUBLIC_FIELDS:
        v = u.get(f)
        d[f] = v.isoformat() if isinstance(v, datetime) else v
    return d


async def _register_user(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email già registrata")
    user = {
        "_id": str(__import__("uuid").uuid4()),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "locale": body.locale,
        "company_name": body.company_name,
        "region": body.region,
        "business_type": body.business_type,
        "specialty": body.specialty,
        "fleet_info": body.fleet_info,
        "featured_until": None,
        "created_at": now_utc(),
    }
    await db.users.insert_one(user)
    return user


@router.post("/register")
async def register(body: RegisterIn):
    user = await _register_user(body)
    return {"access_token": make_token(user), "user": public_user(user)}


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        verify_password(body.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    return {"access_token": make_token(user), "user": public_user(user)}


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
