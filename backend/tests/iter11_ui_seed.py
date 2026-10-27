# Seed for iteration 11 UI retest: TEST_ shipment with a quote + unapproved TEST_ business user
import os
import sys
import uuid
from datetime import datetime, timezone

import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")
from security import hash_password  # noqa: E402

API = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/") + "/api"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(e, p="Demo1234!"):
    return {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"email": e, "password": p}).json()["access_token"]}


if sys.argv[1:] == ["clean"]:
    print(db.shipping_requests.delete_many({"title": {"$regex": "^TEST_UI"}}).deleted_count,
          db.users.delete_many({"email": "test_ui_pending_biz@example.com"}).deleted_count)
    sys.exit()

p, l = login("produttore@demo.it"), login("logistica@demo.it")
sid = requests.post(f"{API}/logistics/requests", headers=p, json={"title": "TEST_UI ship", "cargo_type": "dry",
                    "origin": "Catania", "destination": "Torino"}).json()["id"]
d = requests.post(f"{API}/logistics/requests/{sid}/quotes", headers=l, json={"price": 410, "transit_days": 2}).json()
db.users.delete_many({"email": "test_ui_pending_biz@example.com"})
db.users.insert_one({"_id": str(uuid.uuid4()), "email": "test_ui_pending_biz@example.com", "password_hash": hash_password("Demo1234!"),
                     "name": "TEST_UI Biz", "role": "business", "locale": "it", "company_name": "TEST_UI Biz",
                     "approved": False, "email_verified": True, "created_at": datetime.now(timezone.utc)})
print(sid, d["quotes"][0]["id"])
