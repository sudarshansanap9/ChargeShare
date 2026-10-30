
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # Register SQLAlchemy models
from app.api.routes.auth import router as auth_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.api.routes.chargers import router as chargers_router
from app.api.routes.bookings import router as bookings_router
from app.api.routes.charging_sessions import (
    router as charging_sessions_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Local development convenience only.
    # Use Alembic migrations for production deployments.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "ChargeShare portfolio API. "
        "Charging and payments are simulated."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(chargers_router)
app.include_router(bookings_router)
app.include_router(charging_sessions_router)



@app.get("/", tags=["system"])
def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
        "mode": "portfolio-demo",
        "payments": "simulated",
        "charging": "simulated",
    }


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}
