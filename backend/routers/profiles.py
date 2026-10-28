from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import ProfileIn
from security import current_user

router = APIRouter(tags=["profiles"])

PROFILE_FIELDS = (
    "bio", "bio_en", "website", "phone", "city", "company_name", "region",
    "logistics_service", "certifications", "awards", "fairs", "billing",
)


def _public_profile(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "name": u.get("name", ""),
        "role": u.get("role", ""),
        "company_name": u.get("company_name") or u.get("name", ""),
        "region": u.get("region", ""),
        "bio": u.get("bio"),
        "bio_en": u.get("bio_en"),
        "website": u.get("website"),
        "phone": u.get("phone"),
        "city": u.get("city"),
        "logistics_service": u.get("logistics_service"),
        "certifications": u.get("certifications") or [],
        "awards": u.get("awards") or [],
        "fairs": u.get("fairs") or [],
        "billing": u.get("billing") or {},
        "verification_status": u.get("verification_status"),
        "verified_badge": u.get("verification_status") == "approved",
        "verified_at": u["verified_at"].isoformat() if hasattr(u.get("verified_at"), "isoformat") else None,
    }


@router.get("/profiles/me")
async def get_my_profile(user: dict = Depends(current_user)):
    return _public_profile(user)


@router.put("/profiles/me")
async def update_my_profile(body: ProfileIn, user: dict = Depends(current_user)):
    update: dict = {}
    data = body.model_dump(exclude_none=True)
    for f in PROFILE_FIELDS:
        if f in data:
            if f in ("certifications", "awards", "fairs"):
                update[f] = [i for i in data[f]]
            else:
                update[f] = data[f]
    if update:
        await db.users.update_one({"_id": user["_id"]}, {"$set": update})
    fresh = await db.users.find_one({"_id": user["_id"]})
    return _public_profile(fresh)


@router.get("/producers")
async def list_producers(user: dict = Depends(current_user)):
    docs = await db.users.find({"role": "producer"}).sort("company_name", 1).to_list(300)
    out = []
    for d in docs:
        count = await db.products.count_documents(
            {"producer_id": str(d["_id"]), "status": "approved", "deleted_at": None}
        )
        if count == 0:
            continue
        out.append({
            "id": str(d["_id"]),
            "company_name": d.get("company_name") or d.get("name", ""),
            "region": d.get("region", ""),
            "city": d.get("city"),
            "bio": d.get("bio"),
            "bio_en": d.get("bio_en"),
            "product_count": count,
            "certifications": d.get("certifications") or [],
            "verified_badge": d.get("verification_status") == "approved",
        })
    return out


@router.get("/producers/{producer_id}")
async def get_producer(producer_id: str):
    """Public producer page (no login): shows the "Verificato da 'Ra mia" badge."""
    doc = await db.users.find_one({"_id": producer_id, "role": "producer"})
    if not doc:
        raise HTTPException(status_code=404, detail="Produttore non trovato")
    prod_docs = await db.products.find(
        {"producer_id": producer_id, "status": "approved", "deleted_at": None}
    ).sort("created_at", -1).to_list(200)
    products = []
    for p in prod_docs:
        products.append({
            "id": str(p["_id"]),
            "name": p.get("name"),
            "name_en": p.get("name_en"),
            "price": p.get("price"),
            "unit": p.get("unit"),
            "image_url": p.get("image_url"),
            "category": p.get("category"),
            "company_name": p.get("company_name"),
            "featured": bool(p.get("featured_until")),
        })
    profile = _public_profile(doc)
    profile["products"] = products
    return profile
