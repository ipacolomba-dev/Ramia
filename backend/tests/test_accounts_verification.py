"""Auth extras, onboarding and company verification workflow."""
import os
import uuid

import pyotp
import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = ("admin@saporidisicilia.it", "SaporiAdmin2026!")


def _env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


mdb = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)["access_token"]


@pytest.fixture(scope="module")
def carrier():
    email = f"test_carrier_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Password123!", "name": "TEST Carrier", "role": "logistics", "locale": "it",
        "company_name": "TEST Trasporti", "consents": {"terms": True, "privacy": True, "marketing": False}})
    assert r.status_code == 200, r.text
    d = r.json()
    yield {"email": email, "token": d["access_token"], "id": d["user"]["id"], "user": d["user"]}
    uid = d["user"]["id"]
    for c in ("verification_documents", "verification_events", "notifications", "auth_tokens", "refresh_tokens"):
        mdb[c].delete_many({"$or": [{"owner_id": uid}, {"company_id": uid}, {"user_id": uid}]})
    mdb.onboarding_drafts.delete_one({"_id": uid})
    mdb.users.delete_one({"_id": uid})


def test_new_professional_starts_draft_and_unverified(carrier):
    assert carrier["user"]["verification_status"] == "draft"
    assert carrier["user"]["approved"] is False and carrier["user"]["email_verified"] is False
    assert mdb.auth_tokens.count_documents({"user_id": carrier["id"], "purpose": "verify_email"}) >= 1




def test_verify_email_with_token(carrier):
    import hashlib, hmac
    raw = "t" * 40
    secret = _env("JWT_SECRET")
    mdb.auth_tokens.insert_one({"_id": str(uuid.uuid4()), "token_hash": hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest(),
                                "user_id": carrier["id"], "purpose": "verify_email",
                                "expires_at": __import__("datetime").datetime.utcnow() + __import__("datetime").timedelta(hours=1), "used_at": None})
    assert requests.post(f"{API}/auth/verify-email", json={"token": raw}).status_code == 200
    assert requests.post(f"{API}/auth/verify-email", json={"token": raw}).status_code == 400
    assert mdb.users.find_one({"_id": carrier["id"]})["email_verified"] is True


def test_reset_request_does_not_enumerate():
    a = requests.post(f"{API}/auth/request-password-reset", json={"email": "nobody_xyz@example.com"})
    assert a.status_code == 202


def test_onboarding_draft_resume_and_validation(carrier):
    t = carrier["token"]
    ob = requests.get(f"{API}/onboarding", headers=H(t)).json()
    assert ob["role"] == "logistics" and len(ob["steps"]) >= 2
    r = requests.put(f"{API}/onboarding/draft", headers=H(t), json={"step": 1, "data": {"legal_name": "TEST Trasporti Srl", "vat_id": "123"}})
    assert r.status_code == 200
    ob = requests.get(f"{API}/onboarding", headers=H(t)).json()
    assert ob["step"] == 1 and ob["data"]["legal_name"] == "TEST Trasporti Srl"
    bad = requests.post(f"{API}/onboarding/submit", headers=H(t))
    assert bad.status_code == 422 and "11 cifre" in bad.json()["detail"]


def test_checklist_conditional_and_upload_rules(carrier):
    t = carrier["token"]
    data = {"legal_name": "TEST Trasporti Srl", "vat_id": "01234567890", "country": "Italia", "routes": "Sicilia-Lombardia",
            "cargo_types": ["pallet"], "temperature_controlled": True, "fleet": "3 frigo", "insurance": "Generali 1M"}
    requests.put(f"{API}/onboarding/draft", headers=H(t), json={"step": 1, "data": data})
    items = requests.get(f"{API}/verification/checklist", headers=H(t)).json()["items"]
    keys = [i["key"] for i in items]
    assert "atp" in keys and all(i["status"] == "missing" for i in items)
    assert requests.post(f"{API}/verification/documents", headers=H(t), files={"file": ("x.exe", b"MZ")}, data={"req_key": "goods_rc"}).status_code == 422
    assert requests.post(f"{API}/verification/documents", headers=H(t), files={"file": ("p.pdf", b"%PDF-1.4")}, data={"req_key": "goods_rc"}).status_code == 422  # expiry required
    for k in ("transport_license", "atp", "goods_rc"):
        r = requests.post(f"{API}/verification/documents", headers=H(t), files={"file": ("p.pdf", b"%PDF-1.4 test")}, data={"req_key": k, "expiry_date": "2030-01-01"})
        assert r.status_code == 200, r.text
    sub = requests.post(f"{API}/onboarding/submit", headers=H(t))
    assert sub.status_code == 200 and sub.json()["status"] == "pending"
    items = requests.get(f"{API}/verification/checklist", headers=H(t)).json()["items"]
    assert all(i["status"] == "in_review" for i in items)


