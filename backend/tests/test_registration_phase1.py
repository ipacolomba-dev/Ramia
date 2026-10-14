"""
Phase 1 — Registration overhaul backend tests.

Covers:
- Backward compat login (admin, producer) + /auth/me email_verified default True for legacy
- Consents validation (missing / terms=False / privacy=False => 422)
- Consumer register (soft verification, marketing optional)
- Producer register with full nested profile (ProducerProfileIn)
- Business register => approved=False, producer/consumer => approved=True
- Marketing consent independent (true/false)
- Server-side profile validation (invalid types/length => 422, not 500)
- Duplicate email => 409
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://sicilia-commerce.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@saporidisicilia.it", "SaporiAdmin2026!")
LEGACY_PRODUCER = ("produttore@demo.it", "Demo1234!")


# ---------- helpers ---------- #

def _rand_email(tag: str = "test") -> str:
    return f"TEST_{tag}_{uuid.uuid4().hex[:10]}@demo.it"


def _consents(terms=True, privacy=True, marketing=False):
    return {"terms": terms, "privacy": privacy, "marketing": marketing}


def _base_payload(email: str, role: str, name: str = "Mario Test"):
    return {
        "email": email,
        "password": "Str0ngPass!",
        "name": name,
        "role": role,
        "locale": "it",
    }


def _login(email: str, password: str):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)


def _me(token: str):
    return requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)


# ============================================================================
# Backward compatibility
# ============================================================================

class TestLegacyAccounts:
    """Existing demo users must keep working; email_verified defaults to True for legacy accounts."""

    def test_admin_login_and_me_email_verified_true(self):
        r = _login(*ADMIN)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == ADMIN[0]
        me = _me(data["access_token"])
        assert me.status_code == 200, me.text
        body = me.json()
        # Legacy accounts predate verification -> True
        assert body.get("email_verified") is True, f"Expected legacy admin email_verified=True, got {body.get('email_verified')}"

    def test_legacy_producer_login_and_me(self):
        r = _login(*LEGACY_PRODUCER)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "producer"
        me = _me(data["access_token"])
        assert me.status_code == 200
        body = me.json()
        assert body.get("email_verified") is True, "Legacy producer must default email_verified=True"


# ============================================================================
# Consents validation
# ============================================================================

class TestConsentsValidation:
    def test_missing_consents_returns_422(self):
        payload = _base_payload(_rand_email("noconsent"), "consumer")
        # no consents key
        r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r.status_code == 422, f"Expected 422 missing consents, got {r.status_code}: {r.text}"

    def test_terms_false_returns_422(self):
        payload = _base_payload(_rand_email("terms0"), "consumer")
        payload["consents"] = _consents(terms=False, privacy=True)
        r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r.status_code == 422, r.text

    def test_privacy_false_returns_422(self):
        payload = _base_payload(_rand_email("priv0"), "consumer")
        payload["consents"] = _consents(terms=True, privacy=False)
        r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r.status_code == 422, r.text


# ============================================================================
# Consumer registration (simple role)
# ============================================================================

class TestConsumerRegistration:
    def test_register_consumer_success_then_login(self):
        email = _rand_email("consumer")
        payload = _base_payload(email, "consumer", name="Giulia Consumer")
        payload["consents"] = _consents(terms=True, privacy=True, marketing=False)

        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        user = data["user"]
        assert user["email"] == email.lower()
        assert user["role"] == "consumer"
        assert user["approved"] is True
        assert user["email_verified"] is False, "Newly registered users must have email_verified=False"
        assert user["marketing_consent"] is False

        # Login works with new credentials
        r2 = _login(email, "Str0ngPass!")
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["email"] == email.lower()

    def test_marketing_true_sets_consent_true(self):
        email = _rand_email("mkt1")
        payload = _base_payload(email, "consumer")
        payload["consents"] = _consents(marketing=True)
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["marketing_consent"] is True

    def test_marketing_false_sets_consent_false(self):
        email = _rand_email("mkt0")
        payload = _base_payload(email, "consumer")
        payload["consents"] = _consents(marketing=False)
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["marketing_consent"] is False


# ============================================================================
# Producer registration (7-step wizard: nested profile)
# ============================================================================

def _full_producer_profile():
    return {
        "company": {
            "legal_name": "Azienda Agricola Rossi SRL",
            "legal_form": "SRL",
            "brand_name": "Rossi Oli",
            "country_incorp": "Italia",
            "vat_id": "IT12345678901",
            "tax_code": "RSSMRA80A01H501U",
            "registry_no": "MI-123456",
            "website": "https://rossi-oli.example.it",
            "email": "info@rossi-oli.example.it",
            "phone": "+39 02 1234567",
        },
        "legal_address": {
            "street": "Via Roma 1",
            "zip": "20121",
            "city": "Milano",
            "region": "Lombardia",
            "country": "Italia",
        },
        "production_same_as_legal": True,
        "contact": {
            "first_name": "Mario",
            "last_name": "Rossi",
            "role_title": "Titolare",
            "email": "mario@rossi-oli.example.it",
            "phone": "+39 333 1234567",
        },
        "billing": {
            "same_as_legal": True,
            "sdi_code": "ABC1234",
            "pec": "rossi@pec.it",
        },
        "commercial": {
            "product_categories": ["olio"],
            "activity": "produttore",
        },
        "certifications": ["BIO", "DOP"],
        "documents_note": "I documenti verranno caricati dopo l'approvazione.",
    }


class TestProducerRegistration:
    def test_register_producer_full_profile_success(self):
        email = _rand_email("producer")
        payload = _base_payload(email, "producer", name="Mario Rossi")
        payload["consents"] = _consents(marketing=False)
        payload["profile"] = _full_producer_profile()

        r = requests.post(f"{API}/auth/register", json=payload, timeout=25)
        assert r.status_code == 200, r.text
        data = r.json()
        user = data["user"]

        assert user["role"] == "producer"
        assert user["approved"] is True, "Producer must be auto-approved"
        assert user["email_verified"] is False
        # derived company_name: brand_name wins, else legal_name
        assert user["company_name"] == "Rossi Oli", f"Expected derived company_name=Rossi Oli, got {user['company_name']}"
        # certifications persisted
        assert user.get("certifications") == ["BIO", "DOP"], f"Got {user.get('certifications')}"

        # Login works
        r2 = _login(email, "Str0ngPass!")
        assert r2.status_code == 200, r2.text

    def test_producer_company_name_falls_back_to_legal_name(self):
        """When brand_name is missing, company_name = legal_name."""
        email = _rand_email("prod_nobrand")
        payload = _base_payload(email, "producer")
        payload["consents"] = _consents()
        prof = _full_producer_profile()
        prof["company"].pop("brand_name", None)
        payload["profile"] = prof

        r = requests.post(f"{API}/auth/register", json=payload, timeout=25)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["company_name"] == "Azienda Agricola Rossi SRL"

    def test_producer_invalid_profile_returns_422_not_500(self):
        """vat_id > 60 chars should trigger Pydantic validation (422)."""
        email = _rand_email("prod_bad")
        payload = _base_payload(email, "producer")
        payload["consents"] = _consents()
        prof = _full_producer_profile()
        prof["company"]["vat_id"] = "X" * 200  # exceeds max_length=60
        payload["profile"] = prof

        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 422, f"Expected 422 for invalid vat_id, got {r.status_code}: {r.text}"
        assert r.status_code != 500

    def test_producer_invalid_profile_wrong_type_returns_422(self):
        """commercial.product_categories must be list[str]; sending a string must 422, not 500."""
        email = _rand_email("prod_badtype")
        payload = _base_payload(email, "producer")
        payload["consents"] = _consents()
        prof = _full_producer_profile()
        prof["commercial"]["product_categories"] = "olio"  # should be list
        payload["profile"] = prof

        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 422, f"Expected 422 for wrong type, got {r.status_code}: {r.text}"


# ============================================================================
# Role approval behavior
# ============================================================================

class TestRoleApproval:
    def test_business_role_not_auto_approved(self):
        email = _rand_email("business")
        payload = _base_payload(email, "business", name="Business Test")
        payload["consents"] = _consents()
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["role"] == "business"
        assert user["approved"] is False, "business role must await admin approval"
        assert user["email_verified"] is False

    def test_logistics_role_not_auto_approved(self):
        email = _rand_email("logistics")
        payload = _base_payload(email, "logistics", name="Logistics Test")
        payload["consents"] = _consents()
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["approved"] is False

    def test_collaborator_role_not_auto_approved(self):
        email = _rand_email("collab")
        payload = _base_payload(email, "collaborator", name="Collab Test")
        payload["consents"] = _consents()
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["approved"] is False


# ============================================================================
# Duplicate email
# ============================================================================

class TestDuplicateEmail:
    def test_duplicate_email_returns_409(self):
        email = _rand_email("dup")
        payload = _base_payload(email, "consumer")
        payload["consents"] = _consents()
        r1 = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r1.status_code == 200, r1.text

        # Same email again
        r2 = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r2.status_code == 409, f"Expected 409 duplicate, got {r2.status_code}: {r2.text}"

    def test_duplicate_against_legacy_email_returns_409(self):
        payload = _base_payload(LEGACY_PRODUCER[0], "consumer")
        payload["consents"] = _consents()
        r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-o", "addopts="])
