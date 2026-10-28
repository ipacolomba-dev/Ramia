# Platform router tests: lots, orders received, earnings, RFQ, plans, analytics, logistics, compliance docs, admin, categories, registration
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def H(tokens, role):
    return {"Authorization": f"Bearer {tokens[role]['token']}"}


# ---------- Lots ----------
class TestLots:
    def test_lot_crud_and_duplicate(self, tokens):
        code = f"TEST_LOT_{uuid.uuid4().hex[:6]}"
        body = {"product_name": "TEST_Olio", "lot_code": code, "quantity": 10, "unit": "kg"}
        r = requests.post(f"{API}/lots", json=body, headers=H(tokens, "producer"))
        assert r.status_code == 200, r.text
        lot = r.json()
        assert lot["lot_code"] == code and "_id" not in lot
        dup = requests.post(f"{API}/lots", json=body, headers=H(tokens, "producer"))
        assert dup.status_code == 409
        lst = requests.get(f"{API}/lots", headers=H(tokens, "producer")).json()
        assert any(l["id"] == lot["id"] for l in lst)
        up = requests.patch(f"{API}/lots/{lot['id']}", json={**body, "quantity": 25}, headers=H(tokens, "producer"))
        assert up.status_code == 200 and up.json()["quantity"] == 25
        # other producer cannot touch
        assert requests.delete(f"{API}/lots/{lot['id']}", headers=H(tokens, "producer2")).status_code == 404
        assert requests.delete(f"{API}/lots/{lot['id']}", headers=H(tokens, "producer")).status_code == 200
        lst = requests.get(f"{API}/lots", headers=H(tokens, "producer")).json()
        assert not any(l["id"] == lot["id"] for l in lst)

    def test_lots_forbidden_for_business(self, tokens):
        assert requests.get(f"{API}/lots", headers=H(tokens, "business")).status_code == 403


# ---------- Producer orders/earnings ----------
class TestProducerMoney:
    def test_orders_received(self, tokens):
        r = requests.get(f"{API}/orders/received", headers=H(tokens, "producer"))
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_earnings(self, tokens):
        r = requests.get(f"{API}/producer/earnings", headers=H(tokens, "producer"))
        assert r.status_code == 200
        d = r.json()
        rules = requests.get(f"{API}/business-rules/active", headers=H(tokens, "producer")).json()
        assert abs(d["net"] - (d["gross"] - d["commission"])) < 0.02 and d["rate"] == rules["services"]["mediated_sale"]["producer_pct"] / 100


# ---------- RFQ ----------
class TestRfq:
    def test_rfq_flow(self, tokens):
        r = requests.post(f"{API}/rfq", json={"title": "TEST_RFQ olio", "quantity": "500 L"}, headers=H(tokens, "business"))
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        try:
            # producer sees it open
            lst = requests.get(f"{API}/rfq", headers=H(tokens, "producer")).json()
            assert any(x["id"] == rid for x in lst)
            # producers respond
            r1 = requests.post(f"{API}/rfq/{rid}/responses", json={"message": "TEST_p1", "price": "8€/L"}, headers=H(tokens, "producer"))
            assert r1.status_code == 200 and len(r1.json()["responses"]) == 1
            r2 = requests.post(f"{API}/rfq/{rid}/responses", json={"message": "TEST_p2"}, headers=H(tokens, "producer2"))
            assert r2.status_code == 200 and len(r2.json()["responses"]) == 1  # only own
            # buyer sees all
            b = requests.get(f"{API}/rfq/{rid}", headers=H(tokens, "business")).json()
            assert len(b["responses"]) == 2
            # consumer forbidden
            assert requests.get(f"{API}/rfq", headers=H(tokens, "consumer")).status_code == 403
            # non-owner cannot close
            assert requests.patch(f"{API}/rfq/{rid}/close", headers=H(tokens, "producer")).status_code == 403
        finally:
            c = requests.patch(f"{API}/rfq/{rid}/close", headers=H(tokens, "business"))
            assert c.status_code == 200
        # closed: producer cannot respond, not listed
        assert requests.post(f"{API}/rfq/{rid}/responses", json={"message": "x"}, headers=H(tokens, "producer")).status_code == 422
        lst = requests.get(f"{API}/rfq", headers=H(tokens, "producer")).json()
        assert not any(x["id"] == rid for x in lst)

    def test_rfq_validation(self, tokens):
        r = requests.post(f"{API}/rfq", json={"title": "ab", "quantity": ""}, headers=H(tokens, "business"))
        assert r.status_code == 422


