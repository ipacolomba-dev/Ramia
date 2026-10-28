"""Central audit log: who, what, when, before/after for every administrative action."""
import uuid
from datetime import datetime
from typing import Any, Optional

from db import db
from models import now_utc


def _plain(v: Any):
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items() if k not in ("password_hash",)}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    if isinstance(v, datetime):
        return v.isoformat()
    return v


async def audit(actor: dict, action: str, entity: str, entity_id: str,
                before: Optional[dict] = None, after: Optional[dict] = None, reason: Optional[str] = None):
    await db.audit_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "actor_id": str(actor["_id"]), "actor_email": actor.get("email"), "actor_role": actor.get("role"),
        "action": action, "entity": entity, "entity_id": str(entity_id),
        "before": _plain(before) if before else None, "after": _plain(after) if after else None,
        "reason": reason, "at": now_utc(),
    })
