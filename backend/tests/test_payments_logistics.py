"""Escrow payments, split payouts, Match Registry and logistics rate-card engine."""
import asyncio
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8001") + "/api"
ORIGIN = "https://example.test"
LOOP = asyncio.new_event_loop()


def login(email, pwd="Demo1234!"):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def mongo(coro_fn):
    async def run():
        c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        try:
            return await coro_fn(c[os.environ.get("DB_NAME", "test_database")])
        finally:
            c.close()
    return LOOP.run_until_complete(run())


@pytest.fixture(scope="module")
def hdr():
    return {"consumer": login("consumatore@demo.it"), "producer": login("produttore@demo.it"),
            "business": login("business@demo.it"), "logistics": login("logistica@demo.it"),
            "admin": login("admin@saporidisicilia.it", "SaporiAdmin2026!")}


def _order(h):
    prods = requests.get(f"{BASE}/products", headers=h).json()
    p = next(x for x in prods if x.get("stock", 0) > 2)
    r = requests.post(f"{BASE}/orders", headers=h, json={"items": [{"product_id": p["id"], "qty": 1}],
                      "address": "Via Roma 1", "city": "Palermo", "zip": "90100", "phone": "3330000000"})
    assert r.status_code in (200, 201), r.text
    return r.json(), p


def _mark_paid(kind, ref_id, user_h):
    """Simulates the Stripe confirmation by fulfilling a fake paid transaction through the real code path."""
    import sys
    sys.path.insert(0, "/app/backend")

    async def go(_db):
        from routers import payments
        me = requests.get(f"{BASE}/auth/me", headers=user_h).json()
        tx = {"_id": str(uuid.uuid4()), "session_id": f"cs_test_{uuid.uuid4().hex}", "kind": kind, "ref_id": ref_id,
              "user_id": me["id"], "amount": 0, "processed": False, "payment_status": "paid"}
        if kind == "order":
            tx["amount"] = (await _db.orders.find_one({"_id": ref_id}))["total"]
        await _db.payment_transactions.insert_one(tx)
        await payments._fulfill(tx)
    mongo(go)


def test_order_starts_unpaid_and_checkout_returns_stripe_url(hdr):
    order, _ = _order(hdr["consumer"])
    assert order["status"] == "awaiting_payment"
    r = requests.post(f"{BASE}/payments/checkout", headers=hdr["consumer"], json={"kind": "order", "ref_id": order["id"], "origin_url": ORIGIN})
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://") and r.json()["session_id"]
    st = requests.get(f"{BASE}/payments/status/{r.json()['session_id']}", headers=hdr["consumer"])
    assert st.status_code == 200 and st.json()["payment_status"] != "paid"
    # another user cannot read the session
    assert requests.get(f"{BASE}/payments/status/{r.json()['session_id']}", headers=hdr["business"]).status_code == 404


def test_cancel_unpaid_restores_stock(hdr):
    order, p = _order(hdr["consumer"])
    before = next(x for x in requests.get(f"{BASE}/products", headers=hdr["consumer"]).json() if x["id"] == p["id"])["stock"]
    assert requests.post(f"{BASE}/orders/{order['id']}/cancel", headers=hdr["consumer"]).status_code == 200
    after = next(x for x in requests.get(f"{BASE}/products", headers=hdr["consumer"]).json() if x["id"] == p["id"])["stock"]
    assert after == before + 1