# ---------- Buyer plans / analytics ----------
class TestBuyer:
    def test_plans_removed(self, tokens):
        # 'Ra mia: free access, no subscriptions
        assert requests.get(f"{API}/buyer/plans", headers=H(tokens, "business")).status_code == 404

    def test_analytics(self, tokens):
        r = requests.get(f"{API}/buyer/analytics", headers=H(tokens, "business"))
        assert r.status_code == 200
        for k in ("orders_count", "orders_spend", "b2b_agreements", "top_producers", "open_requests"):
            assert k in r.json()


# ---------- Logistics ----------
class TestLogistics:
    def test_quotes_and_tracking(self, tokens):
        q = requests.get(f"{API}/logistics/quotes/mine", headers=H(tokens, "logistics"))
        assert q.status_code == 200
        # producer creates a shipment, logistics quotes on it
        sr = requests.post(f"{API}/logistics/requests", headers=H(tokens, "producer"), json={
            "title": "TEST_Shipment", "cargo_type": "TEST", "origin": "Catania", "destination": "Milano"})
        assert sr.status_code == 200, sr.text
        rid = sr.json()["id"]
        qr = requests.post(f"{API}/logistics/requests/{rid}/quotes", headers=H(tokens, "logistics"), json={"price": 100, "transit_days": 2})
        assert qr.status_code == 200, qr.text
        quote_id = qr.json()["quotes"][-1]["id"]
        # tracking blocked until the customer picks the carrier
        e = requests.post(f"{API}/logistics/requests/{rid}/tracking", json={"status": "in_transit"}, headers=H(tokens, "logistics"))
        assert e.status_code == 403
        # only the creator can select
        assert requests.post(f"{API}/logistics/requests/{rid}/select-quote", json={"quote_id": quote_id}, headers=H(tokens, "producer2")).status_code == 404
        sel = requests.post(f"{API}/logistics/requests/{rid}/select-quote", json={"quote_id": quote_id}, headers=H(tokens, "producer"))
        assert sel.status_code == 200, sel.text
        assert requests.post(f"{API}/logistics/requests/{rid}/select-quote", json={"quote_id": quote_id}, headers=H(tokens, "producer")).status_code == 422
        e = requests.post(f"{API}/logistics/requests/{rid}/tracking", json={"status": "in_transit", "location": "TEST_Catania"}, headers=H(tokens, "logistics"))
        assert e.status_code == 200 and e.json()["status"] == "in_transit"
        after = [x for x in requests.get(f"{API}/logistics/tracking", headers=H(tokens, "logistics")).json() if x["id"] == rid][0]
        assert after["status"] == "in_transit" and after["is_carrier"] and any(ev.get("location") == "TEST_Catania" for ev in after["events"])
        mine = [x for x in requests.get(f"{API}/logistics/quotes/mine", headers=H(tokens, "logistics")).json() if x["request_id"] == rid]
        assert mine and mine[0]["selected"] is True
        bad = requests.post(f"{API}/logistics/requests/{rid}/tracking", json={"status": "flying"}, headers=H(tokens, "logistics"))
        assert bad.status_code == 422
        assert requests.get(f"{API}/logistics/quotes/mine", headers=H(tokens, "producer")).status_code == 403


