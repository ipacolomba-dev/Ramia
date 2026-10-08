"""Backend tests for the NEW notification enrichments:
- GET /api/regulatory/alerts filters by type and/or severity (producer + admin)
- POST /api/regulatory/alerts/read-all (producer + admin)
- GET /api/trade/dashboard returns integer 'alerts' AND 'recent_alerts' array
- Regression: creating a requirement (admin) for a monitored country increments
  producer unread count AND appears in recent_alerts; read-all resets unread.
- RBAC unchanged.

NOTE: order of tests inside TestFiltersReadAllDashboard matters because
read-all zeroes the producer unread count.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://sicilia-commerce.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@saporidisicilia.it", "SaporiAdmin2026!")
PRODUCER = ("produttore@demo.it", "Demo1234!")


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {"admin": _login(*ADMIN), "producer": _login(*PRODUCER)}


@pytest.fixture(scope="module")
def germania_source_id(tokens):
    r = requests.get(f"{API}/regulatory/sources?country=Germania", headers=_h(tokens["admin"]))
    assert r.status_code == 200, r.text
    sources = r.json()
    assert sources, "no Germania sources seeded"
    return sources[0]["id"]


def _ensure_monitor(tokens):
    """Producer monitors Germania (idempotent)."""
    r = requests.post(f"{API}/regulatory/monitors",
                      json={"country": "Germania"}, headers=_h(tokens["producer"]))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _create_requirement(tokens, source_id, severity="medium", rtype="LABEL",
                        country="Germania", description=None):
    body = {
        "source_id": source_id,
        "country": country,
        "category": "olio",
        "requirement_type": rtype,
        "description": description or f"TEST_NOTIF req {uuid.uuid4().hex[:8]}",
        "severity": severity,
        "is_demo": True,
    }
    r = requests.post(f"{API}/regulatory/requirements", json=body, headers=_h(tokens["admin"]))
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ------------------------- Alert filters (producer) -------------------------

class TestAlertFiltersProducer:
    def test_setup_requires_requirement_new_alert(self, tokens, germania_source_id):
        _ensure_monitor(tokens)
        # Ensure at least one requirement_new (medium severity) alert exists for Germania
        _create_requirement(tokens, germania_source_id, severity="medium", rtype="LABEL")
        alerts = requests.get(f"{API}/regulatory/alerts", headers=_h(tokens["producer"]))
        assert alerts.status_code == 200
        data = alerts.json()
        assert any(a["type"] == "requirement_new" for a in data), "no requirement_new baseline"

    def test_filter_by_type_requirement_new(self, tokens):
        r = requests.get(f"{API}/regulatory/alerts?type=requirement_new",
                         headers=_h(tokens["producer"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data, "expected at least one requirement_new alert for producer monitoring Germania"
        for a in data:
            assert a["type"] == "requirement_new", f"unexpected type {a['type']}"

    def test_filter_by_severity_high(self, tokens, germania_source_id):
        # Ensure at least one high severity alert exists (version alerts are 'high')
        # Create a fresh document and bump version to generate a 'version' alert (severity=high)
        doc_body = {
            "source_id": germania_source_id,
            "title": f"TEST_NOTIF_DOC {uuid.uuid4().hex[:6]}",
            "country": "Germania",
            "category": "olio",
            "language": "de",
            "content": "contenuto v1\nriga A",
            "is_demo": True,
        }
        rc = requests.post(f"{API}/regulatory/documents", json=doc_body,
                           headers=_h(tokens["admin"]))
        assert rc.status_code == 200, rc.text
        doc_id = rc.json()["id"]
        rv = requests.post(f"{API}/regulatory/documents/{doc_id}/versions",
                           json={"content": "contenuto v2\nriga A\nriga B", "note": "upd"},
                           headers=_h(tokens["admin"]))
        assert rv.status_code == 200, rv.text

        r = requests.get(f"{API}/regulatory/alerts?severity=high",
                         headers=_h(tokens["producer"]))
        assert r.status_code == 200
        data = r.json()
        assert data, "expected at least one high severity alert"
        for a in data:
            assert a["severity"] == "high", f"unexpected severity {a['severity']}"

    def test_filter_by_type_and_severity_combined(self, tokens):
        # version alerts are high severity -> combining type=version & severity=high should be consistent
        r = requests.get(f"{API}/regulatory/alerts?type=version&severity=high",
                         headers=_h(tokens["producer"]))
        assert r.status_code == 200
        for a in r.json():
            assert a["type"] == "version"
            assert a["severity"] == "high"

    def test_no_filter_returns_all_producer_visible(self, tokens):
        all_r = requests.get(f"{API}/regulatory/alerts", headers=_h(tokens["producer"]))
        type_r = requests.get(f"{API}/regulatory/alerts?type=requirement_new",
                              headers=_h(tokens["producer"]))
        assert all_r.status_code == 200 and type_r.status_code == 200
        all_alerts = all_r.json()
        type_alerts = type_r.json()
        # all producer-visible alerts must have country == Germania (only monitor)
        for a in all_alerts:
            assert a["country"].lower() == "germania"
        assert len(all_alerts) >= len(type_alerts)


# ------------------------- Alert filters (admin) -------------------------

class TestAlertFiltersAdmin:
    def test_admin_filter_by_type_version(self, tokens, germania_source_id):
        # ensure a version alert exists (just create a new doc+version)
        doc_body = {
            "source_id": germania_source_id,
            "title": f"TEST_NOTIF_ADMIN_DOC {uuid.uuid4().hex[:6]}",
            "country": "Germania",
            "category": "olio",
            "language": "de",
            "content": "x1",
            "is_demo": True,
        }
        rc = requests.post(f"{API}/regulatory/documents", json=doc_body,
                           headers=_h(tokens["admin"]))
        assert rc.status_code == 200
        doc_id = rc.json()["id"]
        rv = requests.post(f"{API}/regulatory/documents/{doc_id}/versions",
                           json={"content": "x2 nuovo", "note": "n"},
                           headers=_h(tokens["admin"]))
        assert rv.status_code == 200

        r = requests.get(f"{API}/regulatory/alerts?type=version", headers=_h(tokens["admin"]))
        assert r.status_code == 200
        data = r.json()
        assert data, "admin should see at least one version alert"
        for a in data:
            assert a["type"] == "version"


# ------------------------- Read-all + dashboard + regression -------------------------

class TestReadAllAndDashboard:
    """IMPORTANT: this class should run AFTER filter tests (alphabetical order
    puts TestAlertFiltersAdmin/Producer first, then TestReadAllAndDashboard).
    """

    def test_1_dashboard_contains_alerts_and_recent_alerts(self, tokens):
        _ensure_monitor(tokens)
        r = requests.get(f"{API}/trade/dashboard", headers=_h(tokens["producer"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "alerts" in data and isinstance(data["alerts"], int)
        assert "recent_alerts" in data and isinstance(data["recent_alerts"], list)
        assert len(data["recent_alerts"]) <= 5
        for a in data["recent_alerts"]:
            for k in ("id", "type", "country", "title", "severity", "read"):
                assert k in a, f"missing {k} in recent_alerts item"

    def test_2_create_requirement_increments_unread_and_appears_in_recent(
        self, tokens, germania_source_id
    ):
        _ensure_monitor(tokens)
        before = requests.get(f"{API}/regulatory/alerts/unread-count",
                              headers=_h(tokens["producer"])).json()["count"]
        marker = f"TEST_NOTIF_REGR_{uuid.uuid4().hex[:8]}"
        req_id = _create_requirement(tokens, germania_source_id, severity="medium",
                                     description=marker)
        after = requests.get(f"{API}/regulatory/alerts/unread-count",
                             headers=_h(tokens["producer"])).json()["count"]
        assert after == before + 1, f"unread not incremented: before={before} after={after}"

        dash = requests.get(f"{API}/trade/dashboard", headers=_h(tokens["producer"]))
        assert dash.status_code == 200
        data = dash.json()
        # new alert should be the first in recent_alerts (sorted by created_at desc)
        assert data["recent_alerts"], "recent_alerts empty after creating alert"
        titles = [a.get("title", "") for a in data["recent_alerts"]]
        # title format: f"Nuovo requisito ({type}) per {country}" — marker is in detail, so match on type/country
        top = data["recent_alerts"][0]
        assert top["type"] == "requirement_new"
        assert top["country"].lower() == "germania"
        assert top["read"] is False

    def test_3_admin_read_all_returns_ok_zero_without_error(self, tokens):
        r = requests.post(f"{API}/regulatory/alerts/read-all", headers=_h(tokens["admin"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"ok": True, "marked": 0}

    def test_4_producer_read_all_zeros_unread(self, tokens):
        r = requests.post(f"{API}/regulatory/alerts/read-all",
                          headers=_h(tokens["producer"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("marked"), int) and data["marked"] >= 1

        c = requests.get(f"{API}/regulatory/alerts/unread-count",
                         headers=_h(tokens["producer"]))
        assert c.status_code == 200
        assert c.json()["count"] == 0

        # Dashboard should also reflect 0
        dash = requests.get(f"{API}/trade/dashboard", headers=_h(tokens["producer"]))
        assert dash.status_code == 200
        d = dash.json()
        assert d["alerts"] == 0
        # recent_alerts still populated but all read
        for a in d["recent_alerts"]:
            assert a["read"] is True

    def test_5_create_requirement_after_readall_increments_unread_back(
        self, tokens, germania_source_id
    ):
        _create_requirement(tokens, germania_source_id, severity="medium")
        c = requests.get(f"{API}/regulatory/alerts/unread-count",
                         headers=_h(tokens["producer"]))
        assert c.status_code == 200
        assert c.json()["count"] >= 1

        dash = requests.get(f"{API}/trade/dashboard", headers=_h(tokens["producer"]))
        assert dash.status_code == 200
        d = dash.json()
        assert d["alerts"] >= 1
        # top recent_alert should now be unread
        assert d["recent_alerts"][0]["read"] is False


# ------------------------- RBAC -------------------------

class TestRBAC:
    def test_producer_cannot_create_source(self, tokens):
        body = {"name": "x", "authority": "x", "country": "Germania",
                "url": "https://e.co", "reliability": "D"}
        r = requests.post(f"{API}/regulatory/sources", json=body,
                          headers=_h(tokens["producer"]))
        assert r.status_code == 403, r.text

    def test_producer_cannot_create_requirement(self, tokens, germania_source_id):
        body = {
            "source_id": germania_source_id, "country": "Germania", "category": "olio",
            "requirement_type": "LABEL", "description": "x", "severity": "low",
        }
        r = requests.post(f"{API}/regulatory/requirements", json=body,
                          headers=_h(tokens["producer"]))
        assert r.status_code == 403, r.text

    def test_producer_cannot_create_document(self, tokens, germania_source_id):
        body = {"source_id": germania_source_id, "title": "x", "country": "Germania",
                "category": "olio", "language": "de", "content": "x"}
        r = requests.post(f"{API}/regulatory/documents", json=body,
                          headers=_h(tokens["producer"]))
        assert r.status_code == 403

    def test_alerts_requires_auth(self):
        r = requests.get(f"{API}/regulatory/alerts")
        assert r.status_code in (401, 403), r.text

    def test_alerts_accessible_by_producer_and_admin(self, tokens):
        for role in ("producer", "admin"):
            r = requests.get(f"{API}/regulatory/alerts", headers=_h(tokens[role]))
            assert r.status_code == 200, f"{role}: {r.status_code} {r.text}"