def test_escrow_release_creates_split_payout_and_match(hdr):
    order, p = _order(hdr["consumer"])
    _mark_paid("order", order["id"], hdr["consumer"])
    mine = next(o for o in requests.get(f"{BASE}/orders/mine", headers=hdr["consumer"]).json() if o["id"] == order["id"])
    assert mine["status"] == "paid" and mine["escrow"]["status"] == "held"
    # producer sees held amount, then buyer confirms delivery
    assert requests.post(f"{BASE}/orders/{order['id']}/confirm-delivery", headers=hdr["consumer"]).status_code == 200
    assert requests.post(f"{BASE}/orders/{order['id']}/confirm-delivery", headers=hdr["consumer"]).status_code == 422
    payouts = requests.get(f"{BASE}/payouts/mine", headers=hdr["producer"]).json()
    po = [x for x in payouts["payouts"] if x["source_id"] == order["id"]]
    if p.get("producer_id") == requests.get(f"{BASE}/auth/me", headers=hdr["producer"]).json()["id"]:
        assert len(po) == 1 and po[0]["status"] == "pending_connect"
        snap = mine["commercial_snapshot"]
        assert abs(po[0]["fee"] - snap["producer_fee"]) < 0.02
    matches = requests.get(f"{BASE}/matches", headers=hdr["admin"]).json()
    assert any(m["buyer_id"] == mine["user_id"] for m in matches)


def test_dispute_and_admin_refund(hdr):
    order, _ = _order(hdr["consumer"])
    _mark_paid("order", order["id"], hdr["consumer"])
    assert requests.post(f"{BASE}/orders/{order['id']}/dispute", headers=hdr["consumer"], json={"reason": "Merce danneggiata"}).status_code == 200
    assert requests.post(f"{BASE}/orders/{order['id']}/confirm-delivery", headers=hdr["consumer"]).status_code == 422
    esc = requests.get(f"{BASE}/admin/escrow", headers=hdr["admin"]).json()
    assert any(i["id"] == order["id"] and i["status"] == "disputed" for i in esc["items"])
    r = requests.post(f"{BASE}/admin/escrow/order/{order['id']}/resolve", headers=hdr["admin"], json={"action": "refund", "note": "Rimborso concordato"})
    assert r.status_code == 200 and r.json()["escrow"]["status"] in ("refunded", "refund_manual")  # test key cannot refund
    assert requests.get(f"{BASE}/admin/escrow", headers=hdr["consumer"]).status_code == 403


def test_match_registry_chain_valid(hdr):
    v = requests.get(f"{BASE}/admin/matches/verify", headers=hdr["admin"]).json()
    assert v["valid"] is True and v["entries"] >= 1


def test_rate_cards_instant_quote_book_pod_release(hdr):
    cards = requests.get(f"{BASE}/logistics/rate-cards/mine", headers=hdr["logistics"]).json()
    assert len(cards) >= 1
    q = {"origin_region": "Sicilia", "destination_region": "Lombardia", "pallets": 2, "weight_kg": 500, "cold_chain": False}
    res = requests.post(f"{BASE}/logistics/instant-quote", headers=hdr["producer"], json=q).json()
    assert res["count"] >= 1 and res["range"]["min"] <= res["range"]["max"]
    opt = res["options"][0]
    assert opt["breakdown"]["total"] == round(opt["breakdown"]["carrier_price"] + opt["breakdown"]["platform_fee"], 2)
    b = requests.post(f"{BASE}/logistics/instant-quote/book", headers=hdr["producer"], json={**q, "card_id": opt["card_id"], "title": "Test pallet arance"})
    assert b.status_code == 200, b.text
    sid = b.json()["id"]
    if opt["carrier_id"] != requests.get(f"{BASE}/auth/me", headers=hdr["logistics"]).json()["id"]:
        return
    _mark_paid("shipment", sid, hdr["producer"])
    r = requests.post(f"{BASE}/logistics/requests/{sid}/tracking", headers=hdr["logistics"], json={"status": "delivered"})
    assert r.status_code == 422  # POD required
    r = requests.post(f"{BASE}/logistics/requests/{sid}/tracking", headers=hdr["logistics"], json={"status": "delivered", "pod_recipient": "Mario Rossi"})
    assert r.status_code == 200, r.text
    po = requests.get(f"{BASE}/payouts/mine", headers=hdr["logistics"]).json()["payouts"]
    assert any(x["source_id"] == sid and x["net"] == opt["breakdown"]["carrier_price"] for x in po)


def test_rate_card_permissions(hdr):
    body = {"name": "X", "origin_region": "Sicilia", "destination_region": "*", "transit_days": 2}
    assert requests.post(f"{BASE}/logistics/rate-cards", headers=hdr["producer"], json=body).status_code == 403
