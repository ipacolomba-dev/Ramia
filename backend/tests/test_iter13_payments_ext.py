"""Iter13: extended regression for escrow payments, payouts, Connect, Match Registry and rate-card engine (public URL)."""
import asyncio
import os
import sys
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/") + "/api"
ORIGIN = "https://example.test"
sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(__file__))
# share ONE event loop with test_payments_logistics: the app's motor client binds to the first loop that uses it
from test_payments_logistics import LOOP  # noqa: E402


def login(email, pwd="Demo1234!"):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def mongo(fn):
    async def run():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            return await fn(c[os.environ["DB_NAME"]])
        finally:
            c.close()
    return LOOP.run_until_complete(run())


def mark_paid(kind, ref_id, user_h, amount=0):
    async def go(_db):
        from routers import payments
        me = requests.get(f"{BASE}/auth/me", headers=user_h).json()
        tx = {"_id": str(uuid.uuid4()), "session_id": f"cs_test_{uuid.uuid4().hex}", "kind": kind, "ref_id": ref_id,
              "user_id": me["id"], "amount": amount, "processed": False, "payment_status": "paid"}
        if kind == "order":
            tx["amount"] = (await _db.orders.find_one({"_id": ref_id}))["total"]
        await _db.payment_transactions.insert_one(tx)
        await payments._fulfill(tx)
        return tx
    return mongo(go)


@pytest.fixture(scope="module")
def H():
    return {"consumer": login("consumatore@demo.it"), "producer": login("produttore@demo.it"),
            "business": login("business@demo.it"), "logistics": login("logistica@demo.it"),
            "admin": login("admin@saporidisicilia.it", "SaporiAdmin2026!")}


def new_order(h):
    prods = requests.get(f"{BASE}/products", headers=h).json()
    p = next(x for x in prods if x.get("stock", 0) > 2)
    r = requests.post(f"{BASE}/orders", headers=h, json={"items": [{"product_id": p["id"], "qty": 1}],
                      "address": "Via Roma 1", "city": "Palermo", "zip": "90100", "phone": "3330000000"})
    assert r.status_code in (200, 201), r.text
    return r.json()


# --- Checkout ---
def test_checkout_stripe_url_and_order_fields(H):
    o = new_order(H["consumer"])
    assert o["status"] == "awaiting_payment" and o.get("payment") == "stripe"
    r = requests.post(f"{BASE}/payments/checkout", headers=H["consumer"], json={"kind": "order", "ref_id": o["id"], "origin_url": ORIGIN})
    assert r.status_code == 200, r.text
    assert "checkout.stripe.com" in r.json()["url"]
    # other user cannot pay someone else's order
    r2 = requests.post(f"{BASE}/payments/checkout", headers=H["business"], json={"kind": "order", "ref_id": o["id"], "origin_url": ORIGIN})
    assert r2.status_code == 404


def test_checkout_paid_order_422_and_cancel_paid_422(H):
    o = new_order(H["consumer"])
    mark_paid("order", o["id"], H["consumer"])
    r = requests.post(f"{BASE}/payments/checkout", headers=H["consumer"], json={"kind": "order", "ref_id": o["id"], "origin_url": ORIGIN})
    assert r.status_code == 422
    assert requests.post(f"{BASE}/orders/{o['id']}/cancel", headers=H["consumer"]).status_code == 422
    # admin release with audit
    r = requests.post(f"{BASE}/admin/escrow/order/{o['id']}/resolve", headers=H["admin"], json={"action": "release", "note": "Consegna verificata"})
    assert r.status_code == 200 and r.json()["escrow"]["status"] == "released"
    r = requests.post(f"{BASE}/admin/escrow/order/{o['id']}/resolve", headers=H["admin"], json={"action": "release", "note": "di nuovo"})
    assert r.status_code == 422


def test_dispute_validation(H):
    o = new_order(H["consumer"])
    # unpaid → cannot dispute
    assert requests.post(f"{BASE}/orders/{o['id']}/dispute", headers=H["consumer"], json={"reason": "Merce rotta"}).status_code == 422
    mark_paid("order", o["id"], H["consumer"])
    assert requests.post(f"{BASE}/orders/{o['id']}/dispute", headers=H["consumer"], json={"reason": "ko"}).status_code == 422
    requests.post(f"{BASE}/orders/{o['id']}/cancel", headers=H["consumer"])  # no-op


