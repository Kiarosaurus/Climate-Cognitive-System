import logging
from datetime import datetime
from starlette.concurrency import run_in_threadpool
from app.models.sensor import SensorReading
from app.services.predictive_service import calculate_cooling_demand

logger = logging.getLogger(__name__)


def detect_anomaly(reading: SensorReading) -> bool:
    return (
        reading.temperature > 40
        or reading.humidity > 95
        or reading.co_ppm > 50  # EPA alert threshold for CO
    )


def get_room_context(db_sql, sensor_id: str, reading_timestamp: datetime) -> dict | None:
    from app.models.admin import SensorDevice, Schedule

    # Look up device — skip telemetry if inactive or control disabled
    device = (
        db_sql.query(SensorDevice)
        .filter(SensorDevice.id == sensor_id)
        .first()
    )

    if not device:
        logger.debug("sensor_id=%s not registered in sensor_devices.", sensor_id)
        return None

    if not device.is_active:
        logger.info("sensor_id=%s is_active=False — ignoring telemetry.", sensor_id)
        return {"_device_ignored": True}

    if not device.control_enabled:
        logger.info("sensor_id=%s control_enabled=False — no cognitive action.", sensor_id)
        return {"_control_disabled": True}

    room = device.room

    # Strip tzinfo so .time()/.weekday() are naive — matches PG Time column
    now = reading_timestamp.replace(tzinfo=None) if reading_timestamp.tzinfo else reading_timestamp
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
        "control_policy": getattr(room, "control_policy", "auto") or "auto",
        "device_id": device.id,
    }


async def save_reading(db, reading: SensorReading, cognitive_action: dict | None = None) -> str:
    doc = reading.model_dump()
    # Always store naive UTC ISO string so MongoDB string comparison in $gte/$lte queries
    # works consistently regardless of whether the client sent a 'Z' or '+00:00' timestamp.
    doc["timestamp"] = reading.timestamp.replace(tzinfo=None).strftime("%Y-%m-%dT%H:%M:%S.%f")
    if cognitive_action is not None:
        doc["cognitive_action"] = cognitive_action
    # DEBUG: trace every persisted reading — confirms WHICH source created it
    print(
        f"[INGEST] sensor_id={reading.sensor_id} "
        f"is_simulated={reading.is_simulated} "
        f"co_ppm={reading.co_ppm} "
        f"ts={doc['timestamp']}"
    )
    result = await db["sensor_readings"].insert_one(doc)
    return str(result.inserted_id)


async def process_reading(db, reading: SensorReading, db_sql=None) -> dict:
    logger.info("Ingest reading sensor_id=%s", reading.sensor_id)
    anomaly = detect_anomaly(reading)

    room_context = None
    cognitive_action = None

    if db_sql is not None:
        room_context = await run_in_threadpool(
            get_room_context, db_sql, reading.sensor_id, reading.timestamp
        )

    # Device inactive → skip telemetry entirely (don't even save to Mongo)
    if isinstance(room_context, dict) and room_context.get("_device_ignored"):
        logger.info("Dropping telemetry for inactive device sensor_id=%s.", reading.sensor_id)
        return {"sensor_id": reading.sensor_id, "skipped": True, "reason": "device_inactive"}

    # Control disabled → save reading but emit no cognitive action
    if isinstance(room_context, dict) and room_context.get("_control_disabled"):
        room_context = None   # don't include internal flag in response
        cognitive_action = {"ac_status": "DISABLED", "cooling_mode": None, "target": None, "model": "none"}

    if cognitive_action is None:
        cognitive_action = await calculate_cooling_demand(
            reading.temperature, room_context, reading.timestamp
        )

    inserted_id = await save_reading(db, reading, cognitive_action=cognitive_action)
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
