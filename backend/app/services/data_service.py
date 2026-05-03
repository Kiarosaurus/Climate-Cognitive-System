import logging
from app.models.sensor import SensorReading

logger = logging.getLogger(__name__)


def detect_anomaly(reading: SensorReading) -> bool:
    return reading.temperature > 40 or reading.humidity > 95


async def save_reading(db, reading: SensorReading) -> str:
    doc = reading.model_dump()
    doc["timestamp"] = reading.timestamp.isoformat()
    result = await db["sensor_readings"].insert_one(doc)
    return str(result.inserted_id)


async def process_reading(db, reading: SensorReading) -> dict:
    logger.info("Ingest reading sensor_id=%s", reading.sensor_id)
    anomaly = detect_anomaly(reading)
    inserted_id = await save_reading(db, reading)
    logger.info("Saved sensor_id=%s inserted_id=%s anomaly=%s", reading.sensor_id, inserted_id, anomaly)
    return {
        "sensor_id": reading.sensor_id,
        "anomaly_detected": anomaly,
        "inserted_id": inserted_id,
        "timestamp": reading.timestamp,
    }