def test_b2b_blocked_until_approved_then_admin_flow(carrier, admin):
    t = carrier["token"]
    queue = requests.get(f"{API}/admin/verification/queue", headers=H(admin)).json()
    assert any(q["id"] == carrier["id"] for q in queue)
    # cannot approve while docs not approved
    assert requests.patch(f"{API}/admin/verification/companies/{carrier['id']}", headers=H(admin), json={"status": "approved"}).status_code == 422
    detail = requests.get(f"{API}/admin/verification/companies/{carrier['id']}", headers=H(admin)).json()
    docs = [c["document"] for c in detail["checklist"] if c["document"]]
    assert requests.patch(f"{API}/admin/verification/documents/{docs[0]['_id']}", headers=H(admin), json={"action": "reject"}).status_code == 422
    for d in docs:
        assert requests.get(f"{API}/verification/documents/{d['_id']}/file", headers=H(admin)).status_code == 200
        assert requests.patch(f"{API}/admin/verification/documents/{d['_id']}", headers=H(admin), json={"action": "approve"}).status_code == 200
    ok = requests.patch(f"{API}/admin/verification/companies/{carrier['id']}", headers=H(admin), json={"status": "approved"})
    assert ok.status_code == 200
    u = mdb.users.find_one({"_id": carrier["id"]})
    assert u["approved"] is True and u["verified_by"] == ADMIN[0]
    events = requests.get(f"{API}/admin/verification/companies/{carrier['id']}", headers=H(admin)).json()["events"]
    assert events[0]["status"] == "approved" and events[0]["actor_email"] == ADMIN[0]
    csv = requests.get(f"{API}/admin/compliance-log.csv", headers=H(admin))
    assert csv.status_code == 200 and "TEST Trasporti Srl" in csv.text
    # suspension needs a reason
    assert requests.patch(f"{API}/admin/verification/companies/{carrier['id']}", headers=H(admin), json={"status": "suspended"}).status_code == 422


def test_expiry_reminders(carrier, admin):
    from datetime import date, timedelta
    d = mdb.verification_documents.find_one({"owner_id": carrier["id"], "deleted_at": None})
    mdb.verification_documents.update_one({"_id": d["_id"]}, {"$set": {"expiry_date": (date.today() + timedelta(days=14)).isoformat(), "reminders_sent": []}})
    assert requests.post(f"{API}/admin/verification/run-expiry", headers=H(admin)).status_code == 200
    d2 = mdb.verification_documents.find_one({"_id": d["_id"]})
    assert 15 in d2["reminders_sent"]
    mdb.verification_documents.update_one({"_id": d["_id"]}, {"$set": {"expiry_date": (date.today() - timedelta(days=1)).isoformat()}})
    requests.post(f"{API}/admin/verification/run-expiry", headers=H(admin))
    assert mdb.verification_documents.find_one({"_id": d["_id"]})["status"] == "expired"
    notes = requests.get(f"{API}/notifications", headers=H(carrier["token"])).json()
    assert any("scad" in n["title"].lower() for n in notes)


def test_totp_2fa_for_admin_flow():
    email = f"test_buyer_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "name": "TEST Buyer", "role": "business",
                                                     "locale": "it", "company_name": "TEST Buyer", "consents": {"terms": True, "privacy": True}})
    uid = r.json()["user"]["id"]
    tok = r.json()["access_token"]
    try:
        setup = requests.post(f"{API}/auth/2fa/setup", headers=H(tok)).json()
        totp = pyotp.TOTP(setup["secret"])
        assert requests.post(f"{API}/auth/2fa/confirm", headers=H(tok), json={"code": "000000"}).status_code == 400
        assert requests.post(f"{API}/auth/2fa/confirm", headers=H(tok), json={"code": totp.now()}).status_code == 200
        step1 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Password123!"}).json()
        assert step1.get("two_factor_required") and "access_token" not in step1
        bad = requests.post(f"{API}/auth/2fa/login", json={"challenge": step1["challenge"], "code": "000000"})
        assert bad.status_code == 401
        step1 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Password123!"}).json()
        ok = requests.post(f"{API}/auth/2fa/login", json={"challenge": step1["challenge"], "code": totp.now()})
        assert ok.status_code == 200 and ok.json()["access_token"] and ok.json()["refresh_token"]
        # consumers cannot enable 2FA
        c = login("consumatore@demo.it", "Demo1234!")["access_token"]
        assert requests.post(f"{API}/auth/2fa/setup", headers=H(c)).status_code == 403
    finally:
        for col in ("auth_tokens", "refresh_tokens"):
            mdb[col].delete_many({"user_id": uid})
        mdb.users.delete_one({"_id": uid})


def test_public_profile_badge():
    prods = requests.get(f"{API}/producers", headers=H(login("consumatore@demo.it", "Demo1234!")["access_token"])).json()
    assert any(p.get("verified_badge") for p in prods)
