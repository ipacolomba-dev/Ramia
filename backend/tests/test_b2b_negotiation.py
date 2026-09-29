"""Backend regression test for B2B offer detail + negotiation flow.

Covers the bug fix: added GET /api/b2b/offers/{offer_id} endpoint and the full
end-to-end negotiation workflow.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

BUSINESS = {"email": "business@demo.it", "password": "Demo1234!"}
PRODUCER = {"email": "produttore@demo.it", "password": "Demo1234!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def business_hdr():
    return _login(BUSINESS)


@pytest.fixture(scope="module")
def producer_hdr():
    return _login(PRODUCER)


@pytest.fixture(scope="module")
def offer_id(business_hdr, producer_hdr):
    # Prefer an open offer from produttore@demo.it so negotiation flow works
    r = requests.get(f"{API}/b2b/offers", headers=business_hdr, timeout=20)
    assert r.status_code == 200, r.text
    offers = r.json()
    assert isinstance(offers, list) and len(offers) > 0, "no open B2B offers seeded"
    # get producer id
    me = requests.get(f"{API}/auth/me", headers=producer_hdr, timeout=20).json()
    prod_id = me.get("id")
    for o in offers:
        if o.get("producer_id") == prod_id and o.get("status") == "open":
            return o["id"]
    # fallback: create one as producer
    payload = {
        "title": "TEST_Offerta Regressione",
        "description": "TEST offer for regression",
        "category": "olio",
        "unit_price": 10.0,
        "unit": "kg",
        "moq": 100,
        "origin_region": "Sicilia",
    }
    r = requests.post(f"{API}/b2b/offers", headers=producer_hdr, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestB2BOfferDetail:
    """Bug fix verification: GET /api/b2b/offers/{offer_id}"""

    def test_get_single_offer_200(self, business_hdr, offer_id):
        r = requests.get(f"{API}/b2b/offers/{offer_id}", headers=business_hdr, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == offer_id
        assert "title" in data and "unit_price" in data and "moq" in data
        assert "_id" not in data  # mongo id must be stripped

    def test_get_single_offer_404(self, business_hdr):
        r = requests.get(f"{API}/b2b/offers/does-not-exist", headers=business_hdr, timeout=20)
        assert r.status_code == 404

    def test_get_single_offer_requires_auth(self, offer_id):
        r = requests.get(f"{API}/b2b/offers/{offer_id}", timeout=20)
        assert r.status_code in (401, 403)


class TestNegotiationFlow:
    """End-to-end negotiation flow between business and producer."""

    neg_id = None

    def test_start_negotiation(self, business_hdr, offer_id):
        r = requests.post(
            f"{API}/b2b/offers/{offer_id}/negotiations",
            headers=business_hdr,
            json={"message": "TEST_ciao, interessato"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["offer_id"] == offer_id
        assert data["status"] == "open"
        assert any(m.get("text") == "TEST_ciao, interessato" for m in data["messages"])
        TestNegotiationFlow.neg_id = data["id"]

    def test_business_sees_negotiation_in_mine(self, business_hdr):
        assert TestNegotiationFlow.neg_id
        r = requests.get(f"{API}/b2b/negotiations/mine", headers=business_hdr, timeout=20)
        assert r.status_code == 200, r.text
        ids = [n["id"] for n in r.json()]
        assert TestNegotiationFlow.neg_id in ids

    def test_send_message(self, business_hdr):
        neg = TestNegotiationFlow.neg_id
        assert neg
        r = requests.post(
            f"{API}/b2b/negotiations/{neg}/messages",
            headers=business_hdr,
            json={"text": "TEST_price question"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert any(m.get("text") == "TEST_price question" for m in r.json()["messages"])

    def test_propose_agreement_business(self, business_hdr):
        neg = TestNegotiationFlow.neg_id
        r = requests.post(
            f"{API}/b2b/negotiations/{neg}/agreements",
            headers=business_hdr,
            json={"price": 9.5, "qty": 200, "terms": "TEST_terms"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        proposals = [m for m in r.json()["messages"] if m.get("kind") == "agreement"]
        assert proposals and proposals[-1]["agreement_status"] == "proposed"

    def test_producer_sees_negotiation(self, producer_hdr):
        neg = TestNegotiationFlow.neg_id
        r = requests.get(f"{API}/b2b/negotiations/mine", headers=producer_hdr, timeout=20)
        assert r.status_code == 200, r.text
        ids = [n["id"] for n in r.json()]
        assert neg in ids, "producer should see the negotiation"

    def test_producer_accepts_agreement(self, producer_hdr):
        neg = TestNegotiationFlow.neg_id
        r = requests.patch(
            f"{API}/b2b/negotiations/{neg}/agreement",
            headers=producer_hdr,
            json={"action": "accept"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "agreed"
        proposals = [m for m in data["messages"] if m.get("kind") == "agreement"]
        assert proposals and proposals[-1]["agreement_status"] == "accepted"

    def test_get_negotiation_by_id(self, producer_hdr):
        neg = TestNegotiationFlow.neg_id
        r = requests.get(f"{API}/b2b/negotiations/{neg}", headers=producer_hdr, timeout=20)
        assert r.status_code == 200
        assert r.json()["id"] == neg
