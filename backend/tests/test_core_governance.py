"""Critical flows of the 'Ra mia skeleton: golden rule, refresh tokens, permission matrix, audit, declarations."""
import copy
import os

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
DEMO = "Demo1234!"
ACCOUNTS = {
    "admin": ("admin@saporidisicilia.it", "SaporiAdmin2026!"),
    "producer": ("produttore@demo.it", DEMO),
    "consumer": ("consumatore@demo.it", DEMO),
    "business": ("business@demo.it", DEMO),
    "reseller": ("rivenditore@demo.it", DEMO),
    "logistics": ("logistica@demo.it", DEMO),
}


def login(role):
    email, pw = ACCOUNTS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def sessions():
    return {k: login(k) for k in ACCOUNTS}


def H(s, role):
    return {"Authorization": f"Bearer {s[role]['access_token']}"}


def test_login_returns_refresh_and_rotation(sessions):
    pair = login("consumer")
    assert pair["access_token"] and pair["refresh_token"] and pair["user"]["email"] == ACCOUNTS["consumer"][0]
    r1 = requests.post(f"{API}/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert r1.status_code == 200
    new = r1.json()
    assert new["refresh_token"] != pair["refresh_token"]
    assert requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {new['access_token']}"}).status_code == 200
    # replay of the consumed token fails and revokes the family
    assert requests.post(f"{API}/auth/refresh", json={"refresh_token": pair["refresh_token"]}).status_code == 401
    assert requests.post(f"{API}/auth/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 401


def test_logout_revokes(sessions):
    pair = login("consumer")
    assert requests.post(f"{API}/auth/logout", json={"refresh_token": pair["refresh_token"]}).status_code == 200
    assert requests.post(f"{API}/auth/refresh", json={"refresh_token": pair["refresh_token"]}).status_code == 401


def test_rules_are_db_driven_and_order_snapshot_is_immutable(sessions):
    rules = requests.get(f"{API}/business-rules/active", headers=H(sessions, "consumer")).json()
    sale = rules["services"]["mediated_sale"]
    products = requests.get(f"{API}/products", headers=H(sessions, "consumer")).json()
    p = next(x for x in products if x.get("stock", 0) > 0)
    order = requests.post(f"{API}/orders", headers=H(sessions, "consumer"), json={
        "items": [{"product_id": p["id"], "qty": 1}], "address": "TEST via Roma 1", "city": "Palermo", "zip": "90100", "phone": "0910000000"})
    assert order.status_code == 200, order.text
    o = order.json()
    snap = o["commercial_snapshot"]
    assert snap["rules_version"] == rules["version"]
    assert snap["buyer_pct"] == sale["buyer_pct"] and snap["producer_pct"] == sale["producer_pct"]
    assert o["total"] == round(o["goods_total"] + snap["buyer_fee"], 2)

    # admin publishes new rules: the existing order must not change
    all_rules = requests.get(f"{API}/admin/business-rules", headers=H(sessions, "admin")).json()
    active = next(r for r in all_rules if r["active"])
    changed = copy.deepcopy(active["services"])
    changed["mediated_sale"]["buyer_pct"] = sale["buyer_pct"] + 1
    up = requests.put(f"{API}/admin/business-rules", headers=H(sessions, "admin"),
                      json={"services": changed, "discounts": active.get("discounts", []), "note": "TEST bump"})
    assert up.status_code == 200, up.text
    try:
        assert up.json()["version"] == active["version"] + 1
        mine = [x for x in requests.get(f"{API}/orders/mine", headers=H(sessions, "consumer")).json() if x["id"] == o["id"]][0]
        assert mine["commercial_snapshot"] == snap and mine["total"] == o["total"]
        q = requests.post(f"{API}/fees/quote", headers=H(sessions, "consumer"), json={"service": "mediated_sale", "amount": 100}).json()
        assert q["buyer_pct"] == sale["buyer_pct"] + 1
        logs = requests.get(f"{API}/admin/audit-logs?entity=business_rules", headers=H(sessions, "admin")).json()
        assert logs[0]["actor_email"] == ACCOUNTS["admin"][0] and logs[0]["before"] and logs[0]["after"]
    finally:
        requests.put(f"{API}/admin/business-rules", headers=H(sessions, "admin"),
                     json={"services": active["services"], "discounts": active.get("discounts", []), "note": "TEST restore"})


def test_rules_validation(sessions):
    bad = requests.put(f"{API}/admin/business-rules", headers=H(sessions, "admin"), json={"services": {}, "discounts": []})
    assert bad.status_code == 422
    assert requests.put(f"{API}/admin/business-rules", headers=H(sessions, "producer"), json={"services": {}}).status_code == 403


def test_permission_matrix_enforced(sessions):
    # consumer lacks rfq:create
    r = requests.post(f"{API}/rfq", headers=H(sessions, "consumer"), json={"title": "TEST rfq", "quantity": "1"})
    assert r.status_code == 403
    # reseller has it
    r = requests.post(f"{API}/rfq", headers=H(sessions, "reseller"), json={"title": "TEST rfq reseller", "quantity": "10 kg"})
    assert r.status_code == 200, r.text
    requests.patch(f"{API}/rfq/{r.json()['id']}/close", headers=H(sessions, "reseller"))
    # admin edits matrix -> immediately enforced, then restored + audited
    m = requests.get(f"{API}/admin/permissions", headers=H(sessions, "admin")).json()
    original = m["consumer"]
    requests.put(f"{API}/admin/permissions/consumer", headers=H(sessions, "admin"), json={"permissions": [p for p in original if p != "market:buy"]})
    try:
        o = requests.post(f"{API}/orders", headers=H(sessions, "consumer"), json={"items": [], "address": "Via X 1", "city": "Palermo", "zip": "90100", "phone": "0910000000"})
        assert o.status_code == 403
    finally:
        requests.put(f"{API}/admin/permissions/consumer", headers=H(sessions, "admin"), json={"permissions": original})
    assert requests.put(f"{API}/admin/permissions/admin", headers=H(sessions, "admin"), json={"permissions": []}).status_code == 422


def test_buyer_plans_removed_visibility_from_db(sessions):
    assert requests.get(f"{API}/buyer/plans", headers=H(sessions, "business")).status_code == 404
    plans = requests.get(f"{API}/visibility/plans", headers=H(sessions, "producer")).json()
    assert len(plans) >= 1 and all("price" in p for p in plans)


def test_deal_declaration_requires_first_contact(sessions):
    r = requests.post(f"{API}/deals/declarations", headers=H(sessions, "producer"),
                      json={"buyer_id": "nonexistent", "amount": 1000, "closed_on": "2026-01-01", "description": "TEST"})
    assert r.status_code == 422
    contacts = requests.get(f"{API}/deals/contacts", headers=H(sessions, "producer")).json()
    assert isinstance(contacts, list)
    assert requests.post(f"{API}/deals/declarations", headers=H(sessions, "consumer"),
                         json={"buyer_id": "x", "amount": 1, "closed_on": "2026-01-01", "description": "TEST"}).status_code == 403
