import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext

from db import db

SECRET = os.environ["JWT_SECRET"]
ALGORITHM = "HS256"
EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "1440"))

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = pwd.hash("unusable-dummy-password")


def hash_password(value: str) -> str:
    return pwd.hash(value)


def verify_password(value: str, hashed: str) -> bool:
    try:
        return pwd.verify(value, hashed)
    except Exception:
        return False


def make_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(minutes=EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


async def user_from_token(raw: Optional[str]) -> dict:
    unauth = HTTPException(
        status_code=401, detail="Non autorizzato", headers={"WWW-Authenticate": "Bearer"}
    )
    if not raw:
        raise unauth
    try:
        payload = jwt.decode(
            raw, SECRET, algorithms=[ALGORITHM], options={"require": ["sub", "exp"]}
        )
        uid: Any
        try:
            uid = ObjectId(payload["sub"])
        except Exception:
            uid = payload["sub"]
        user = await db.users.find_one({"_id": uid})
    except (InvalidTokenError, KeyError, ValueError):
        raise unauth
    if not user:
        raise unauth
    return user


def _raw_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    token_query: str | None = None,
) -> Optional[str]:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    return token_query


async def current_user(user_raw: str = Depends(_raw_token)) -> dict:
    return await user_from_token(user_raw)


def require_roles(*allowed: str):
    async def dependency(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Ruolo non autorizzato")
        return user

    return dependency


def require_approved_roles(*allowed: str):
    async def dependency(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Ruolo non autorizzato")
        if not user.get("approved", True):
            raise HTTPException(status_code=403, detail="Account in attesa di approvazione dall'amministratore")
        return user

    return dependency
