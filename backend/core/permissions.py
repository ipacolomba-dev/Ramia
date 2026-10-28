"""Role -> permission matrix, stored in MongoDB (`role_permissions`) and enforced server-side.

Use `Depends(require_perm("rfq:create"))` on endpoints. Admin always passes.
The defaults below only seed an empty database; the admin edits the matrix afterwards.
"""
import time

from fastapi import Depends, HTTPException

from db import db
from security import current_user

ROLES = ("admin", "producer", "business", "consumer", "logistics", "collaborator", "reseller")

DEFAULT_MATRIX = {
    "producer": ["catalog:manage", "lots:manage", "offers:manage", "rfq:respond", "orders:received", "earnings:view",
                 "shipping:book", "labels:request", "documents:manage", "trade:use", "deals:declare", "visibility:buy"],
    "business": ["market:buy", "rfq:create", "negotiation:start", "shipping:book", "analytics:view"],
    "reseller": ["market:buy", "rfq:create", "negotiation:start", "shipping:book", "analytics:view"],
    "consumer": ["market:buy", "analytics:view"],
    "logistics": ["shipping:quote", "shipping:track"],
    "collaborator": ["labels:offer", "documents:manage"],
    "admin": ["*"],
}

# Roles whose account must be approved by an admin before using professional features.
APPROVAL_ROLES = ("business", "collaborator", "logistics", "reseller")

_cache: dict = {"at": 0.0, "matrix": None}


async def seed_permissions():
    for role, perms in DEFAULT_MATRIX.items():
        await db.role_permissions.update_one({"_id": role}, {"$setOnInsert": {"permissions": perms}}, upsert=True)


async def get_matrix(force: bool = False) -> dict:
    if force or _cache["matrix"] is None or time.time() - _cache["at"] > 30:
        docs = await db.role_permissions.find({}).to_list(50)
        _cache["matrix"] = {d["_id"]: d.get("permissions", []) for d in docs}
        _cache["at"] = time.time()
    return _cache["matrix"]


def invalidate_cache():
    _cache["matrix"] = None


async def has_perm(user: dict, perm: str) -> bool:
    if user["role"] == "admin":
        return True
    perms = (await get_matrix()).get(user["role"], [])
    return "*" in perms or perm in perms


def require_perm(perm: str, approved: bool = False):
    async def dependency(user: dict = Depends(current_user)) -> dict:
        if not await has_perm(user, perm):
            raise HTTPException(status_code=403, detail="Permesso negato per il tuo ruolo")
        if approved and not user.get("approved", True):
            raise HTTPException(status_code=403, detail="Account in attesa di approvazione dall'amministratore")
        return user

    return dependency
