from app.models.sensor import SensorReading


def process_reading(reading: SensorReading) -> dict:
    anomaly = reading.temperature > 40 or reading.humidity > 95
    return {
        "sensor_id": reading.sensor_id,
        "anomaly_detected": anomaly,
        "timestamp": reading.timestamp,
    }
