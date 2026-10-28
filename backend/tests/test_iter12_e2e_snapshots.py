# Iteration 12: E2E golden-rule snapshots (B2C order, B2B agreement, logistics booking),
# rules change does not alter old snapshots, and server-side permission matrix checks.
import os
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
PWD = "Demo1234!"
USERS = {
    "admin": ("admin@saporidisicilia.it", "SaporiAdmin2026!"),
    "producer": ("produttore@demo.it", PWD),
    "business": ("business@demo.it", PWD),
    "reseller": ("rivenditore@demo.it", PWD),
    "consumer": ("consumatore@demo.it", PWD),
    "logistics": ("logistica@demo.it", PWD),
    "collaborator": ("consulente@demo.it", PWD),
}


def _mongo():
    env = {}
    for line in open("/app/backend/.env"):
        if "=" in line:
            k, v = line.strip().split("=", 1)
            env[k] = v.strip('"')
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


@pytest.fixture(scope="module")
def db():
    return _mongo()


@pytest.fixture(scope="module")
def H():
    out = {}
    for role, (e, p) in USERS.items():
        r = requests.post(f"{API}/auth/login", json={"email": e, "password": p}, timeout=20)
        assert r.status_code == 200, f"{role} login {r.status_code} {r.text}"
        out[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


@pytest.fixture(scope="module")
def created(db):
    ids = {"orders": [], "offers": [], "negs": [], "ships": [], "rules": []}
    yield ids
    db.orders.delete_many({"_id": {"$in": ids["orders"]}})
    db.b2b_offers.delete_many({"_id": {"$in": ids["offers"]}})
    db.negotiations.delete_many({"_id": {"$in": ids["negs"]}})
    db.agreements.delete_many({"negotiation_id": {"$in": ids["negs"]}})
    db.shipping_requests.delete_many({"_id": {"$in": ids["ships"]}})


# ---------- B2C purchase ----------
class TestB2CPurchase:
    def test_order_snapshot_and_total(self, H, created, db):
        prods = requests.get(f"{API}/products", headers=H["consumer"], timeout=20).json()
        prods = prods if isinstance(prods, list) else prods.get("items", [])
        prod = next(p for p in prods if (p.get("stock") or 0) >= 1)
        r = requests.post(f"{API}/orders", headers=H["consumer"], timeout=20, json={
            "items": [{"product_id": prod["id"], "qty": 1}], "address": "Via TEST 1", "city": "Palermo",
            "zip": "90100", "phone": "3330000000", "notes": "TEST_iter12"})
        assert r.status_code == 200, r.text
        o = r.json()
        created["orders"].append(o["id"])
        # restore stock
        db.products.update_one({"_id": prod["id"]}, {"$inc": {"stock": 1}})
        snap = o["commercial_snapshot"]
        assert snap["service"] == "mediated_sale"
        assert o["goods_total"] == round(prod["price"], 2)
        assert o["buyer_fee"] == snap["buyer_fee"]
        assert o["total"] == round(o["goods_total"] + o["buyer_fee"], 2)
        rules = requests.get(f"{API}/business-rules/active", headers=H["consumer"], timeout=20).json()
        assert snap["rules_version"] == rules["version"]
        mine = requests.get(f"{API}/orders/mine", headers=H["consumer"], timeout=20).json()
        assert any(x["id"] == o["id"] for x in mine)
        TestB2CPurchase.order = o


# ---------- B2B negotiation -> agreement ----------
class TestB2BAgreement:
    def test_negotiation_agreement_snapshot(self, H, created, db):
        r = requests.post(f"{API}/b2b/offers", headers=H["producer"], timeout=20, json={
            "title": "TEST_iter12 offerta", "description": "Offerta di test per iterazione 12",
            "category": "olio", "moq": 10, "unit": "kg", "unit_price": 8.5})
        assert r.status_code == 200, r.text
        offer = r.json()
        created["offers"].append(offer["id"])
        r = requests.post(f"{API}/b2b/offers/{offer['id']}/negotiations", headers=H["business"], timeout=20,
                          json={"message": "TEST ciao"})
        assert r.status_code == 200, r.text
        neg = r.json()
        created["negs"].append(neg["id"])
        r = requests.post(f"{API}/b2b/negotiations/{neg['id']}/agreements", headers=H["business"], timeout=20,
                          json={"price": 8.0, "qty": 100, "terms": "TEST terms"})
        assert r.status_code == 200, r.text
        # proposer cannot accept own proposal
        r = requests.patch(f"{API}/b2b/negotiations/{neg['id']}/agreement", headers=H["business"], timeout=20,
                           json={"action": "accept"})
        assert r.status_code == 403
        r = requests.patch(f"{API}/b2b/negotiations/{neg['id']}/agreement", headers=H["producer"], timeout=20,
                           json={"action": "accept"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "agreed"
        ag = db.agreements.find_one({"negotiation_id": neg["id"]})
        assert ag and ag["commercial_snapshot"]["service"] == "mediated_sale"
        assert ag["commercial_snapshot"]["base_amount"] == 800.0


# ---------- Logistics booking ----------
class TestLogisticsBooking:
    def test_quote_select_transport_fee(self, H, created):
        r = requests.post(f"{API}/logistics/requests", headers=H["producer"], timeout=20, json={
            "title": "TEST_iter12 spedizione", "cargo_type": "secco", "origin": "Catania", "destination": "Milano",
            "pallets": 2})
        assert r.status_code == 200, r.text
        ship = r.json()
        created["ships"].append(ship["id"])
        r = requests.post(f"{API}/logistics/requests/{ship['id']}/quotes", headers=H["logistics"], timeout=20,
                          json={"price": 500, "transit_days": 3, "message": "TEST"})
        assert r.status_code == 200, r.text
        q = r.json()["quotes"][-1]
        r = requests.post(f"{API}/logistics/requests/{ship['id']}/select-quote", headers=H["producer"], timeout=20,
                          json={"quote_id": q["id"]})
        assert r.status_code == 200, r.text
        d = requests.get(f"{API}/logistics/requests/{ship['id']}", headers=H["producer"], timeout=20).json()
        snap = d["commercial_snapshot"]
        assert snap["service"] == "transport"
        assert snap["producer_fee"] > 0
        assert snap["base_amount"] == 500.0
        # second select rejected
        r = requests.post(f"{API}/logistics/requests/{ship['id']}/select-quote", headers=H["producer"], timeout=20,
                          json={"quote_id": q["id"]})
        assert r.status_code == 422


# ---------- Rules change must not alter old snapshot ----------
class TestRulesImmutability:
    def test_change_rules_old_order_unchanged(self, H, created):
        o = getattr(TestB2CPurchase, "order", None)
        if not o:
            pytest.skip("no order")
        active = requests.get(f"{API}/business-rules/active", headers=H["admin"], timeout=20).json()
        original = {"services": active["services"], "discounts": active.get("discounts", [])}
        new_services = {k: dict(v) for k, v in active["services"].items()}
        new_services["mediated_sale"]["buyer_pct"] = float(new_services["mediated_sale"]["buyer_pct"]) + 5
        try:
            r = requests.put(f"{API}/admin/business-rules", headers=H["admin"], timeout=20, json={
                "services": new_services, "discounts": original["discounts"], "note": "TEST_iter12 change"})
            assert r.status_code == 200, r.text
            assert r.json()["version"] == active["version"] + 1
            mine = requests.get(f"{API}/orders/mine", headers=H["consumer"], timeout=20).json()
            again = next(x for x in mine if x["id"] == o["id"])
            assert again["total"] == o["total"]
            assert again["commercial_snapshot"]["buyer_pct"] == o["commercial_snapshot"]["buyer_pct"]
            assert again["commercial_snapshot"]["rules_version"] == o["commercial_snapshot"]["rules_version"]
        finally:
            r = requests.put(f"{API}/admin/business-rules", headers=H["admin"], timeout=20, json={
                **original, "note": "TEST_iter12 restore"})
            assert r.status_code == 200, r.text
            now = requests.get(f"{API}/business-rules/active", headers=H["admin"], timeout=20).json()
            assert now["services"]["mediated_sale"]["buyer_pct"] == active["services"]["mediated_sale"]["buyer_pct"]


# ---------- Permission matrix ----------
RFQ = {"title": "TEST rfq", "quantity": "100 kg"}
LOT = {"product_name": "TEST", "lot_code": f"TEST-{uuid.uuid4().hex[:6]}", "quantity": 1}
ORDER = {"items": [{"product_id": "x", "qty": 1}], "address": "a", "city": "b", "zip": "c", "phone": "d"}


@pytest.mark.parametrize("role,method,path,body", [
    ("consumer", "post", "/rfq", RFQ),
    ("logistics", "post", "/lots", LOT),
    ("producer", "put", "/admin/business-rules", {"services": {}, "discounts": []}),
    ("collaborator", "post", "/orders", ORDER),
    ("logistics", "post", "/orders", ORDER),
    ("consumer", "post", "/b2b/offers/xyz/negotiations", {}),
    ("consumer", "post", "/logistics/requests", {"title": "TEST x", "cargo_type": "a", "origin": "a", "destination": "b"}),
    ("business", "get", "/admin/audit-logs", None),
    ("reseller", "put", "/admin/permissions/consumer", {"permissions": ["*"]}),
    ("collaborator", "post", "/b2b/offers", {"title": "TEST", "description": "descrizione test", "category": "a",
                                              "moq": 1, "unit": "kg", "unit_price": 1}),
])
def test_forbidden(H, role, method, path, body):
    r = getattr(requests, method)(f"{API}{path}", headers=H[role], json=body, timeout=20)
    assert r.status_code == 403, f"{role} {method} {path} -> {r.status_code} {r.text[:200]}"


# ---------- Input robustness ----------
def test_product_search_special_chars(H):
    r = requests.get(f"{API}/products", headers=H["consumer"], params={"q": "(olio"}, timeout=20)
    assert r.status_code == 200, r.text[:200]


def test_order_rejects_blank_address(H):
    r = requests.post(f"{API}/orders", headers=H["consumer"], timeout=20, json={
        "items": [{"product_id": "does-not-matter", "qty": 1}], "address": "", "city": "", "zip": "", "phone": ""})
    assert r.status_code == 422, f"blank shipping fields accepted: {r.status_code}"
