"""Opaque rotating refresh tokens (hashed at rest, one-time use, replay revokes the whole family)."""
import hashlib
import os
import secrets
import uuid
from datetime import timedelta
from typing import Optional

from pymongo import ReturnDocument

from db import db
from models import now_utc

REFRESH_DAYS = int(os.environ.get("REFRESH_TOKEN_DAYS", "30"))


def _sha(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


async def ensure_indexes():
    await db.refresh_tokens.create_index("token_hash", unique=True)
    await db.refresh_tokens.create_index("family_id")
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)


async def issue(user_id: str, family_id: Optional[str] = None) -> str:
    raw = secrets.token_urlsafe(64)
    now = now_utc()
    await db.refresh_tokens.insert_one({
        "_id": str(uuid.uuid4()), "user_id": str(user_id), "family_id": family_id or str(uuid.uuid4()),
        "token_hash": _sha(raw), "created_at": now, "expires_at": now + timedelta(days=REFRESH_DAYS),
        "revoked_at": None, "replaced_by": None,
    })
    return raw


async def rotate(raw: str) -> Optional[tuple[str, str]]:
    """Returns (user_id, new_refresh) or None when invalid. Reuse of a consumed token revokes its family."""
    cur = await db.refresh_tokens.find_one({"token_hash": _sha(raw)})
    if not cur:
        return None
    now = now_utc()
    if cur.get("revoked_at") is not None:
        await db.refresh_tokens.update_many({"family_id": cur["family_id"], "revoked_at": None}, {"$set": {"revoked_at": now}})
        return None
    exp = cur["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=now.tzinfo)
    if exp <= now:
        return None
    new_id = str(uuid.uuid4())
    consumed = await db.refresh_tokens.find_one_and_update(
        {"_id": cur["_id"], "revoked_at": None},
        {"$set": {"revoked_at": now, "replaced_by": new_id}}, return_document=ReturnDocument.BEFORE,
    )
    if consumed is None:
        await db.refresh_tokens.update_many({"family_id": cur["family_id"], "revoked_at": None}, {"$set": {"revoked_at": now}})
        return None
    new_raw = secrets.token_urlsafe(64)
    await db.refresh_tokens.insert_one({
        "_id": new_id, "user_id": cur["user_id"], "family_id": cur["family_id"], "token_hash": _sha(new_raw),
        "created_at": now, "expires_at": now + timedelta(days=REFRESH_DAYS), "revoked_at": None, "replaced_by": None,
    })
    return cur["user_id"], new_raw


async def revoke(raw: str):
    await db.refresh_tokens.update_one({"token_hash": _sha(raw), "revoked_at": None}, {"$set": {"revoked_at": now_utc()}})


async def revoke_all(user_id: str):
    await db.refresh_tokens.update_many({"user_id": str(user_id), "revoked_at": None}, {"$set": {"revoked_at": now_utc()}})
