import asyncio
import logging
from fastapi import FastAPI
from app.routes import sensors, admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Climate Cognitive System API",
    version="1.0.0",
    description="IoT Cognitive backend for climate sensor data ingestion and analysis.",
)

app.include_router(sensors.router, prefix="/api/v1/sensors", tags=["sensors"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])


@app.on_event("startup")
async def startup_ml():
    from app.services.predictive_service import load_model
    load_model()


@app.on_event("startup")
async def startup_db():
    import app.models.admin  # register ORM models before create_all
    from app.database_sql import engine, Base
    from sqlalchemy import text

    for attempt in range(1, 6):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            logger.info("PostgreSQL ready — tables created/verified.")
            return
        except Exception as exc:
            logger.warning("PostgreSQL not ready (%d/5): %s", attempt, exc)
            if attempt < 5:
                await asyncio.sleep(3)

    logger.error("Could not connect to PostgreSQL after 5 attempts. Continuing without SQL layer.")


@app.get("/health")
def health_check():
    return {"status": "ok"}
