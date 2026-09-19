from fastapi import APIRouter, Depends, HTTPException

from db import db
from security import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def stats(user: dict = Depends(require_roles("admin"))):
    return {
        "users": await db.users.count_documents({}),
        "producers": await db.users.count_documents({"role": "producer"}),
        "products": await db.products.count_documents({"deleted_at": None}),
        "pending_products": await db.products.count_documents({"status": "pending", "deleted_at": None}),
        "orders": await db.orders.count_documents({}),
        "b2b_agreements": await db.agreements.count_documents({}),
        "shipping_requests": await db.shipping_requests.count_documents({}),
        "label_requests": await db.label_requests.count_documents({}),
    }


@router.get("/pending-products")
async def pending_products(user: dict = Depends(require_roles("admin"))):
    docs = await db.products.find({"status": "pending", "deleted_at": None}).sort("created_at", -1).to_list(200)
    return [{**{k: v for k, v in d.items() if k != "_id"}, "id": d["_id"]} for d in docs]


@router.patch("/products/{product_id}/review")
async def review_product(product_id: str, body: dict, user: dict = Depends(require_roles("admin"))):
    status = (body or {}).get("status")
    if status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="Stato non valido")
    res = await db.products.update_one({"_id": product_id}, {"$set": {"status": status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    return {"ok": True}