# ---------- Compliance documents ----------
class TestCompliance:
    def test_document_lifecycle(self, tokens):
        pdf = b"%PDF-1.4 TEST document"
        r = requests.post(f"{API}/compliance/documents", headers=H(tokens, "producer"),
                          files={"file": ("test.pdf", pdf, "application/pdf")},
                          data={"title": "TEST_Cert", "doc_type": "certificate", "expiry_date": "2027-01-01"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "path" not in d and d["doc_type"] == "certificate"
        did = d["id"]
        assert any(x["id"] == did for x in requests.get(f"{API}/compliance/documents", headers=H(tokens, "producer")).json())
        f = requests.get(f"{API}/compliance/documents/{did}/file?token={tokens['producer']['token']}")
        assert f.status_code == 200 and f.content == pdf
        assert requests.get(f"{API}/compliance/documents/{did}/file", headers=H(tokens, "admin")).status_code == 200
        assert requests.get(f"{API}/compliance/documents/{did}/file?token={tokens['producer2']['token']}").status_code == 404
        assert requests.get(f"{API}/compliance/documents/{did}/file").status_code in (401, 403)
        assert requests.delete(f"{API}/compliance/documents/{did}", headers=H(tokens, "producer2")).status_code == 404
        assert requests.delete(f"{API}/compliance/documents/{did}", headers=H(tokens, "producer")).status_code == 200
        assert requests.get(f"{API}/compliance/documents/{did}/file?token={tokens['producer']['token']}").status_code == 404

    def test_bad_ext_and_role(self, tokens):
        r = requests.post(f"{API}/compliance/documents", headers=H(tokens, "collaborator"),
                          files={"file": ("x.exe", b"MZ", "application/octet-stream")}, data={"title": "TEST_bad"})
        assert r.status_code == 422
        r = requests.post(f"{API}/compliance/documents", headers=H(tokens, "business"),
                          files={"file": ("x.pdf", b"%PDF", "application/pdf")}, data={"title": "TEST_bad"})
        assert r.status_code == 403


# ---------- Admin ----------
class TestAdmin:
    def test_users_filter(self, tokens):
        r = requests.get(f"{API}/admin/users?role=producer", headers=H(tokens, "admin"))
        assert r.status_code == 200 and r.json() and all(u["role"] == "producer" for u in r.json())
        r = requests.get(f"{API}/admin/users?q=consumatore", headers=H(tokens, "admin"))
        assert any(u["email"] == "consumatore@demo.it" for u in r.json())
        assert all("password_hash" not in u for u in r.json())
        assert requests.get(f"{API}/admin/users", headers=H(tokens, "producer")).status_code == 403

    def test_suspend_cycle(self, tokens):
        uid = tokens["consumer"]["user"]["id"]
        old_token = tokens["consumer"]["token"]
        try:
            assert requests.patch(f"{API}/admin/users/{uid}/suspend", json={"suspended": True}, headers=H(tokens, "admin")).status_code == 200
            lg = requests.post(f"{API}/auth/login", json={"email": "consumatore@demo.it", "password": "Demo1234!"})
            assert lg.status_code == 403
            assert requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 403
        finally:
            assert requests.patch(f"{API}/admin/users/{uid}/suspend", json={"suspended": False}, headers=H(tokens, "admin")).status_code == 200
        assert requests.post(f"{API}/auth/login", json={"email": "consumatore@demo.it", "password": "Demo1234!"}).status_code == 200
        self_id = tokens["admin"]["user"]["id"]
        assert requests.patch(f"{API}/admin/users/{self_id}/suspend", json={"suspended": True}, headers=H(tokens, "admin")).status_code == 422

    def test_moderation_list(self, tokens):
        r = requests.get(f"{API}/admin/moderation/offers", headers=H(tokens, "admin"))
        assert r.status_code == 200 and isinstance(r.json(), list)
        assert requests.patch(f"{API}/admin/moderation/offers/nonexistent/close", headers=H(tokens, "admin")).status_code == 404


# ---------- Categories ----------
class TestCategories:
    def test_categories_crud(self, tokens):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200 and len(r.json()) >= 1
        used = [c for c in r.json() if c["products"] > 0]
        slug = f"test_{uuid.uuid4().hex[:6]}"
        assert requests.post(f"{API}/categories", json={"slug": slug, "name": "TEST_Cat"}, headers=H(tokens, "admin")).status_code == 200
        assert requests.post(f"{API}/categories", json={"slug": slug, "name": "TEST_Cat"}, headers=H(tokens, "admin")).status_code == 409
        assert requests.post(f"{API}/categories", json={"slug": "Bad Slug", "name": "x"}, headers=H(tokens, "admin")).status_code == 422
        assert requests.post(f"{API}/categories", json={"slug": "test_zz", "name": "x"}, headers=H(tokens, "producer")).status_code == 403
        assert any(c["slug"] == slug for c in requests.get(f"{API}/categories").json())
        if used:
            assert requests.delete(f"{API}/categories/{used[0]['slug']}", headers=H(tokens, "admin")).status_code == 422
        assert requests.delete(f"{API}/categories/{slug}", headers=H(tokens, "admin")).status_code == 200
        assert not any(c["slug"] == slug for c in requests.get(f"{API}/categories").json())


# ---------- Registration business ----------
class TestRegisterBusiness:
    def test_register_business_profile(self, tokens):
        email = f"test_buyer_{uuid.uuid4().hex[:6]}@example.com"
        body = {"email": email, "password": "Test1234!", "name": "TEST Buyer", "role": "business",
                "company_name": "TEST_Buyer Srl",
                "profile": {"company": {"legal_name": "TEST_Buyer Srl", "vat_id": "12345678901", "country_incorp": "Italia"},
                            "legal_address": {"city": "Milano", "country": "Italia"},
                            "contact": {"first_name": "Mario", "last_name": "Rossi", "email": email},
                            "buyer": {"buyer_type": "distributor", "product_categories": ["olio"]}},
                "consents": {"terms": True, "privacy": True}}
        r = requests.post(f"{API}/auth/register", json=body)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["role"] == "business" and u.get("approved") is False
        tok = r.json()["access_token"]
        # pending business cannot create RFQ
        rr = requests.post(f"{API}/rfq", json={"title": "TEST_pending", "quantity": "1"}, headers={"Authorization": f"Bearer {tok}"})
        assert rr.status_code == 403