def test_checkout_visibility_producer_only(H):
    r = requests.post(f"{BASE}/payments/checkout", headers=H["consumer"], json={"kind": "visibility", "ref_id": "x", "origin_url": ORIGIN})
    assert r.status_code == 403


# --- Admin settings / auto release ---
def test_payment_settings_bounds_and_auto_release(H):
    assert requests.put(f"{BASE}/admin/payment-settings", headers=H["admin"], json={"auto_release_days": 0}).status_code == 422
    assert requests.put(f"{BASE}/admin/payment-settings", headers=H["admin"], json={"auto_release_days": 61}).status_code == 422
    assert requests.put(f"{BASE}/admin/payment-settings", headers=H["producer"], json={"auto_release_days": 7}).status_code == 403
    r = requests.put(f"{BASE}/admin/payment-settings", headers=H["admin"], json={"auto_release_days": 7})
    assert r.status_code == 200 and r.json()["auto_release_days"] == 7
    r = requests.post(f"{BASE}/admin/escrow/run-auto-release", headers=H["admin"])
    assert r.status_code == 200 and isinstance(r.json()["released"], int)
    esc = requests.get(f"{BASE}/admin/escrow", headers=H["admin"]).json()
    assert esc["settings"]["auto_release_days"] == 7 and esc["stripe_mode"] == "test"


# --- Payouts & Connect ---
def test_payouts_mine_roles(H):
    for role in ("producer", "logistics"):
        r = requests.get(f"{BASE}/payouts/mine", headers=H[role])
        assert r.status_code == 200
        d = r.json()
        assert {"held", "pending_connect", "transferred", "payouts", "connect"} <= set(d)
    assert requests.get(f"{BASE}/payouts/mine", headers=H["consumer"]).status_code == 403


def test_connect_onboard_503_italian(H):
    r = requests.post(f"{BASE}/payments/connect/onboard", headers=H["producer"], json={"origin_url": ORIGIN})
    assert r.status_code == 503 and "Stripe Connect" in r.json()["detail"]


# --- Match Registry ---
def test_matches_role_scoped(H):
    allm = requests.get(f"{BASE}/matches", headers=H["admin"]).json()
    me = requests.get(f"{BASE}/auth/me", headers=H["producer"]).json()["id"]
    mine = requests.get(f"{BASE}/matches", headers=H["producer"]).json()
    assert all(m["producer_id"] == me or m["buyer_id"] == me for m in mine)
    assert len(allm) >= len(mine)
    assert requests.get(f"{BASE}/admin/matches/verify", headers=H["producer"]).status_code == 403
    assert requests.get(f"{BASE}/admin/matches/verify", headers=H["admin"]).json()["valid"] is True


# --- Rate cards CRUD ---
def test_rate_card_crud(H):
    body = {"name": "TEST_card Sicilia Veneto", "origin_region": "Sicilia", "destination_region": "Veneto",
            "price_per_pallet": 100, "price_per_kg": 0, "min_charge": 50, "fuel_surcharge_pct": 10, "transit_days": 4}
    r = requests.post(f"{BASE}/logistics/rate-cards", headers=H["logistics"], json=body)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert any(c["id"] == cid for c in requests.get(f"{BASE}/logistics/rate-cards/mine", headers=H["logistics"]).json())
    q = requests.post(f"{BASE}/logistics/instant-quote", headers=H["producer"],
                      json={"origin_region": "sicilia", "destination_region": "Veneto", "pallets": 2}).json()
    opt = next(o for o in q["options"] if o["card_id"] == cid)
    assert opt["breakdown"]["carrier_price"] == 220.0
    r = requests.patch(f"{BASE}/logistics/rate-cards/{cid}", headers=H["logistics"], json={**body, "price_per_pallet": 150})
    assert r.status_code == 200 and r.json()["price_per_pallet"] == 150
    assert requests.patch(f"{BASE}/logistics/rate-cards/{cid}", headers=H["producer"], json=body).status_code == 403
    assert requests.delete(f"{BASE}/logistics/rate-cards/{cid}", headers=H["logistics"]).status_code == 200
    assert not any(c["id"] == cid for c in requests.get(f"{BASE}/logistics/rate-cards/mine", headers=H["logistics"]).json())
    q = requests.post(f"{BASE}/logistics/instant-quote", headers=H["producer"],
                      json={"origin_region": "Sicilia", "destination_region": "Veneto", "pallets": 2}).json()
    assert not any(o["card_id"] == cid for o in q["options"])


