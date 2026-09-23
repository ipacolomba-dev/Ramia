"""Iteration 2 tests: profiles, advisor AI, buyer search AI, product draft AI,
   admin earnings, admin account approvals, logistics cold chain."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://sicilia-commerce.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -----------------------------------------------------------------------------
# Products: wholesale fields
# -----------------------------------------------------------------------------
def test_products_expose_wholesale_fields(tokens):
    r = requests.get(f"{API}/products", headers=H(tokens["consumer"]["token"]), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0
    keys = {"price_wholesale", "moq", "unit_wholesale", "pack_per_carton",
            "cartons_per_layer", "cartons_per_pallet"}
    # Seed has wholesale — at least one product should have all keys present (even if 0/None)
    sample = items[0]
    for k in keys:
        assert k in sample, f"Missing wholesale field {k} in list item"

    r2 = requests.get(f"{API}/products/{sample['id']}", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r2.status_code == 200
    detail = r2.json()
    for k in keys:
        assert k in detail, f"Missing wholesale field {k} in detail"


def test_producer_create_product_with_wholesale(tokens):
    ptoken = tokens["producer"]["token"]
    body = {
        "name": "TEST Wholesale Passata",
        "description": "Prodotto per test dei campi ingrosso completi.",
        "category": "conserve", "price": 4.5, "unit": "500 g", "stock": 50,
        "price_wholesale": 3.0, "moq": 24, "unit_wholesale": "cartone",
        "pack_per_carton": 12, "cartons_per_layer": 8, "cartons_per_pallet": 64,
    }
    r = requests.post(f"{API}/products", headers=H(ptoken), json=body, timeout=10)
    assert r.status_code == 200, r.text
    prod = r.json()
    pid = prod["id"]
    assert prod["price_wholesale"] == 3.0
    assert prod["moq"] == 24
    assert prod["unit_wholesale"] == "cartone"
    assert prod["pack_per_carton"] == 12
    assert prod["cartons_per_layer"] == 8
    assert prod["cartons_per_pallet"] == 64

    # PATCH
    r2 = requests.patch(f"{API}/products/{pid}", headers=H(ptoken),
                        json={**body, "price_wholesale": 3.2, "moq": 48}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["price_wholesale"] == 3.2
    assert r2.json()["moq"] == 48

    # Cleanup
    requests.delete(f"{API}/products/{pid}", headers=H(ptoken), timeout=10)


# -----------------------------------------------------------------------------
# Profiles
# -----------------------------------------------------------------------------
def test_profile_me_get_and_update(tokens):
    ptoken = tokens["producer"]["token"]
    r = requests.get(f"{API}/profiles/me", headers=H(ptoken), timeout=10)
    assert r.status_code == 200, r.text
    prof = r.json()
    for k in ("id", "name", "role", "company_name", "region", "certifications", "awards", "fairs", "billing"):
        assert k in prof, f"Missing profile field {k}"
    assert prof["role"] == "producer"

    update = {
        "bio": "Bio di test aggiornata dal test automatico.",
        "phone": "+390000001",
        "city": "Modica",
        "certifications": [{"name": "Bio"}, {"name": "DOP", "year": "2024"}],
        "awards": [{"name": "Premio Qualità 2025", "year": "2025"}],
        "fairs": [{"name": "Cibus 2026", "place": "Parma"}],
        "billing": {"legal_name": "TEST SRL", "vat_number": "IT12345678901", "sdi_code": "ABCDE12"},
    }
    r2 = requests.put(f"{API}/profiles/me", headers=H(ptoken), json=update, timeout=10)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["bio"] == update["bio"]
    assert body["city"] == "Modica"
    assert [c["name"] for c in body["certifications"]] == ["Bio", "DOP"]
    assert [a["name"] for a in body["awards"]] == ["Premio Qualità 2025"]
    assert [f["name"] for f in body["fairs"]] == ["Cibus 2026"]
    assert body["billing"]["vat_number"] == "IT12345678901"

    # Verify persistence
    r3 = requests.get(f"{API}/profiles/me", headers=H(ptoken), timeout=10)
    assert r3.json()["bio"] == update["bio"]
    assert [c["name"] for c in r3.json()["certifications"]] == ["Bio", "DOP"]


def test_list_producers(tokens):
    r = requests.get(f"{API}/producers", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r.status_code == 200
    prods = r.json()
    assert isinstance(prods, list) and len(prods) >= 1
    p = prods[0]
    for k in ("id", "company_name", "product_count", "certifications"):
        assert k in p
    assert p["product_count"] >= 1


def test_producer_public_profile(tokens):
    # find via list
    lst = requests.get(f"{API}/producers", headers=H(tokens["consumer"]["token"]), timeout=10).json()
    pid = lst[0]["id"]
    r = requests.get(f"{API}/producers/{pid}", headers=H(tokens["consumer"]["token"]), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == pid
    assert "products" in body
    assert isinstance(body["products"], list)


# -----------------------------------------------------------------------------
# Advisor AI  (limit to 1 call)
# -----------------------------------------------------------------------------
def test_advisor_chat_and_history(tokens):
    ptoken = tokens["producer"]["token"]
    session_id = f"test-{uuid.uuid4().hex[:8]}"
    body = {"session_id": session_id, "message": "Serve certificazione FDA per esportare olio EVO negli USA?"}
    r = requests.post(f"{API}/advisor/chat", headers=H(ptoken), json=body, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "reply" in j and j["reply"].strip() != ""
    assert "citations" in j
    assert "live" in j
    # Perplexity is not configured, so live should be False
    assert j["live"] is False

    # History should include user+assistant messages
    r2 = requests.get(f"{API}/advisor/history/{session_id}", headers=H(ptoken), timeout=10)
    assert r2.status_code == 200
    msgs = r2.json()
    assert len(msgs) >= 2
    roles = [m["role"] for m in msgs]
    assert "user" in roles and "assistant" in roles


# -----------------------------------------------------------------------------
# AI buyer search (1 call)
# -----------------------------------------------------------------------------
def test_ai_search(tokens):
    ctoken = tokens["consumer"]["token"]
    body = {"query": "Vorrei olio EVO siciliano di qualità per un piccolo ristorante", "destination": "Milano"}
    r = requests.post(f"{API}/ai/search", headers=H(ctoken), json=body, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "answer" in j and isinstance(j["answer"], str) and j["answer"].strip() != ""
    assert "products" in j and isinstance(j["products"], list)
    assert "shipment_id" in j  # may be None


# -----------------------------------------------------------------------------
# AI product draft (1 call)
# -----------------------------------------------------------------------------
VALID_CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"]


def test_ai_product_draft(tokens):
    ptoken = tokens["producer"]["token"]
    body = {"description": "Olio EVO monocultivar Nocellara del Belice, prima spremitura a freddo, bottiglia da 0,5 L."}
    r = requests.post(f"{API}/ai/product-draft", headers=H(ptoken), json=body, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"]
    assert isinstance(d["description"], str) and len(d["description"]) >= 20
    assert d["category"] in VALID_CATEGORIES
    assert isinstance(d["price"], (int, float)) and d["price"] > 0
    assert d["unit"]
    assert isinstance(d["price_wholesale"], (int, float))


def test_ai_product_draft_forbidden_consumer(tokens):
    ctoken = tokens["consumer"]["token"]
    r = requests.post(f"{API}/ai/product-draft", headers=H(ctoken), json={"description": "..."}, timeout=15)
    assert r.status_code == 403


# -----------------------------------------------------------------------------
# Owner earnings
# -----------------------------------------------------------------------------
def test_admin_earnings(tokens):
    tok = tokens["admin"]["token"]
    r = requests.get(f"{API}/admin/earnings", headers=H(tok), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("advertising", "sales_commission", "logistics_commission", "labels_commission", "total", "rates"):
        assert k in j, f"Missing earnings key {k}"
    assert isinstance(j["total"], (int, float))
    # total is sum of the 4 buckets
    expected = round(
        j["advertising"] + j["sales_commission"] + j["logistics_commission"] + j["labels_commission"], 2
    )
    assert abs(j["total"] - expected) < 0.01


def test_admin_earnings_forbidden_non_admin(tokens):
    r = requests.get(f"{API}/admin/earnings", headers=H(tokens["producer"]["token"]), timeout=10)
    assert r.status_code == 403


# -----------------------------------------------------------------------------
# Account approval flow
# -----------------------------------------------------------------------------
def _register(email, role):
    payload = {
        "email": email, "password": "Passw0rd!", "name": "Approvazione Test",
        "role": role, "locale": "it", "company_name": f"TEST {role} Co", "region": "Sicilia",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_register_pending_flow(tokens):
    # Register a business, must be approved=false
    email = f"TEST_bus_{uuid.uuid4().hex[:8]}@example.com"
    reg = _register(email, "business")
    assert reg["user"]["approved"] is False
    new_token = reg["access_token"]
    new_id = reg["user"]["id"]

    # Appears in pending list for admin
    r = requests.get(f"{API}/admin/accounts/pending", headers=H(tokens["admin"]["token"]), timeout=10)
    assert r.status_code == 200
    pending_ids = [p.get("id") or p.get("_id") for p in r.json()]
    assert new_id in pending_ids, f"Newly registered account not in pending list; got ids={pending_ids[:5]}"

    # Not-approved business trying to make a negotiation on any offer -> 403
    offers = requests.get(f"{API}/b2b/offers", headers=H(new_token), timeout=10).json()
    if offers:
        r_neg = requests.post(
            f"{API}/b2b/offers/{offers[0]['id']}/negotiations",
            headers=H(new_token), json={"message": "Ciao, sono in attesa di approvazione"}, timeout=10,
        )
        assert r_neg.status_code == 403, f"Unapproved business must get 403, got {r_neg.status_code} {r_neg.text}"

    # Approve
    r_approve = requests.patch(
        f"{API}/admin/accounts/{new_id}/review",
        headers=H(tokens["admin"]["token"]), json={"action": "approve"}, timeout=10,
    )
    assert r_approve.status_code == 200, r_approve.text
    assert r_approve.json().get("approved") is True

    # Now not in pending anymore
    r2 = requests.get(f"{API}/admin/accounts/pending", headers=H(tokens["admin"]["token"]), timeout=10)
    assert new_id not in [p.get("id") or p.get("_id") for p in r2.json()]


def test_seed_business_approved_can_negotiate(tokens):
    btoken = tokens["business"]["token"]
    ptoken = tokens["producer"]["token"]
    # Ensure at least one offer exists
    offer = requests.post(
        f"{API}/b2b/offers", headers=H(ptoken),
        json={"title": "TEST Approve Offer", "description": "Test description for negotiate.",
              "category": "olio", "moq": 50, "unit": "litri", "unit_price": 6.0}, timeout=10,
    ).json()
    r = requests.post(
        f"{API}/b2b/offers/{offer['id']}/negotiations",
        headers=H(btoken), json={"message": "TEST — sono approvato"}, timeout=10,
    )
    assert r.status_code == 200, f"Seed business is approved, expected 200 got {r.status_code} {r.text}"


# -----------------------------------------------------------------------------
# Logistics cold chain
# -----------------------------------------------------------------------------
def test_logistics_cold_chain_fields(tokens):
    ptoken = tokens["producer"]["token"]
    body = {
        "title": "TEST Cold chain Roma",
        "cargo_type": "food",
        "origin": "Palermo", "destination": "Roma", "weight_kg": 200,
        "pallets": 1, "notes": "Refrigerato", "ready_date": "2026-02-20",
        "cold_chain": True, "service_size": "piccoli",
    }
    r = requests.post(f"{API}/logistics/requests", headers=H(ptoken), json=body, timeout=10)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["cold_chain"] is True
    assert doc["service_size"] == "piccoli"

    r2 = requests.get(f"{API}/logistics/requests/{doc['id']}", headers=H(ptoken), timeout=10)
    assert r2.status_code == 200
    j = r2.json()
    assert j["cold_chain"] is True
    assert j["service_size"] == "piccoli"
