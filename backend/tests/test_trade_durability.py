"""Durability tests for async Market Analyses (trade assistant).

These are in-process tests that exercise the real worker/recovery logic against the
shared MongoDB (no HTTP server needed). They verify that:
  - a successful run -> status "ready" (attempt counted once);
  - repeated failures -> controlled retries, then status "error" (never stuck pending);
  - a run that hangs is cut by WORKER_TIMEOUT and ends as "error";
  - the claim is idempotent (a terminal doc is not reprocessed);
  - orphaned/stuck pending docs (simulating a restart/crash) are recovered by the sweep.

We monkeypatch only module-level hooks (_compute_market, _delayed_retry) and tuning
constants on routers.trade, and point trade.db at a fresh client bound to the test loop.
"""
import asyncio
import os
import uuid
from datetime import timedelta

from motor.motor_asyncio import AsyncIOMotorClient

import routers.trade as trade

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")


def run(coro):
    return asyncio.run(coro)


class _Patch:
    """Temporarily override attributes on routers.trade, restoring them afterwards."""

    def __init__(self, **kw):
        self.kw = kw
        self.old = {}

    def __enter__(self):
        for k, v in self.kw.items():
            self.old[k] = getattr(trade, k)
            setattr(trade, k, v)
        return self

    def __exit__(self, *a):
        for k, v in self.old.items():
            setattr(trade, k, v)


async def _with_db(fn):
    client = AsyncIOMotorClient(MONGO_URL)
    test_db = client[DB_NAME]
    old_db = trade.db
    trade.db = test_db
    try:
        return await fn(test_db)
    finally:
        trade.db = old_db
        client.close()


async def _seed_pending(test_db, attempts=0, updated_delta=0):
    prod = await test_db.products.find_one({"deleted_at": None})
    assert prod, "seed product required"
    now = trade.now_utc()
    doc_id = f"test-dur-{uuid.uuid4()}"
    await test_db.trade_analyses.insert_one({
        "_id": doc_id,
        "producer_id": str(prod["producer_id"]),
        "product_id": str(prod["_id"]),
        "product_name": prod.get("name"),
        "country": "Testlandia",
        "version": 1,
        "status": "pending",
        "data": {},
        "missing_info": [],
        "extra": {},
        "attempts": attempts,
        "error": None,
        "live": False,
        "created_at": now,
        "updated_at": now - timedelta(seconds=updated_delta),
        "started_at": None,
    })
    return doc_id


async def _ok_compute(product, extra, country):
    return ({"summary": "ok", "sources": [], "reliability": "unverified"}, False)


async def _boom_compute(product, extra, country):
    raise RuntimeError("boom")


async def _slow_compute(product, extra, country):
    await asyncio.sleep(3)
    return ({"summary": "late", "sources": []}, False)


async def _noop_retry(doc_id):
    return None


def test_worker_success_marks_ready():
    async def inner(test_db):
        doc_id = await _seed_pending(test_db)
        with _Patch(_compute_market=_ok_compute, _delayed_retry=_noop_retry):
            await trade._run_market_analysis(doc_id)
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "ready"
    assert d["attempts"] == 1
    assert d["data"]["summary"] == "ok"
    assert d["error"] is None


def test_failures_retry_then_error_never_stuck_pending():
    async def inner(test_db):
        doc_id = await _seed_pending(test_db)
        with _Patch(_compute_market=_boom_compute, _delayed_retry=_noop_retry, MAX_ATTEMPTS=2, RETRY_DELAY=0):
            await trade._run_market_analysis(doc_id)  # attempt 1 -> still pending (retry scheduled)
            mid = await test_db.trade_analyses.find_one({"_id": doc_id})
            assert mid["status"] == "pending" and mid["attempts"] == 1
            await trade._run_market_analysis(doc_id)  # attempt 2 -> exhausted -> error
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "error"
    assert d["attempts"] == 2
    assert d["error"]


def test_hanging_run_is_cut_by_timeout():
    async def inner(test_db):
        doc_id = await _seed_pending(test_db)
        with _Patch(_compute_market=_slow_compute, _delayed_retry=_noop_retry, WORKER_TIMEOUT=0.2, MAX_ATTEMPTS=1):
            await trade._run_market_analysis(doc_id)
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "error"
    assert "timeout" in (d["error"] or "")


def test_claim_is_idempotent_on_terminal_doc():
    async def inner(test_db):
        doc_id = await _seed_pending(test_db)
        with _Patch(_compute_market=_ok_compute, _delayed_retry=_noop_retry):
            await trade._run_market_analysis(doc_id)  # -> ready, attempts 1
            await trade._run_market_analysis(doc_id)  # terminal: must be a no-op
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "ready"
    assert d["attempts"] == 1  # second invocation claimed nothing


def test_restart_recovery_completes_stale_orphaned_pending():
    """Simulate a crash/restart: a pending doc untouched beyond STALE_SECONDS is re-enqueued
    by the periodic sweep and driven to completion."""
    async def inner(test_db):
        doc_id = await _seed_pending(test_db, attempts=0, updated_delta=trade.STALE_SECONDS + 120)
        with _Patch(_compute_market=_ok_compute, _delayed_retry=_noop_retry):
            await trade.recover_pending_analyses(startup=False)
            spawned = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
            if spawned:
                await asyncio.wait(spawned, timeout=10)
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "ready"
    assert d["attempts"] == 1


def test_recovery_gives_up_after_max_attempts():
    """A stale pending doc that already used all attempts is marked error by the sweep."""
    async def inner(test_db):
        doc_id = await _seed_pending(test_db, attempts=3, updated_delta=trade.STALE_SECONDS + 120)
        with _Patch(_compute_market=_boom_compute, _delayed_retry=_noop_retry, MAX_ATTEMPTS=3):
            await trade.recover_pending_analyses(startup=False)
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "error"
    assert d["error"] == "max_attempts_exceeded"


def test_fresh_pending_not_touched_by_periodic_sweep():
    """A recently-updated pending doc (a live worker) must NOT be recovered by the periodic sweep."""
    async def inner(test_db):
        doc_id = await _seed_pending(test_db, attempts=1, updated_delta=0)  # fresh
        with _Patch(_compute_market=_ok_compute, _delayed_retry=_noop_retry):
            await trade.recover_pending_analyses(startup=False)
            spawned = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
            if spawned:
                await asyncio.wait(spawned, timeout=5)
        d = await test_db.trade_analyses.find_one({"_id": doc_id})
        await test_db.trade_analyses.delete_one({"_id": doc_id})
        return d

    d = run(_with_db(inner))
    assert d["status"] == "pending"
    assert d["attempts"] == 1  # untouched
