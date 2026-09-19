"""End-to-end backend tests for Sapori di Sicilia."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://sicilia-commerce.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert j["db"] == "connected"


# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------
def test_login_all_roles(tokens):
    assert set(tokens.keys()) >= {"admin", "producer", "business", "collaborator", "logistics", "consumer"}
    for role, data in tokens.items():
        assert data["token"], f"Missing token {role}"
        assert "email" in data["user"]


def test_auth_me(tokens):
    r = requests.get(f"{API}/auth/me", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["email"] == "consumatore@demo.it"
    assert j["role"] == "consumer"


def test_register_producer_then_login():
    email = f"TEST_prod_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": email, "password": "Passw0rd!", "name": "Test Prod",
        "role": "producer", "locale": "it", "company_name": "TEST Co", "region": "Sicilia",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "access_token" in j
    assert j["user"]["role"] == "producer"

    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"}, timeout=10)
    assert r2.status_code == 200


def test_register_admin_forbidden():
    payload = {
        "email": f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com",
        "password": "Passw0rd!", "name": "Nope", "role": "admin", "locale": "it",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=10)
    # Admin role should be rejected. 403 or 422 (pydantic Literal excludes 'admin')
    assert r.status_code in (400, 403, 422), r.text


# -----------------------------------------------------------------------------
# Marketplace
# -----------------------------------------------------------------------------
def test_products_list_approved_only(tokens):
    r = requests.get(f"{API}/products", headers=H(tokens["consumer"]["token"]), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) >= 1
    # all approved
    assert all(p.get("status") == "approved" for p in items)
    # featured sorted first
    flags = [1 if p.get("featured") else 0 for p in items]
    assert flags == sorted(flags, reverse=True), "featured should be first"


def test_product_detail(tokens):
    r = requests.get(f"{API}/products", headers=H(tokens["consumer"]["token"]), timeout=10)
    # Find first product that is actually retrievable (not soft-deleted / stale)
    pid = None
    for cand in r.json():
        if cand["name"].startswith("TEST"):
            continue
        pid = cand["id"]
        break
    assert pid, "No non-TEST product available"
    r2 = requests.get(f"{API}/products/{pid}", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r2.status_code == 200
    assert r2.json()["id"] == pid


def test_packages_list(tokens):
    r = requests.get(f"{API}/packages", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r.status_code == 200
    pkgs = r.json()
    assert isinstance(pkgs, list) and len(pkgs) >= 1
    assert "price" in pkgs[0] and "items" in pkgs[0]


# -----------------------------------------------------------------------------
# Producer flow
# -----------------------------------------------------------------------------
def test_producer_create_product_and_admin_approve(tokens):
    ptoken = tokens["producer"]["token"]
    body = {
        "name": "TEST Miele Ibleo", "description": "Miele testato dal test suite automatico.",
        "category": "miele", "price": 9.5, "unit": "vasetto 250g", "stock": 20, "origin_region": "Sicilia",
    }
    r = requests.post(f"{API}/products", headers=H(ptoken), json=body, timeout=10)
    assert r.status_code == 200, r.text
    prod = r.json()
    assert prod["status"] == "pending"
    pid = prod["id"]

    # Mine list should include it
    r2 = requests.get(f"{API}/products/mine", headers=H(ptoken), timeout=10)
    assert r2.status_code == 200
    assert any(p["id"] == pid for p in r2.json())

    # Admin approve
    r3 = requests.patch(
        f"{API}/admin/products/{pid}/review",
        headers=H(tokens["admin"]["token"]),
        json={"status": "approved"}, timeout=10,
    )
    assert r3.status_code == 200, r3.text

    # Verify approved in list
    r4 = requests.get(f"{API}/products/{pid}", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r4.status_code == 200
    assert r4.json()["status"] == "approved"

    # Cleanup - soft delete
    requests.delete(f"{API}/products/{pid}", headers=H(ptoken), timeout=10)


def test_producer_patch_and_delete(tokens):
    ptoken = tokens["producer"]["token"]
    body = {
        "name": "TEST Delete Me", "description": "Prodotto temporaneo che verrà cancellato.",
        "category": "misc", "price": 1.0, "unit": "pz", "stock": 1,
    }
    r = requests.post(f"{API}/products", headers=H(ptoken), json=body, timeout=10)
    pid = r.json()["id"]
    r2 = requests.patch(f"{API}/products/{pid}", headers=H(ptoken), json={**body, "price": 2.0}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["price"] == 2.0
    r3 = requests.delete(f"{API}/products/{pid}", headers=H(ptoken), timeout=10)
    assert r3.status_code == 200


def test_visibility_plans_and_purchase(tokens):
    ptoken = tokens["producer2"]["token"]
    r = requests.get(f"{API}/visibility/plans", headers=H(ptoken), timeout=10)
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) >= 1

    r2 = requests.post(f"{API}/visibility/purchase", headers=H(ptoken), json={"plan_id": "boost7"}, timeout=10)
    assert r2.status_code == 200, r2.text
    j = r2.json()
    assert j["plan_id"] == "boost7"
    assert j["payment"] == "simulated"
    assert "featured_until" in j


# -----------------------------------------------------------------------------
# Orders
# -----------------------------------------------------------------------------
def test_order_with_items_decrements_stock(tokens):
    ctoken = tokens["consumer"]["token"]
    r = requests.get(f"{API}/products", headers=H(ctoken), timeout=10)
    prod = next(p for p in r.json() if p.get("stock", 0) >= 2 and not p["name"].startswith("TEST"))
    pid = prod["id"]
    stock_before = prod["stock"]

    body = {
        "items": [{"product_id": pid, "qty": 1}],
        "address": "Via Test 1", "city": "Palermo", "zip": "90100", "phone": "+390000000",
    }
    r2 = requests.post(f"{API}/orders", headers=H(ctoken), json=body, timeout=10)
    assert r2.status_code == 200, r2.text
    order = r2.json()
    assert order["status"] == "paid"
    assert order["payment"] == "simulated"
    assert order["total"] == round(prod["price"] * 1, 2)

    # Verify stock decreased
    r3 = requests.get(f"{API}/products/{pid}", headers=H(ctoken), timeout=10)
    assert r3.json()["stock"] == stock_before - 1


def test_order_with_package(tokens):
    ctoken = tokens["consumer"]["token"]
    pkgs = requests.get(f"{API}/packages", headers=H(ctoken), timeout=10).json()
    # skip TEST packages which may reference deleted test products
    pkg = next((p for p in pkgs if not p["name"].startswith("TEST")), pkgs[0])
    body = {
        "package_id": pkg["id"],
        "address": "Via Test 1", "city": "Catania", "zip": "95100", "phone": "+390000",
    }
    r = requests.post(f"{API}/orders", headers=H(ctoken), json=body, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["total"] == pkg["price"]


def test_orders_mine(tokens):
    r = requests.get(f"{API}/orders/mine", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# -----------------------------------------------------------------------------
# B2B
# -----------------------------------------------------------------------------
def test_b2b_full_flow(tokens):
    ptoken = tokens["producer"]["token"]
    btoken = tokens["business"]["token"]

    offer_body = {
        "title": "TEST Olio EVO bulk",
        "description": "Fornitura test per B2B negotiation automatica.",
        "category": "olio",
        "moq": 100, "unit": "litri", "unit_price": 5.5,
    }
    r = requests.post(f"{API}/b2b/offers", headers=H(ptoken), json=offer_body, timeout=10)
    assert r.status_code == 200, r.text
    offer_id = r.json()["id"]

    r2 = requests.post(
        f"{API}/b2b/offers/{offer_id}/negotiations",
        headers=H(btoken), json={"message": "Interessati, prezzo?"}, timeout=10,
    )
    assert r2.status_code == 200, r2.text
    neg_id = r2.json()["id"]

    # producer messages back
    r3 = requests.post(
        f"{API}/b2b/negotiations/{neg_id}/messages",
        headers=H(ptoken), json={"text": "Prezzo 5.5€/L per 500L"}, timeout=10,
    )
    assert r3.status_code == 200

    # producer proposes agreement
    r4 = requests.post(
        f"{API}/b2b/negotiations/{neg_id}/agreements",
        headers=H(ptoken),
        json={"terms": "500L a 5.5€/L, consegna 30gg", "price": 5.5, "qty": 500},
        timeout=10,
    )
    assert r4.status_code == 200, r4.text

    # business accepts
    r5 = requests.patch(
        f"{API}/b2b/negotiations/{neg_id}/agreement",
        headers=H(btoken), json={"action": "accept"}, timeout=10,
    )
    assert r5.status_code == 200, r5.text

    # negotiations mine
    r6 = requests.get(f"{API}/b2b/negotiations/mine", headers=H(btoken), timeout=10)
    assert r6.status_code == 200
    assert any(n["id"] == neg_id for n in r6.json())


# -----------------------------------------------------------------------------
# Logistics
# -----------------------------------------------------------------------------
def test_logistics_flow(tokens):
    ptoken = tokens["producer"]["token"]
    ptoken2 = tokens["producer2"]["token"]
    ltoken = tokens["logistics"]["token"]

    body = {
        "title": "TEST Spedizione Milano",
        "cargo_type": "food",
        "origin": "Palermo", "destination": "Milano", "weight_kg": 300,
        "pallets": 2, "notes": "TEST shipment", "ready_date": "2026-02-15",
    }
    r = requests.post(f"{API}/logistics/requests", headers=H(ptoken), json=body, timeout=10)
    assert r.status_code == 200, r.text
    req_id = r.json()["id"]

    r2 = requests.post(f"{API}/logistics/requests/{req_id}/join",
                       headers=H(ptoken2), json={"weight_kg": 100, "pallets": 1}, timeout=10)
    assert r2.status_code == 200, r2.text

    r3 = requests.post(
        f"{API}/logistics/requests/{req_id}/quotes",
        headers=H(ltoken),
        json={"price": 480.0, "transit_days": 3, "message": "Servizio combinato"},
        timeout=10,
    )
    assert r3.status_code == 200, r3.text

    # partners list
    r4 = requests.get(f"{API}/logistics/partners", headers=H(ptoken), timeout=10)
    assert r4.status_code == 200
    assert isinstance(r4.json(), list)

    # detail exposes can_view_quotes
    r5 = requests.get(f"{API}/logistics/requests/{req_id}", headers=H(ptoken), timeout=10)
    assert r5.status_code == 200
    assert "can_view_quotes" in r5.json()


# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------
def test_labels_flow(tokens):
    ptoken = tokens["producer"]["token"]
    ctoken = tokens["collaborator"]["token"]

    body = {
        "product_name": "TEST Passata Datterino",
        "target_market": "Germania",
        "needs": "Serve traduzione label + valori nutrizionali per export DE.",
    }
    r = requests.post(f"{API}/labels/requests", headers=H(ptoken), json=body, timeout=10)
    assert r.status_code == 200, r.text
    req_id = r.json()["id"]

    r2 = requests.post(
        f"{API}/labels/requests/{req_id}/offers",
        headers=H(ctoken),
        json={"price": 150.0, "days": 5, "message": "Copertura DE+EN"},
        timeout=10,
    )
    assert r2.status_code == 200, r2.text
    collaborator_id = tokens["collaborator"]["user"]["id"]

    r3 = requests.post(
        f"{API}/labels/requests/{req_id}/accept",
        headers=H(ptoken), json={"collaborator_id": collaborator_id}, timeout=10,
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["status"] == "in_progress"

    r4 = requests.patch(
        f"{API}/labels/requests/{req_id}/status",
        headers=H(ctoken), json={"status": "done"}, timeout=10,
    )
    assert r4.status_code == 200
    assert r4.json()["status"] == "done"


# -----------------------------------------------------------------------------
# Admin
# -----------------------------------------------------------------------------
def test_admin_stats_and_pending(tokens):
    tok = tokens["admin"]["token"]
    r = requests.get(f"{API}/admin/stats", headers=H(tok), timeout=10)
    assert r.status_code == 200
    stats = r.json()
    for k in ("users", "products", "orders"):
        assert k in stats, f"Missing stat key {k}"

    r2 = requests.get(f"{API}/admin/pending-products", headers=H(tok), timeout=10)
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)


def test_admin_create_package(tokens):
    tok = tokens["admin"]["token"]
    # Need at least 1 approved product
    prods = requests.get(f"{API}/products", headers=H(tok), timeout=10).json()
    body = {
        "name": "TEST Box Curatore",
        "description": "Pacchetto test create dal test suite.",
        "price": 39.0,
        "product_ids": [prods[0]["id"]],
        "image_url": None,
    }
    r = requests.post(f"{API}/packages", headers=H(tok), json=body, timeout=10)
    assert r.status_code == 200, r.text


# -----------------------------------------------------------------------------
# RBAC
# -----------------------------------------------------------------------------
def test_consumer_forbidden_producer_endpoints(tokens):
    ctoken = tokens["consumer"]["token"]
    r = requests.post(f"{API}/products", headers=H(ctoken),
                      json={"name": "x", "description": "1234567890", "category": "x", "price": 1, "unit": "x", "stock": 1},
                      timeout=10)
    assert r.status_code == 403


def test_consumer_forbidden_admin_endpoints(tokens):
    ctoken = tokens["consumer"]["token"]
    r = requests.get(f"{API}/admin/stats", headers=H(ctoken), timeout=10)
    assert r.status_code == 403


# -----------------------------------------------------------------------------
# Uploads
# -----------------------------------------------------------------------------
def test_upload_and_serve(tokens):
    tok = tokens["producer"]["token"]
    # 1x1 png
    png = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )
    files = {"file": ("test.png", png, "image/png")}
    r = requests.post(f"{API}/upload", headers={"Authorization": f"Bearer {tok}"}, files=files, timeout=15)
    assert r.status_code == 200, r.text
    url = r.json().get("url")
    assert url, "No url in upload response"

    # Serve via /api/files/{path} if it's returned as such
    full = url if url.startswith("http") else f"{BASE_URL}{url}"
    r2 = requests.get(full, timeout=10)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")
