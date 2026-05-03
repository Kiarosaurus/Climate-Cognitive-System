import logging
from fastapi import FastAPI
from app.routes import sensors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

app = FastAPI(
    title="Climate Cognitive System API",
    version="1.0.0",
    description="IoT Cognitive backend for climate sensor data ingestion and analysis.",
)

app.include_router(sensors.router, prefix="/api/v1/sensors", tags=["sensors"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
