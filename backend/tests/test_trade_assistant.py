"""Backend tests for the RA MIA Trade Assistant.

Covers: market-analysis, find-markets, compliance, export-plan + steps,
find-buyers, dashboard, privacy (consumer forbidden, cross-producer 404),
and product PATCH with compliance fields.

NOTE: AI endpoints hit GPT-5.4 via Emergent LLM. We limit to 1 call per endpoint.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://sicilia-commerce.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
DEMO_PASS = "Demo1234!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def producer_token():
    return _login("produttore@demo.it", DEMO_PASS)["access_token"]


@pytest.fixture(scope="module")
def producer2_token():
    return _login("frantoi@demo.it", DEMO_PASS)["access_token"]


@pytest.fixture(scope="module")
def consumer_token():
    return _login("consumatore@demo.it", DEMO_PASS)["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def product_id(producer_token):
    r = requests.get(f"{API}/products/mine", headers=_h(producer_token), timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list) and len(items) > 0, "producer should own at least one product"
    return items[0]["id"]


@pytest.fixture(scope="module")
def product2_id(producer2_token):
    r = requests.get(f"{API}/products/mine", headers=_h(producer2_token), timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0
    return items[0]["id"]


# shared state: cache analysis_id / plan_id across tests in order
_state = {}


# ---------------- Market analysis ----------------
class TestMarketAnalysis:
    def test_market_analysis_creates_structured_result(self, producer_token, product_id):
        last_err = None
        for attempt in range(2):
            r = requests.post(
                f"{API}/trade/market-analysis",
                headers=_h(producer_token),
                json={"product_id": product_id, "country": "Germania"},
                timeout=180,
            )
            if r.status_code == 200:
                break
            last_err = f"attempt {attempt}: {r.status_code} {r.text[:300]}"
            time.sleep(3)
        assert r.status_code == 200, last_err
        body = r.json()
        assert body.get("country") == "Germania"
        assert body.get("live") is False, "live must be False when PERPLEXITY not configured"
        data = body.get("data") or {}
        for k in ("summary", "hs_code", "customs", "duties", "health", "labeling", "documents", "risks", "actions", "sources"):
            assert k in data, f"missing data.{k}"
        assert data.get("reliability") == "unverified"
        sources = data.get("sources") or []
        if sources:
            # When live=false all sources should be to_verify
            for s in sources:
                assert s.get("reliability") == "to_verify", s
        _state["analysis_id"] = body["id"]

    def test_list_analyses_contains_new(self, producer_token):
        r = requests.get(f"{API}/trade/analyses", headers=_h(producer_token), timeout=20)
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert _state["analysis_id"] in ids

    def test_get_single_analysis(self, producer_token):
        aid = _state["analysis_id"]
        r = requests.get(f"{API}/trade/analyses/{aid}", headers=_h(producer_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["id"] == aid

    def test_cross_producer_cannot_read_analysis(self, producer2_token):
        aid = _state["analysis_id"]
        r = requests.get(f"{API}/trade/analyses/{aid}", headers=_h(producer2_token), timeout=20)
        assert r.status_code == 404


# ---------------- Find markets ----------------
class TestFindMarkets:
    def test_find_markets_ranked(self, producer_token, product_id):
        r = requests.post(
            f"{API}/trade/find-markets",
            headers=_h(producer_token),
            json={"product_id": product_id},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        markets = body.get("markets") or []
        assert isinstance(markets, list) and len(markets) > 0
        # sorted desc by score
        scores = [m.get("score", 0) for m in markets]
        assert scores == sorted(scores, reverse=True)
        for m in markets:
            assert "country" in m
            assert 0 <= float(m.get("score", 0)) <= 100
            assert isinstance(m.get("reasons", []), list)
            assert m.get("complexity") in ("bassa", "media", "alta", None, "")


# ---------------- Compliance ----------------
class TestCompliance:
    def test_compliance_report(self, producer_token, product_id):
        r = requests.post(
            f"{API}/trade/compliance",
            headers=_h(producer_token),
            json={"product_id": product_id, "country": "Germania", "label_text": "Olio di oliva, ingredienti: olive"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("items"), list)
        for it in body.get("items") or []:
            assert it.get("status") in ("ok", "warn", "missing"), it
        assert isinstance(body.get("missing_fields", []), list)
        assert "label_adjustment_recommended" in body
        assert body.get("reliability") == "unverified"


# ---------------- Export plan ----------------
class TestExportPlan:
    def test_create_plan_has_10_steps(self, producer_token, product_id):
        r = requests.post(
            f"{API}/trade/export-plan",
            headers=_h(producer_token),
            json={"product_id": product_id, "country": "Germania", "analysis_id": _state.get("analysis_id")},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        steps = body.get("steps") or []
        assert len(steps) == 10, f"expected 10 steps, got {len(steps)}"
        _state["plan_id"] = body["id"]
        _state["first_step_id"] = steps[0]["id"]

    def test_list_plans(self, producer_token):
        r = requests.get(f"{API}/trade/export-plans", headers=_h(producer_token), timeout=20)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert _state["plan_id"] in ids

    def test_get_plan(self, producer_token):
        r = requests.get(f"{API}/trade/export-plans/{_state['plan_id']}", headers=_h(producer_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["id"] == _state["plan_id"]

    def test_toggle_step(self, producer_token):
        pid = _state["plan_id"]
        sid = _state["first_step_id"]
        r = requests.patch(
            f"{API}/trade/export-plans/{pid}/steps/{sid}",
            headers=_h(producer_token),
            json={"done": True},
            timeout=20,
        )
        assert r.status_code == 200
        # verify persisted
        r2 = requests.get(f"{API}/trade/export-plans/{pid}", headers=_h(producer_token), timeout=20)
        assert r2.status_code == 200
        step = next(s for s in r2.json()["steps"] if s["id"] == sid)
        assert step["done"] is True


# ---------------- Buyers ----------------
class TestBuyers:
    def test_find_buyers_eurogourmet_matches_germania(self, producer_token):
        r = requests.post(
            f"{API}/trade/find-buyers",
            headers=_h(producer_token),
            json={"country": "Germania"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        buyers = r.json().get("buyers") or []
        assert len(buyers) > 0
        euro = [b for b in buyers if (b.get("company_name") or "").lower().startswith("eurogourmet")]
        assert euro, f"EuroGourmet buyer missing in seed data: {[b.get('company_name') for b in buyers]}"
        assert euro[0]["match"] is True, f"EuroGourmet should match Germania (region={euro[0].get('region')})"


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard_counts(self, producer_token):
        r = requests.get(f"{API}/trade/dashboard", headers=_h(producer_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("markets_monitored", "products_analyzed", "analyses_completed",
                  "open_actions", "labels_todo", "docs_missing", "activities", "disclaimer"):
            assert k in d, f"missing {k}"
        assert d["analyses_completed"] >= 1
        assert d["markets_monitored"] >= 1
        assert d["open_actions"] >= 1  # we have at least 9 remaining steps
        assert isinstance(d["activities"], list)


# ---------------- Privacy / roles ----------------
class TestPrivacy:
    def test_consumer_forbidden_market_analysis(self, consumer_token, product_id):
        r = requests.post(
            f"{API}/trade/market-analysis",
            headers=_h(consumer_token),
            json={"product_id": product_id, "country": "Germania"},
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_cross_producer_cannot_access_product_for_trade(self, producer2_token, product_id):
        # using another producer token with product_id of first producer → 404
        r = requests.post(
            f"{API}/trade/find-markets",
            headers=_h(producer2_token),
            json={"product_id": product_id},
            timeout=30,
        )
        assert r.status_code == 404


# ---------------- Product PATCH compliance fields ----------------
class TestProductCompliance:
    def test_patch_product_compliance_persisted(self, producer_token, product_id):
        # PATCH endpoint uses ProductIn → requires full payload. Fetch current + merge.
        cur = requests.get(f"{API}/products/{product_id}", headers=_h(producer_token), timeout=20).json()
        payload = {
            "name": cur["name"],
            "description": cur["description"],
            "category": cur["category"],
            "price": cur["price"],
            "unit": cur["unit"],
            "stock": cur.get("stock", 0),
            "ingredients": "TEST_olive, sale",
            "allergens": "nessuno",
            "shelf_life": "18 mesi",
            "net_weight": "500 g",
            "packaging": "Vetro",
        }
        r = requests.patch(f"{API}/products/{product_id}", headers=_h(producer_token), json=payload, timeout=20)
        assert r.status_code in (200, 204), f"{r.status_code} {r.text}"
        g = requests.get(f"{API}/products/{product_id}", headers=_h(producer_token), timeout=20)
        assert g.status_code == 200
        p = g.json()
        for k in ("ingredients", "allergens", "shelf_life", "net_weight", "packaging"):
            assert p.get(k) == payload[k], f"{k} not persisted: got {p.get(k)!r}"
