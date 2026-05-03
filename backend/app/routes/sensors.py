import logging
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import PyMongoError
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.sensor import SensorReading
from app.services.data_service import process_reading
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", status_code=201)
async def ingest_reading(
    reading: SensorReading,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        result = await process_reading(db, reading)
    except PyMongoError as exc:
        logger.error("DB unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return result


@router.get("/")
def list_readings():
    return {"readings": []}
