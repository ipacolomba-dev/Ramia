import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://sicilia-commerce.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_PASS = "Demo1234!"
ADMIN_PASS = "SaporiAdmin2026!"

DEMO_USERS = {
    "admin": ("admin@saporidisicilia.it", ADMIN_PASS),
    "producer": ("produttore@demo.it", DEMO_PASS),
    "producer2": ("frantoi@demo.it", DEMO_PASS),
    "business": ("business@demo.it", DEMO_PASS),
    "collaborator": ("consulente@demo.it", DEMO_PASS),
    "logistics": ("logistica@demo.it", DEMO_PASS),
    "consumer": ("consumatore@demo.it", DEMO_PASS),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def api():
    return API


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for role, (email, pwd) in DEMO_USERS.items():
        data = _login(email, pwd)
        out[role] = {"token": data["access_token"], "user": data["user"]}
    return out


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def auth():
    return _auth
