"""Regulatory Intelligence Engine - end-to-end HTTP backend tests.

Covers:
- RBAC on /api/regulatory/{sources,documents,requirements,center,audit}: producer -> 403.
- /api/regulatory/center on fresh demo DB: sources_total=4, documents=4, requirements=14, requirements_demo=14.
- Admin chain: create source -> create document -> add version (409 identical / 201 new + diff) -> create requirement.
- Verify requirement: DEMO -> 400; non-demo -> HUMAN_VERIFIED.
- Producer GET /knowledge?country=Germania -> requirements+sources+conflicts, confidence levels (demo => UNVERIFIED).
- Trade market-analysis async + KB grounding: data.kb present, snapshot_id set, snapshot ownership (owner/admin OK, other producer 403).
- POST /trade/compliance -> data.kb present and grounded.
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@saporidisicilia.it", "password": "SaporiAdmin2026!"}
PRODUCER = {"email": "produttore@demo.it", "password": "Demo1234!"}
PRODUCER2 = {"email": "frantoi@demo.it", "password": "Demo1234!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def producer_token():
    return _login(PRODUCER)


@pytest.fixture(scope="module")
def producer2_token():
    return _login(PRODUCER2)


@pytest.fixture(scope="module")
def producer_product_id(producer_token):
    r = requests.get(
        f"{API}/products/mine",
        headers={"Authorization": f"Bearer {producer_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"products/mine failed: {r.status_code} {r.text}"
    products = r.json()
    assert isinstance(products, list) and len(products) > 0
    pid = products[0].get("id") or products[0].get("_id")
    assert pid
    return pid


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------- RBAC -------------------------------
class TestRBAC:
    """Producer must get 403 on admin-only regulatory endpoints."""

    @pytest.mark.parametrize("path,method", [
        ("/regulatory/sources", "GET"),
        ("/regulatory/documents", "GET"),
        ("/regulatory/requirements", "GET"),
        ("/regulatory/center", "GET"),
        ("/regulatory/audit", "GET"),
    ])
    def test_producer_forbidden_on_admin_endpoints(self, producer_token, path, method):
        r = requests.request(method, f"{API}{path}", headers=_h(producer_token), timeout=30)
        assert r.status_code == 403, f"{method} {path} expected 403 got {r.status_code}: {r.text}"

    def test_producer_forbidden_on_sources_post(self, producer_token):
        r = requests.post(
            f"{API}/regulatory/sources",
            headers=_h(producer_token),
            json={"name": "x", "authority": "x", "country": "Italia", "url": "https://example.com"},
            timeout=30,
        )
        assert r.status_code == 403, f"POST /sources expected 403 got {r.status_code}: {r.text}"


# ------------------------------- Center -------------------------------
class TestRegulatoryCenter:
    def test_center_counts_fresh_demo(self, admin_token):
        r = requests.get(f"{API}/regulatory/center", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Fresh demo expectations (per request). May be higher if admin created extras in same DB
        # but on a clean iteration we expect exact values.
        assert d["sources_total"] >= 4
        assert d["documents"] >= 4
        assert d["requirements"] >= 14
        assert d["requirements_demo"] >= 14
        # Specifically check that demo seed is intact
        assert d["requirements_demo"] >= d["requirements"] - 2  # most are demo


# ------------------------------- Admin chain -------------------------------
@pytest.fixture(scope="module")
def created_source(admin_token):
    unique = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST Fonte {unique}",
        "authority": "TEST Authority",
        "country": "Germania",
        "url": f"https://example.com/test-{unique}",
        "source_type": "OFFICIAL_GOVERNMENT",
        "reliability": "A",
        "is_demo": False,
    }
    r = requests.post(f"{API}/regulatory/sources", headers=_h(admin_token), json=payload, timeout=30)
    assert r.status_code == 200, f"create source: {r.status_code} {r.text}"
    s = r.json()
    assert s.get("id") and s.get("name") == payload["name"]
    assert s.get("status") == "to_verify"
    return s


@pytest.fixture(scope="module")
def created_document(admin_token, created_source):
    payload = {
        "source_id": created_source["id"],
        "title": "TEST Documento Normativo",
        "country": "Germania",
        "category": "test",
        "content": "Contenuto iniziale del documento test versione 1.",
        "is_demo": False,
    }
    r = requests.post(f"{API}/regulatory/documents", headers=_h(admin_token), json=payload, timeout=30)
    assert r.status_code == 200, f"create doc: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("id") and d.get("current_version") == 1
    return d


class TestVersions:
    def test_identical_content_returns_409(self, admin_token, created_document):
        r = requests.post(
            f"{API}/regulatory/documents/{created_document['id']}/versions",
            headers=_h(admin_token),
            json={"content": "Contenuto iniziale del documento test versione 1.", "note": "dup"},
            timeout=30,
        )
        assert r.status_code == 409, f"expected 409 got {r.status_code}: {r.text}"

    def test_new_content_returns_new_version_with_diff(self, admin_token, created_document):
        r = requests.post(
            f"{API}/regulatory/documents/{created_document['id']}/versions",
            headers=_h(admin_token),
            json={"content": "Contenuto aggiornato del documento test versione 2 con nuova riga.", "note": "upd"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"
        body = r.json()
        assert body["version"] == 2
        assert "diff" in body and ("added" in body["diff"]) and ("removed" in body["diff"])
        assert isinstance(body["diff"]["added"], list) and len(body["diff"]["added"]) >= 1


@pytest.fixture(scope="module")
def created_requirement_real(admin_token, created_source, created_document):
    """Non-demo requirement (so it can be human-verified)."""
    payload = {
        "country": "Germania",
        "category": "test",
        "requirement_type": "LABEL",
        "description": "TEST Requisito reale di etichettatura collegato a fonte e documento.",
        "severity": "high",
        "source_id": created_source["id"],
        "document_id": created_document["id"],
        "is_demo": False,
    }
    r = requests.post(f"{API}/regulatory/requirements", headers=_h(admin_token), json=payload, timeout=30)
    assert r.status_code == 200, f"create req: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("id")
    assert body.get("source_id") == created_source["id"]
    assert body.get("document_id") == created_document["id"]
    assert body.get("verification_status") == "AI_DETECTED"
    assert body.get("is_demo") is False
    return body


class TestRequirements:
    def test_create_requires_valid_source(self, admin_token):
        bad = {
            "country": "Germania", "category": "test", "requirement_type": "LABEL",
            "description": "x" * 20, "source_id": "does-not-exist",
        }
        r = requests.post(f"{API}/regulatory/requirements", headers=_h(admin_token), json=bad, timeout=30)
        assert r.status_code == 404

    def test_verify_demo_returns_400(self, admin_token):
        # Pick any seeded DEMO requirement
        r = requests.get(f"{API}/regulatory/requirements?country=Germania",
                         headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        reqs = r.json()
        demo = next((x for x in reqs if x.get("is_demo")), None)
        assert demo is not None, "expected at least one DEMO requirement for Germania"
        v = requests.post(f"{API}/regulatory/requirements/{demo['id']}/verify",
                          headers=_h(admin_token), timeout=30)
        assert v.status_code == 400, f"expected 400 for DEMO verify, got {v.status_code}: {v.text}"

    def test_verify_non_demo_returns_human_verified(self, admin_token, created_requirement_real):
        v = requests.post(
            f"{API}/regulatory/requirements/{created_requirement_real['id']}/verify",
            headers=_h(admin_token), timeout=30,
        )
        assert v.status_code == 200, f"{v.status_code} {v.text}"
        body = v.json()
        assert body.get("verification_status") == "HUMAN_VERIFIED"


# ------------------------------- Knowledge Base (producer) -------------------------------
class TestKnowledge:
    def test_producer_knowledge_germania(self, producer_token, created_requirement_real):
        r = requests.get(f"{API}/regulatory/knowledge?country=Germania",
                         headers=_h(producer_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("requirements", "sources", "conflicts"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["requirements"], list) and len(data["requirements"]) >= 1
        # Every requirement must have a confidence block
        for req in data["requirements"]:
            assert "confidence" in req and "level" in req["confidence"]
            if req.get("is_demo"):
                assert req["confidence"]["level"] == "UNVERIFIED", (
                    f"demo requirement must be UNVERIFIED, got {req['confidence']['level']}"
                )
        # At least one source present
        assert isinstance(data["sources"], list) and len(data["sources"]) >= 1


# ------------------------------- Trade market analysis + snapshot -------------------------------
@pytest.fixture(scope="module")
def ready_analysis(producer_token, producer_product_id):
    headers = _h(producer_token)
    r = requests.post(
        f"{API}/trade/market-analysis",
        headers=headers,
        json={"product_id": producer_product_id, "country": "Germania"},
        timeout=60,
    )
    assert r.status_code == 200, f"POST market-analysis: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("status") == "pending"
    analysis_id = body["id"]

    final = None
    deadline = time.time() + 150
    while time.time() < deadline:
        g = requests.get(f"{API}/trade/analyses/{analysis_id}", headers=headers, timeout=30)
        assert g.status_code == 200
        doc = g.json()
        if doc["status"] in ("ready", "error"):
            final = doc
            break
        time.sleep(5)
    assert final is not None, f"stuck pending for id={analysis_id}"
    assert final["status"] == "ready", f"analysis ended in {final['status']}: {final.get('error')}"
    return final


class TestMarketAnalysisKB:
    def test_data_kb_present(self, ready_analysis):
        data = ready_analysis.get("data") or {}
        assert "kb" in data, "data.kb must be present"
        kb = data["kb"]
        for k in ("requirements", "sources", "conflicts", "has_official_source"):
            assert k in kb, f"kb missing {k}"
        assert isinstance(kb["requirements"], list)
        assert isinstance(kb["sources"], list)
        assert isinstance(kb["has_official_source"], bool)

    def test_snapshot_id_set(self, ready_analysis):
        assert ready_analysis.get("snapshot_id"), "snapshot_id must be set when ready"


class TestSnapshotOwnership:
    def test_owner_can_fetch_snapshot(self, producer_token, ready_analysis):
        r = requests.get(
            f"{API}/regulatory/snapshots/{ready_analysis['id']}",
            headers=_h(producer_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        snap = r.json()
        assert snap.get("analysis_id") == ready_analysis["id"]
        assert snap.get("country") == "Germania"
        # Should expose aggregated counts and provenance
        for k in ("requirements_count", "sources_count", "conflicts_count", "has_official_source"):
            assert k in snap

    def test_admin_can_fetch_snapshot(self, admin_token, ready_analysis):
        r = requests.get(
            f"{API}/regulatory/snapshots/{ready_analysis['id']}",
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text

    def test_other_producer_forbidden(self, producer2_token, ready_analysis):
        r = requests.get(
            f"{API}/regulatory/snapshots/{ready_analysis['id']}",
            headers=_h(producer2_token), timeout=30,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ------------------------------- Trade compliance KB grounding -------------------------------
class TestComplianceKB:
    def test_compliance_returns_kb(self, producer_token, producer_product_id):
        r = requests.post(
            f"{API}/trade/compliance",
            headers=_h(producer_token),
            json={"product_id": producer_product_id, "country": "Germania"},
            timeout=120,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert "kb" in data, "compliance response must include kb"
        kb = data["kb"]
        for k in ("requirements", "sources", "conflicts", "has_official_source"):
            assert k in kb
        # At least the demo Germania requirements should be present
        assert isinstance(kb["requirements"], list) and len(kb["requirements"]) >= 1
