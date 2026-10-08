"""HTTP regression tests for Trade Assistant (Market Analysis).

Covers:
- Happy-path (1 AI call): producer login -> product -> POST market-analysis -> poll until ready/error (never stuck pending).
- Durability fields: GET /api/trade/analyses/{id} exposes status, attempts (>=1), error (null when ready).
- GET /api/trade/analyses lists items each with 'status'.
- Role/ownership regression: consumer -> 403 on POST; producer -> 404 on unknown id.
"""
import os
import time

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PRODUCER = {"email": "produttore@demo.it", "password": "Demo1234!"}
CONSUMER = {"email": "consumatore@demo.it", "password": "Demo1234!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def producer_token():
    return _login(PRODUCER)


@pytest.fixture(scope="module")
def consumer_token():
    return _login(CONSUMER)


@pytest.fixture(scope="module")
def producer_product_id(producer_token):
    r = requests.get(
        f"{API}/products/mine",
        headers={"Authorization": f"Bearer {producer_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"products/mine failed: {r.status_code} {r.text}"
    products = r.json()
    assert isinstance(products, list) and len(products) > 0, "producer must have at least one product"
    pid = products[0].get("id") or products[0].get("_id")
    assert pid, f"product id missing in {products[0]}"
    return pid


# --- Happy path (1 AI call) ---------------------------------------------------
def test_happy_path_market_analysis_eventually_ready_or_error(producer_token, producer_product_id):
    headers = {"Authorization": f"Bearer {producer_token}"}

    # Kick off analysis
    r = requests.post(
        f"{API}/trade/market-analysis",
        headers=headers,
        json={"product_id": producer_product_id, "country": "Germania"},
        timeout=60,
    )
    assert r.status_code == 200, f"POST market-analysis: {r.status_code} {r.text}"
    body = r.json()
    assert "id" in body and body.get("status") == "pending", f"unexpected initial body: {body}"
    analysis_id = body["id"]

    # Poll ~90s (every 5s)
    final_status = None
    final_doc = None
    deadline = time.time() + 90
    while time.time() < deadline:
        g = requests.get(f"{API}/trade/analyses/{analysis_id}", headers=headers, timeout=30)
        assert g.status_code == 200, f"GET analyses/{{id}}: {g.status_code} {g.text}"
        doc = g.json()
        assert "status" in doc, f"missing status: {doc}"
        if doc["status"] in ("ready", "error"):
            final_status = doc["status"]
            final_doc = doc
            break
        time.sleep(5)

    assert final_status in ("ready", "error"), f"stuck in pending after 90s: final_doc={final_doc}"

    # Durability fields contract
    assert "attempts" in final_doc, f"missing attempts: {final_doc}"
    assert isinstance(final_doc["attempts"], int) and final_doc["attempts"] >= 1
    assert "error" in final_doc
    if final_status == "ready":
        assert final_doc["error"] in (None, ""), f"error must be null when ready, got {final_doc['error']}"

    # List endpoint must include status for each entry
    l = requests.get(f"{API}/trade/analyses", headers=headers, timeout=30)
    assert l.status_code == 200, f"GET /trade/analyses: {l.status_code} {l.text}"
    items = l.json()
    assert isinstance(items, list) and len(items) >= 1
    for it in items:
        assert "status" in it, f"list item missing status: {it}"
    # Our analysis must be listed
    assert any((it.get("id") or it.get("_id")) == analysis_id for it in items), "created analysis not listed"


# --- Role/ownership regression -----------------------------------------------
def test_consumer_cannot_create_market_analysis(consumer_token, producer_product_id):
    r = requests.post(
        f"{API}/trade/market-analysis",
        headers={"Authorization": f"Bearer {consumer_token}"},
        json={"product_id": producer_product_id, "country": "Germania"},
        timeout=30,
    )
    assert r.status_code == 403, f"expected 403 for consumer, got {r.status_code}: {r.text}"


def test_producer_gets_404_on_unknown_analysis(producer_token):
    r = requests.get(
        f"{API}/trade/analyses/nonexistent-id-xyz",
        headers={"Authorization": f"Bearer {producer_token}"},
        timeout=30,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"
