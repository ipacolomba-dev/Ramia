import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import client, db
from routers import admin, auth, b2b, logistics, market, uploads
from seed import seed
from storage import init_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.command("ping")
    await db.users.create_index("email", unique=True)
    try:
        init_storage()
    except Exception as exc:
        logger.warning("Storage init rimandato: %s", exc)
    await seed()
    yield
    client.close()


app = FastAPI(title="Sapori di Sicilia API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router_prefix = "/api"
app.include_router(auth.router, prefix=api_router_prefix)
app.include_router(market.router, prefix=api_router_prefix)
app.include_router(b2b.router, prefix=api_router_prefix)
app.include_router(logistics.router, prefix=api_router_prefix)
app.include_router(admin.router, prefix=api_router_prefix)
app.include_router(uploads.router, prefix=api_router_prefix)


@app.get("/api")
async def root():
    return {"message": "Sapori di Sicilia API", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "ok", "db": "connected"}
