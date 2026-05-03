import logging
from datetime import datetime
from starlette.concurrency import run_in_threadpool
from app.models.sensor import SensorReading
from app.services.predictive_service import calculate_cooling_demand

logger = logging.getLogger(__name__)


def detect_anomaly(reading: SensorReading) -> bool:
    return reading.temperature > 40 or reading.humidity > 95


def get_room_context(db_sql, sensor_id: str) -> dict | None:
    from app.models.admin import Room, Schedule

    room = db_sql.query(Room).filter(Room.sensor_id == sensor_id).first()
    if not room:
        return None

    now = datetime.utcnow()
    schedule = (
        db_sql.query(Schedule)
        .filter(
            Schedule.room_id == room.id,
            Schedule.day_of_week == now.weekday(),
            Schedule.start_time <= now.time(),
            Schedule.end_time >= now.time(),
        )
        .first()
    )
    return {
        "room_id": room.id,
        "room_name": room.name,
        "max_capacity": room.max_capacity,
        "target_temp": room.target_temp,
        "expected_people": schedule.expected_people if schedule else None,
    }


async def save_reading(db, reading: SensorReading) -> str:
    doc = reading.model_dump()
    doc["timestamp"] = reading.timestamp.isoformat()
    result = await db["sensor_readings"].insert_one(doc)
    return str(result.inserted_id)


async def process_reading(db, reading: SensorReading, db_sql=None) -> dict:
    logger.info("Ingest reading sensor_id=%s", reading.sensor_id)
    anomaly = detect_anomaly(reading)

    room_context = None
    if db_sql is not None:
        room_context = await run_in_threadpool(get_room_context, db_sql, reading.sensor_id)

    cognitive_action = await calculate_cooling_demand(reading.temperature, room_context)

    inserted_id = await save_reading(db, reading)
    logger.info(
        "Saved sensor_id=%s inserted_id=%s anomaly=%s room=%s ac=%s",
        reading.sensor_id, inserted_id, anomaly,
        room_context["room_name"] if room_context else "unknown",
        cognitive_action["ac_status"],
    )

    result = {
        "sensor_id": reading.sensor_id,
        "anomaly_detected": anomaly,
        "inserted_id": inserted_id,
        "timestamp": reading.timestamp,
        "cognitive_action": cognitive_action,
    }
    if room_context:
        result["room_context"] = room_context
    return result
