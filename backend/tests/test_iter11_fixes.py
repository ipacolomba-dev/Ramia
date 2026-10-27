# Iteration 11 retest: carrier selection, tracking guard, admin search escape, RFQ approval + free-plan limit
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")
from security import hash_password  # noqa: E402

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PWD = "Demo1234!"


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def login(email, pwd=PWD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _mk_user(role, approved):
    uid = str(uuid.uuid4())
    email = f"test_{role}_{uid[:8]}@example.com"
    db.users.insert_one({"_id": uid, "email": email, "password_hash": hash_password(PWD), "name": f"TEST_{role}",
                         "role": role, "locale": "it", "company_name": f"TEST_{role} srl", "approved": approved,
                         "email_verified": True, "created_at": datetime.now(timezone.utc)})
    return uid, email


@pytest.fixture(scope="module")
def ctx():
    c = {
        "producer": login("produttore@demo.it"),
        "business": login("business@demo.it"),
        "logistics": login("logistica@demo.it"),
        "admin": login("admin@saporidisicilia.it", "SaporiAdmin2026!"),
    }
    lid, lemail = _mk_user("logistics", True)
    pid, pemail = _mk_user("producer", False)
    c["logistics2"] = login(lemail)
    c["unapproved_producer"] = login(pemail)
    yield c
    db.users.delete_many({"_id": {"$in": [lid, pid]}})
    db.shipping_requests.delete_many({"title": {"$regex": "^TEST_"}})
    db.rfqs.delete_many({"title": {"$regex": "^TEST_"}})
    db.users.update_one({"email": "business@demo.it"}, {"$set": {"buyer_plan": "free", "buyer_plan_until": None}})


@pytest.fixture(scope="module")
def shipment(ctx):
    r = requests.post(f"{API}/logistics/requests", headers=H(ctx["producer"]), json={
        "title": "TEST_ship iter11", "cargo_type": "dry", "origin": "Catania", "destination": "Milano"})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    q1 = requests.post(f"{API}/logistics/requests/{sid}/quotes", headers=H(ctx["logistics"]),
                       json={"price": 300, "transit_days": 3})
    q2 = requests.post(f"{API}/logistics/requests/{sid}/quotes", headers=H(ctx["logistics2"]),
                       json={"price": 280, "transit_days": 4})
    assert q1.status_code == 200 and q2.status_code == 200
    quotes = q2.json()["quotes"]
    return {"id": sid, "q_demo": quotes[0]["id"], "q_test": quotes[1]["id"]}


# Carrier selection + tracking guard
class TestCarrierSelection:
    def test_tracking_blocked_before_selection(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/tracking", headers=H(ctx["logistics"]),
                          json={"status": "in_transit"})
        assert r.status_code == 403

    def test_is_carrier_false_before(self, ctx, shipment):
        r = requests.get(f"{API}/logistics/tracking", headers=H(ctx["logistics"]))
        row = next(x for x in r.json() if x["id"] == shipment["id"])
        assert row["is_carrier"] is False

    def test_non_creator_cannot_select(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/select-quote", headers=H(ctx["business"]),
                          json={"quote_id": shipment["q_demo"]})
        assert r.status_code in (403, 404)
        r2 = requests.post(f"{API}/logistics/requests/{shipment['id']}/select-quote", headers=H(ctx["logistics"]),
                           json={"quote_id": shipment["q_demo"]})
        assert r2.status_code in (403, 404)

    def test_bad_quote_id_404(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/select-quote", headers=H(ctx["producer"]),
                          json={"quote_id": "nope"})
        assert r.status_code == 404

    def test_creator_selects(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/select-quote", headers=H(ctx["producer"]),
                          json={"quote_id": shipment["q_demo"]})
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/logistics/requests/{shipment['id']}", headers=H(ctx["producer"])).json()
        assert g["selected_quote_id"] == shipment["q_demo"] and g["status"] == "assigned"

    def test_second_selection_422(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/select-quote", headers=H(ctx["producer"]),
                          json={"quote_id": shipment["q_test"]})
        assert r.status_code == 422

    def test_non_selected_carrier_403(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/tracking", headers=H(ctx["logistics2"]),
                          json={"status": "in_transit"})
        assert r.status_code == 403
        row = next(x for x in requests.get(f"{API}/logistics/tracking", headers=H(ctx["logistics2"])).json()
                   if x["id"] == shipment["id"])
        assert row["is_carrier"] is False

    def test_selected_carrier_tracks(self, ctx, shipment):
        r = requests.post(f"{API}/logistics/requests/{shipment['id']}/tracking", headers=H(ctx["logistics"]),
                          json={"status": "picked_up", "location": "Catania"})
        assert r.status_code == 200, r.text
        row = next(x for x in requests.get(f"{API}/logistics/tracking", headers=H(ctx["logistics"])).json()
                   if x["id"] == shipment["id"])
        assert row["is_carrier"] is True and row["status"] == "picked_up"
        assert [e["status"] for e in row["events"]] == ["assigned", "picked_up"]


# Admin search escape
class TestAdminSearch:
    @pytest.mark.parametrize("q", ["(", "[", "*", ".*", "demo.it"])
    def test_regex_chars_safe(self, ctx, q):
        r = requests.get(f"{API}/admin/users", headers=H(ctx["admin"]), params={"q": q})
        assert r.status_code == 200
        if q == ".*":
            assert r.json() == [] or all(".*" in str(u) for u in r.json())


# RFQ: approved producers only, free plan limit
class TestRfq:
    def test_unapproved_producer_cannot_reply(self, ctx):
        r = requests.post(f"{API}/rfq", headers=H(ctx["business"]),
                          json={"title": "TEST_rfq approve", "quantity": "10"})
        if r.status_code == 422:
            pytest.skip("business already at free limit")
        rid = r.json()["id"]
        x = requests.post(f"{API}/rfq/{rid}/responses", headers=H(ctx["unapproved_producer"]), json={"message": "hi"})
        assert x.status_code == 403
        ok = requests.post(f"{API}/rfq/{rid}/responses", headers=H(ctx["producer"]), json={"message": "TEST reply"})
        assert ok.status_code == 200 and len(ok.json()["responses"]) == 1
        requests.patch(f"{API}/rfq/{rid}/close", headers=H(ctx["business"]))

    def test_free_plan_limit(self, ctx):
        requests.post(f"{API}/buyer/plans/subscribe", headers=H(ctx["business"]), json={"plan_id": "free"})
        existing = [x for x in requests.get(f"{API}/rfq", headers=H(ctx["business"])).json() if x["status"] == "open"]
        created = []
        for i in range(3 - len(existing)):
            r = requests.post(f"{API}/rfq", headers=H(ctx["business"]), json={"title": f"TEST_rfq lim {i}", "quantity": "1"})
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
        r = requests.post(f"{API}/rfq", headers=H(ctx["business"]), json={"title": "TEST_rfq lim 4", "quantity": "1"})
        assert r.status_code == 422
        # Pro lifts the limit
        requests.post(f"{API}/buyer/plans/subscribe", headers=H(ctx["business"]), json={"plan_id": "pro"})
        r2 = requests.post(f"{API}/rfq", headers=H(ctx["business"]), json={"title": "TEST_rfq pro", "quantity": "1"})
        assert r2.status_code == 200
        requests.post(f"{API}/buyer/plans/subscribe", headers=H(ctx["business"]), json={"plan_id": "free"})