def test_instant_quote_no_match_and_consumer_forbidden(H):
    r = requests.post(f"{BASE}/logistics/instant-quote", headers=H["producer"], json={"origin_region": "Sardegna", "destination_region": "Molise"})
    assert r.status_code == 200 and r.json()["count"] == 0 and r.json()["range"] is None
    assert requests.post(f"{BASE}/logistics/instant-quote", headers=H["consumer"], json={"origin_region": "Sicilia", "destination_region": "Lazio"}).status_code == 403


def test_book_then_shipment_checkout_and_snapshot(H):
    q = {"origin_region": "Sicilia", "destination_region": "Lombardia", "pallets": 1, "weight_kg": 100}
    res = requests.post(f"{BASE}/logistics/instant-quote", headers=H["producer"], json=q).json()
    opt = res["options"][0]
    b = requests.post(f"{BASE}/logistics/instant-quote/book", headers=H["producer"], json={**q, "card_id": opt["card_id"], "title": "TEST_pallet"})
    assert b.status_code == 200 and b.json()["total"] == opt["breakdown"]["total"]
    sid = b.json()["id"]
    r = requests.post(f"{BASE}/payments/checkout", headers=H["producer"], json={"kind": "shipment", "ref_id": sid, "origin_url": ORIGIN})
    assert r.status_code == 200 and "checkout.stripe.com" in r.json()["url"]
    tx = mongo(lambda _db: _db.payment_transactions.find_one({"session_id": r.json()["session_id"]}))
    assert abs(tx["amount"] - opt["breakdown"]["total"]) < 0.01
    # book mismatching card → 404
    bad = requests.post(f"{BASE}/logistics/instant-quote/book", headers=H["producer"],
                        json={"origin_region": "Sardegna", "destination_region": "Lombardia", "pallets": 1, "card_id": opt["card_id"], "title": "TEST_bad"})
    assert bad.status_code == 404


# --- Edge cases found in code review (expected to FAIL until fixed) ---
def test_paid_after_cancel_does_not_resurrect_order(H):
    o = new_order(H["consumer"])
    r = requests.post(f"{BASE}/payments/checkout", headers=H["consumer"], json={"kind": "order", "ref_id": o["id"], "origin_url": ORIGIN})
    assert requests.post(f"{BASE}/orders/{o['id']}/cancel", headers=H["consumer"]).status_code == 200
    mark_paid("order", o["id"], H["consumer"])  # user completes the still-open Stripe session afterwards
    mine = next(x for x in requests.get(f"{BASE}/orders/mine", headers=H["consumer"]).json() if x["id"] == o["id"])
    assert mine["status"] != "paid", "Cancelled order (stock already restored) flipped to paid/held"


def test_shipment_delivered_before_payment_escrow_not_stuck(H):
    q = {"origin_region": "Sicilia", "destination_region": "Lombardia", "pallets": 1}
    opt = requests.post(f"{BASE}/logistics/instant-quote", headers=H["producer"], json=q).json()["options"][0]
    me = requests.get(f"{BASE}/auth/me", headers=H["logistics"]).json()["id"]
    if opt["carrier_id"] != me:
        pytest.skip("cheapest card not from demo carrier")
    sid = requests.post(f"{BASE}/logistics/instant-quote/book", headers=H["producer"], json={**q, "card_id": opt["card_id"], "title": "TEST_early"}).json()["id"]
    assert requests.post(f"{BASE}/logistics/requests/{sid}/tracking", headers=H["logistics"], json={"status": "delivered", "pod_recipient": "Mario"}).status_code == 200
    r = requests.post(f"{BASE}/payments/checkout", headers=H["producer"], json={"kind": "shipment", "ref_id": sid, "origin_url": ORIGIN})
    if r.status_code == 200:
        mark_paid("shipment", sid, H["producer"], opt["breakdown"]["total"])
        po = requests.get(f"{BASE}/payouts/mine", headers=H["logistics"]).json()["payouts"]
        assert any(x["source_id"] == sid for x in po), "Shipment paid after POD: escrow held forever, no carrier payout"
