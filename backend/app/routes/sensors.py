import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import PyMongoError
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from app.models.sensor import SensorReading
from app.models.admin import SensorDevice, Reservation, User
from app.services.data_service import process_reading
from app.database import get_db
from app.database_sql import get_db_sql
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", status_code=201)
async def ingest_reading(
    reading: SensorReading,
    db: AsyncIOMotorDatabase = Depends(get_db),
    db_sql: Session = Depends(get_db_sql),
):
    try:
        result = await process_reading(db, reading, db_sql=db_sql)
    except PyMongoError as exc:
        logger.error("MongoDB unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return result


@router.get("/")
async def list_readings(
    room_id: Optional[int] = None,
    sensor_id: Optional[str] = None,
    limit: int = Query(40, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    db_sql: Session = Depends(get_db_sql),
):
    mongo_filter: dict = {}

    if room_id is not None:
        ids = await run_in_threadpool(
            lambda: [d.id for d in db_sql.query(SensorDevice).filter(SensorDevice.room_id == room_id).all()]
        )
        if not ids:
            return []
        mongo_filter["sensor_id"] = {"$in": ids}
    elif sensor_id is not None:
        mongo_filter["sensor_id"] = sensor_id

    cursor = db["sensor_readings"].find(mongo_filter).sort("timestamp", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return docs


# ── Sensor control ────────────────────────────────────────────────────────────

class SensorControlIn(BaseModel):
    is_active: bool
    control_enabled: bool


@router.put("/{sensor_id}/control")
def control_sensor(
    sensor_id: str,
    payload: SensorControlIn,
    db_sql: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    # guests never allowed
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot control sensors.")

    device = db_sql.query(SensorDevice).filter(SensorDevice.id == sensor_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not registered.")

    # collaborators need an active reservation on this room
    if current_user.role == "collaborator":
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        active = db_sql.query(Reservation).filter(
            Reservation.user_id == current_user.id,
            Reservation.room_id == device.room_id,
            Reservation.start_time <= now,
            Reservation.end_time >= now,
        ).first()
        if not active:
            raise HTTPException(
                status_code=403,
                detail="No active reservation for this room. Control denied.",
            )

    device.is_active = payload.is_active
    device.control_enabled = payload.control_enabled
    try:
        db_sql.commit()
        db_sql.refresh(device)
    except SQLAlchemyError as exc:
        db_sql.rollback()
        logger.error("DB error on sensor control: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    logger.info(
        "Sensor '%s' updated by '%s' (role=%s): is_active=%s control_enabled=%s",
        sensor_id, current_user.username, current_user.role,
        device.is_active, device.control_enabled,
    )
    return {
        "sensor_id": device.id,
        "room_id": device.room_id,
        "is_active": device.is_active,
        "control_enabled": device.control_enabled,
    }
