"""Real card payments (Stripe Checkout) with escrow and split payouts.

Flow: the buyer pays the platform -> funds are HELD (escrow ledger) -> released on proof of delivery
(buyer confirmation, carrier POD, or automatic release after N days from DB settings) -> split:
producer/carrier net amounts become payouts, the platform keeps the fees frozen in the snapshot.
Payouts are transferred via Stripe Connect when the beneficiary has a connected account; otherwise
they stay "pending_connect" until the account is connected.
"""
import asyncio
import logging
import os
import uuid
from datetime import timedelta
from typing import Literal, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest, StripeCheckout

from db import db
from models import now_utc
from core.audit import audit
from core.matches import register_match
from security import current_user, require_roles

logger = logging.getLogger(__name__)
router = APIRouter(tags=["payments"])

STRIPE_KEY = os.environ.get("STRIPE_API_KEY", "")
DEFAULT_SETTINGS = {"auto_release_days": 7, "currency": "eur"}


def _stripe(request: Request) -> StripeCheckout:
    if not STRIPE_KEY:
        raise HTTPException(status_code=503, detail="Pagamenti non configurati: manca la chiave Stripe")
    return StripeCheckout(api_key=STRIPE_KEY, webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe")


async def get_settings() -> dict:
    doc = await db.payment_settings.find_one({"_id": "default"})
    if not doc:
        await db.payment_settings.update_one({"_id": "default"}, {"$setOnInsert": DEFAULT_SETTINGS}, upsert=True)
        doc = await db.payment_settings.find_one({"_id": "default"})
    return doc


def _iso(d: dict) -> dict:
    out = dict(d)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    for k, v in list(out.items()):
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif isinstance(v, dict):
            out[k] = {kk: (vv.isoformat() if hasattr(vv, "isoformat") else vv) for kk, vv in v.items()}
    return out


# ----------------------------- Checkout -----------------------------

class CheckoutIn(BaseModel):
    kind: Literal["order", "shipment", "visibility"]
    ref_id: str
    origin_url: str = Field(min_length=8, max_length=300)


async def _amount_for(body: CheckoutIn, user: dict) -> tuple[float, str]:
    uid = str(user["_id"])
    if body.kind == "order":
        o = await db.orders.find_one({"_id": body.ref_id, "user_id": uid})
        if not o:
            raise HTTPException(status_code=404, detail="Ordine non trovato")
        if o.get("status") != "awaiting_payment":
            raise HTTPException(status_code=422, detail="Ordine già pagato o annullato")
        return float(o["total"]), f"Ordine #{o['_id'][:8]}"
    if body.kind == "shipment":
        s = await db.shipping_requests.find_one({"_id": body.ref_id, "creator_id": uid})
        if not s or not s.get("carrier_id"):
            raise HTTPException(status_code=404, detail="Spedizione senza trasportatore scelto")
        if (s.get("escrow") or {}).get("status"):
            raise HTTPException(status_code=422, detail="Trasporto già pagato")
        quote = next((q for q in s.get("quotes", []) if q.get("id") == s.get("selected_quote_id")), None)
        snap = s.get("commercial_snapshot") or {}
        return round(float(quote["price"]) + float(snap.get("producer_fee") or 0), 2), f"Trasporto {s.get('title', '')}"
    if user["role"] != "producer":
        raise HTTPException(status_code=403, detail="Solo produttori")
    from routers.governance import visibility_plans
    plan = next((p for p in await visibility_plans() if p["id"] == body.ref_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Piano non trovato")
    return float(plan["price"]), f"Visibilità {plan['name']}"


@router.post("/payments/checkout")
async def create_checkout(body: CheckoutIn, request: Request, user: dict = Depends(current_user)):
    amount, label = await _amount_for(body, user)  # amount is ALWAYS computed server-side
    if amount <= 0:
        raise HTTPException(status_code=422, detail="Importo non valido")
    sc = _stripe(request)
    origin = body.origin_url.rstrip("/")
    settings = await get_settings()
    req = CheckoutSessionRequest(
        amount=amount, currency=settings.get("currency", "eur"),
        success_url=f"{origin}/pagamento?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/pagamento?cancelled=1&kind={body.kind}",
        metadata={"kind": body.kind, "ref_id": body.ref_id, "user_id": str(user["_id"]), "label": label},
    )
    session = await sc.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "_id": str(uuid.uuid4()), "session_id": session.session_id, "kind": body.kind, "ref_id": body.ref_id,
        "user_id": str(user["_id"]), "user_email": user.get("email"), "amount": amount,
        "currency": settings.get("currency", "eur"), "label": label, "status": "initiated",
        "payment_status": "pending", "processed": False, "created_at": now_utc(),
    })
    return {"url": session.url, "session_id": session.session_id}


async def _fulfill(tx: dict):
    """Runs exactly once per paid transaction (atomic processed flag)."""
    res = await db.payment_transactions.update_one({"_id": tx["_id"], "processed": False},
                                                   {"$set": {"processed": True, "processed_at": now_utc()}})
    if res.modified_count == 0:
        return
    settings = await get_settings()
    held = {"status": "held", "amount": tx["amount"], "held_at": now_utc(), "session_id": tx["session_id"],
            "auto_release_at": now_utc() + timedelta(days=int(settings.get("auto_release_days", 7)))}
    if tx["kind"] == "order":
        res = await db.orders.update_one({"_id": tx["ref_id"], "status": "awaiting_payment"},
                                         {"$set": {"status": "paid", "payment": "stripe", "escrow": held}})
        if res.modified_count == 0:
            # paid after the order was cancelled/expired: keep the money blocked and flag it for refund
            await db.orders.update_one({"_id": tx["ref_id"], "escrow": {"$exists": False}}, {"$set": {
                "escrow": {**held, "status": "disputed"}, "status": "disputed",
                "dispute": {"reason": "Pagamento ricevuto dopo l'annullamento: da rimborsare", "opened_at": now_utc(), "opened_by": "system"}}})
            return
        o = await db.orders.find_one({"_id": tx["ref_id"]})
        for pid in {i.get("producer_id") for i in (o or {}).get("items", []) if i.get("producer_id")}:
            await register_match(pid, o["user_id"], "order", o["_id"])
    elif tx["kind"] == "shipment":
        held.pop("auto_release_at")  # transport funds are released only on proof of delivery
        await db.shipping_requests.update_one({"_id": tx["ref_id"]}, {"$set": {"escrow": held}})
        s = await db.shipping_requests.find_one({"_id": tx["ref_id"]}, {"pod": 1})
        if (s or {}).get("pod"):  # delivered before payment: release right away
            await release_shipment(tx["ref_id"], "proof_of_delivery")
    else:
        from routers.market import activate_visibility
        await activate_visibility(tx["user_id"], tx["ref_id"], tx["session_id"])


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request, user: dict = Depends(current_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": str(user["_id"])})
    if not tx:
        raise HTTPException(status_code=404, detail="Pagamento non trovato")
    if tx["payment_status"] != "paid":
        st = await _stripe(request).get_checkout_status(session_id)
        await db.payment_transactions.update_one({"_id": tx["_id"]}, {"$set": {"status": st.status, "payment_status": st.payment_status}})
        tx["status"], tx["payment_status"] = st.status, st.payment_status
        if st.payment_status == "paid":
            await _fulfill(tx)
    return {"status": tx["status"], "payment_status": tx["payment_status"], "kind": tx["kind"],
            "ref_id": tx["ref_id"], "amount": tx["amount"], "label": tx.get("label")}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    try:
        ev = await _stripe(request).handle_webhook(body, request.headers.get("Stripe-Signature"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Webhook non valido: {exc}")
    if ev.session_id and ev.payment_status == "paid":
        tx = await db.payment_transactions.find_one({"session_id": ev.session_id})
        if tx:
            await db.payment_transactions.update_one({"_id": tx["_id"]}, {"$set": {"status": "complete", "payment_status": "paid"}})
            await _fulfill(tx)
    return {"received": True}


# ----------------------------- Escrow release & split -----------------------------

async def _transfer(beneficiary: dict, amount: float, key: str) -> tuple[str, Optional[str]]:
    acct = (beneficiary or {}).get("stripe_account_id")
    if not acct:
        return "pending_connect", None
    try:
        stripe.api_key = STRIPE_KEY
        t = stripe.Transfer.create(amount=int(round(amount * 100)), currency="eur", destination=acct,
                                   idempotency_key=key)
        return "transferred", t.id
    except Exception as exc:  # beneficiary keeps the payout, admin retries after fixing the account
        logger.warning("Transfer fallito %s: %s", key, exc)
        return "failed", None


async def _payout(beneficiary_id: str, role: str, kind: str, source_id: str, gross: float, fee: float):
    if gross <= 0:
        return
    net = round(gross - fee, 2)
    ben = await db.users.find_one({"_id": beneficiary_id})
    status, transfer_id = await _transfer(ben, net, f"payout:{kind}:{source_id}:{beneficiary_id}")
    await db.payouts.insert_one({
        "_id": str(uuid.uuid4()), "beneficiary_id": beneficiary_id, "beneficiary_role": role,
        "beneficiary_name": (ben or {}).get("company_name") or (ben or {}).get("name", ""),
        "source_kind": kind, "source_id": source_id, "gross": round(gross, 2), "fee": round(fee, 2), "net": net,
        "status": status, "stripe_transfer_id": transfer_id, "created_at": now_utc(),
    })


async def release_order(order_id: str, reason: str, from_status: tuple = ("held",)) -> bool:
    res = await db.orders.update_one(
        {"_id": order_id, "escrow.status": {"$in": list(from_status)}},
        {"$set": {"escrow.status": "released", "escrow.released_at": now_utc(), "escrow.release_reason": reason,
                  "status": "completed"}})
    if res.modified_count == 0:
        return False
    o = await db.orders.find_one({"_id": order_id})
    snap = o.get("commercial_snapshot") or {}
    items_total = sum(i["price"] * i["qty"] for i in o["items"]) or 1
    goods = float(o.get("goods_total") or items_total)
    by_prod: dict = {}
    for i in o["items"]:
        by_prod[i.get("producer_id", "")] = by_prod.get(i.get("producer_id", ""), 0.0) + i["price"] * i["qty"]
    for pid, sub in by_prod.items():
        share = goods * sub / items_total
        fee = float(snap.get("producer_fee") or 0) * sub / items_total
        await _payout(pid, "producer", "order", order_id, share, fee)
    return True


async def release_shipment(req_id: str, reason: str, from_status: tuple = ("held",)) -> bool:
    res = await db.shipping_requests.update_one(
        {"_id": req_id, "escrow.status": {"$in": list(from_status)}},
        {"$set": {"escrow.status": "released", "escrow.released_at": now_utc(), "escrow.release_reason": reason}})
    if res.modified_count == 0:
        return False
    s = await db.shipping_requests.find_one({"_id": req_id})
    quote = next((q for q in s.get("quotes", []) if q.get("id") == s.get("selected_quote_id")), {})
    await _payout(s["carrier_id"], "logistics", "shipment", req_id, float(quote.get("price") or 0), 0.0)
    return True


@router.post("/orders/{order_id}/confirm-delivery")
async def confirm_delivery(order_id: str, user: dict = Depends(current_user)):
    o = await db.orders.find_one({"_id": order_id, "user_id": str(user["_id"])})
    if not o:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    if not await release_order(order_id, "buyer_confirmed"):
        raise HTTPException(status_code=422, detail="Nessun pagamento in garanzia da rilasciare")
    await db.orders.update_one({"_id": order_id}, {"$set": {"delivery": {"confirmed_by": "buyer", "at": now_utc()}}})
    return {"ok": True}


class DisputeIn(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


@router.post("/orders/{order_id}/dispute")
async def open_dispute(order_id: str, body: DisputeIn, user: dict = Depends(current_user)):
    res = await db.orders.update_one(
        {"_id": order_id, "user_id": str(user["_id"]), "escrow.status": "held"},
        {"$set": {"escrow.status": "disputed", "status": "disputed",
                  "dispute": {"reason": body.reason, "opened_at": now_utc(), "opened_by": str(user["_id"])}}})
    if res.modified_count == 0:
        raise HTTPException(status_code=422, detail="Contestazione possibile solo con pagamento in garanzia")
    return {"ok": True}


@router.post("/orders/{order_id}/cancel")
async def cancel_unpaid(order_id: str, user: dict = Depends(current_user)):
    o = await db.orders.find_one_and_update({"_id": order_id, "user_id": str(user["_id"]), "status": "awaiting_payment"},
                                            {"$set": {"status": "cancelled", "stock_restored": True}})
    if not o:
        raise HTTPException(status_code=422, detail="Solo ordini non pagati possono essere annullati")
    await _restock(o)
    return {"ok": True}


async def _restock(o: dict):
    for it in o.get("items", []):
        await db.products.update_one({"_id": it["product_id"]}, {"$inc": {"stock": it["qty"]}})


UNPAID_TTL_MINUTES = 60


# ----------------------------- Admin escrow console -----------------------------

@router.get("/admin/escrow")
async def admin_escrow(user: dict = Depends(require_roles("admin"))):
    items = []
    async for o in db.orders.find({"escrow": {"$exists": True}}).sort("created_at", -1).limit(200):
        items.append({"kind": "order", "id": o["_id"], "title": f"Ordine #{o['_id'][:8]} · {o.get('user_name', '')}",
                      "amount": o["escrow"]["amount"], "status": o["escrow"]["status"], "dispute": _iso(o["dispute"]) if o.get("dispute") else None,
                      "auto_release_at": _iso(o["escrow"]).get("auto_release_at"), "held_at": _iso(o["escrow"]).get("held_at")})
    async for s in db.shipping_requests.find({"escrow": {"$exists": True}}).sort("created_at", -1).limit(200):
        items.append({"kind": "shipment", "id": s["_id"], "title": f"Trasporto · {s.get('title', '')}",
                      "amount": s["escrow"]["amount"], "status": s["escrow"]["status"], "dispute": None,
                      "auto_release_at": None, "held_at": _iso(s["escrow"]).get("held_at")})
    totals: dict = {}
    for i in items:
        totals[i["status"]] = round(totals.get(i["status"], 0) + i["amount"], 2)
    payouts = [_iso(p) for p in await db.payouts.find({}).sort("created_at", -1).to_list(200)]
    return {"items": items, "totals": totals, "payouts": payouts, "settings": _iso(await get_settings()),
            "stripe_mode": "test" if STRIPE_KEY.startswith("sk_test") else "live"}


class ResolveIn(BaseModel):
    action: Literal["release", "refund"]
    note: str = Field(min_length=3, max_length=500)


@router.post("/admin/escrow/{kind}/{ref_id}/resolve")
async def resolve(kind: Literal["order", "shipment"], ref_id: str, body: ResolveIn, user: dict = Depends(require_roles("admin"))):
    coll = db.orders if kind == "order" else db.shipping_requests
    before = await coll.find_one({"_id": ref_id})
    if not before or not before.get("escrow"):
        raise HTTPException(status_code=404, detail="Pagamento non trovato")
    if body.action == "release":
        if kind == "order" and before.get("stock_restored"):
            raise HTTPException(status_code=422, detail="Ordine annullato: i fondi vanno rimborsati, non rilasciati")
        fn = release_order if kind == "order" else release_shipment
        if not await fn(ref_id, "admin", ("held", "disputed")):
            raise HTTPException(status_code=422, detail="Pagamento non rilasciabile")
    else:
        refund_status = "manual_required"
        try:
            stripe.api_key = STRIPE_KEY
            sess = stripe.checkout.Session.retrieve(before["escrow"]["session_id"])
            stripe.Refund.create(payment_intent=sess.payment_intent, idempotency_key=f"refund:{ref_id}")
            refund_status = "refunded"
        except Exception as exc:
            logger.warning("Rimborso Stripe non riuscito %s: %s", ref_id, exc)
        res = await coll.update_one({"_id": ref_id, "escrow.status": {"$in": ["held", "disputed", "refund_manual"]}},
                                    {"$set": {"escrow.status": "refunded" if refund_status == "refunded" else "refund_manual",
                                              "escrow.refund_status": refund_status,
                                              "escrow.refunded_at": now_utc(), **({"status": "refunded"} if kind == "order" else {})}})
        if res.modified_count == 0:
            raise HTTPException(status_code=422, detail="Pagamento non rimborsabile")
        if kind == "order" and not before.get("stock_restored"):
            for it in before.get("items", []):
                await db.products.update_one({"_id": it["product_id"]}, {"$inc": {"stock": it["qty"]}})
            await coll.update_one({"_id": ref_id}, {"$set": {"stock_restored": True}})
    after = await coll.find_one({"_id": ref_id})
    await audit(user, f"escrow.{body.action}", kind, ref_id, {"escrow": before.get("escrow")}, {"escrow": after.get("escrow")}, body.note)
    return {"ok": True, "escrow": _iso(after["escrow"])}


class SettingsIn(BaseModel):
    auto_release_days: int = Field(ge=1, le=60)


@router.put("/admin/payment-settings")
async def update_settings(body: SettingsIn, user: dict = Depends(require_roles("admin"))):
    before = await get_settings()
    await db.payment_settings.update_one({"_id": "default"}, {"$set": body.model_dump()})
    after = await get_settings()
    await audit(user, "payment_settings.update", "payment_settings", "default", before, after)
    return _iso(after)


async def auto_release_sweep() -> int:
    # unpaid orders older than the TTL release their reserved stock
    cutoff = now_utc() - timedelta(minutes=UNPAID_TTL_MINUTES)
    async for o in db.orders.find({"status": "awaiting_payment", "created_at": {"$lte": cutoff}}, {"_id": 1}):
        upd = await db.orders.find_one_and_update({"_id": o["_id"], "status": "awaiting_payment"},
                                                  {"$set": {"status": "cancelled", "stock_restored": True, "cancel_reason": "payment_timeout"}})
        if upd:
            await _restock(upd)
    n = 0
    async for o in db.orders.find({"escrow.status": "held", "escrow.auto_release_at": {"$lte": now_utc()}}, {"_id": 1}):
        n += int(await release_order(o["_id"], "auto_release"))
    return n


@router.post("/admin/escrow/run-auto-release")
async def run_auto_release(user: dict = Depends(require_roles("admin"))):
    return {"released": await auto_release_sweep()}


def start_auto_release_job():
    async def loop():
        while True:
            try:
                await auto_release_sweep()
            except Exception as exc:
                logger.warning("Auto-release: %s", exc)
            await asyncio.sleep(600)
    asyncio.get_event_loop().create_task(loop())


# ----------------------------- Payouts & Stripe Connect -----------------------------

@router.get("/payouts/mine")
async def my_payouts(user: dict = Depends(require_roles("producer", "logistics"))):
    uid = str(user["_id"])
    payouts = [_iso(p) for p in await db.payouts.find({"beneficiary_id": uid}).sort("created_at", -1).to_list(300)]
    held = 0.0
    if user["role"] == "producer":
        async for o in db.orders.find({"items.producer_id": uid, "escrow.status": {"$in": ["held", "disputed"]}}):
            items_total = sum(i["price"] * i["qty"] for i in o["items"]) or 1
            mine = sum(i["price"] * i["qty"] for i in o["items"] if i.get("producer_id") == uid)
            held += float(o.get("goods_total") or items_total) * mine / items_total
    else:
        async for s in db.shipping_requests.find({"carrier_id": uid, "escrow.status": "held"}):
            q = next((q for q in s.get("quotes", []) if q.get("id") == s.get("selected_quote_id")), {})
            held += float(q.get("price") or 0)
    sums = {st: round(sum(p["net"] for p in payouts if p["status"] == st), 2) for st in ("transferred", "pending_connect", "failed")}
    return {"held": round(held, 2), **sums, "payouts": payouts,
            "connect": {"connected": bool(user.get("stripe_account_id")), "account_id": user.get("stripe_account_id")}}


class ConnectIn(BaseModel):
    origin_url: str = Field(min_length=8, max_length=300)


@router.post("/payments/connect/onboard")
async def connect_onboard(body: ConnectIn, user: dict = Depends(require_roles("producer", "logistics"))):
    if not STRIPE_KEY or "emergent" in STRIPE_KEY:
        raise HTTPException(status_code=503, detail="Stripe Connect richiede l'account Stripe di 'Ra mia con Connect attivo: "
                                                    "con la chiave di prova i bonifici restano 'in attesa di collegamento'.")
    try:
        stripe.api_key = STRIPE_KEY
        acct_id = user.get("stripe_account_id")
        if not acct_id:
            acct_id = stripe.Account.create(type="express", email=user.get("email"),
                                            capabilities={"transfers": {"requested": True}}).id
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"stripe_account_id": acct_id}})
        origin = body.origin_url.rstrip("/")
        link = stripe.AccountLink.create(account=acct_id, type="account_onboarding",
                                         refresh_url=f"{origin}/pagamento?connect=refresh", return_url=f"{origin}/pagamento?connect=done")
        return {"url": link.url, "account_id": acct_id}
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe Connect: {exc.user_message or str(exc)}")
