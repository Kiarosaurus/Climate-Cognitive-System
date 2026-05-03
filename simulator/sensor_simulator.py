import requests
import random
import time
import os
from datetime import datetime

API_URL = os.getenv("API_URL", "http://localhost:8000")
ENDPOINT = f"{API_URL}/api/v1/sensors/"
SENSOR_IDS = ["sensor-001", "sensor-002", "sensor-003"]
INTERVAL_SECONDS = 5


def generate_reading(sensor_id: str) -> dict:
    return {
        "sensor_id": sensor_id,
        "temperature": round(random.uniform(15.0, 45.0), 2),
        "humidity": round(random.uniform(30.0, 100.0), 2),
        "co2_ppm": round(random.uniform(350.0, 2000.0), 2),
        "timestamp": datetime.utcnow().isoformat(),
    }


def main():
    print(f"Simulator started. Posting to {ENDPOINT} every {INTERVAL_SECONDS}s.")
    while True:
        for sensor_id in SENSOR_IDS:
            payload = generate_reading(sensor_id)
            try:
                response = requests.post(ENDPOINT, json=payload, timeout=5)
                print(f"[{payload['timestamp']}] {sensor_id} → {response.status_code}")
            except requests.exceptions.ConnectionError:
                print(f"[ERROR] Cannot reach API at {ENDPOINT}")
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
