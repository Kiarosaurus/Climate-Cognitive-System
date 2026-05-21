"""
Extract sensor_readings from MongoDB, engineer features, generate target label,
and save a clean CSV ready for training.

Target — target_temp_offset:
    How many degrees the cooling system must pre-compensate beyond the room's
    target_temp, given current conditions.  Computed heuristically from:
        people_load  = expected_people * 0.05 * hour_weight
        solar_gain   = max(0, (temperature - 22) * 0.02)
    This acts as a bootstrap label; once real AC feedback data is available,
    replace _compute_offset() with actual measurements.

Usage (run from project root):
    python ml_pipeline/extract_data.py
"""

import os
import numpy as np
import pandas as pd
from pathlib import Path
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATA_DIR = Path(__file__).parent / "data"
OUTPUT_CSV = DATA_DIR / "features.csv"

FEATURES = ["temperature", "humidity", "co2_ppm", "hour_of_day", "day_of_week", "expected_people"]
TARGET = "target_temp_offset"


def main():
    DATA_DIR.mkdir(exist_ok=True)

    print(f"Connecting to MongoDB at {MONGO_URI}...")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    docs = list(client["climate_db"]["sensor_readings"].find({}, {"_id": 0}))
    print(f"Found {len(docs)} documents in sensor_readings.")

    if len(docs) >= 50:
        df = _clean(pd.DataFrame(docs))
        if len(df) < 100:
            print(f"Only {len(df)} clean rows — augmenting with {1000} synthetic rows.")
            df = pd.concat([df, _generate_synthetic(1000)], ignore_index=True)
    else:
        print("Insufficient real data — generating 2000 synthetic rows.")
        df = _generate_synthetic(2000)

    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Saved {len(df)} rows to {OUTPUT_CSV}")
    print(df[FEATURES + [TARGET]].describe().round(3))


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["temperature", "humidity"]).copy()
    df["co2_ppm"] = df["co2_ppm"].fillna(df["co2_ppm"].median())
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"])
    df["hour_of_day"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek
    df = _add_synthetic_people(df)
    df[TARGET] = _compute_offset(df)
    return df[FEATURES + [TARGET]]


def _add_synthetic_people(df: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    is_class = (df["day_of_week"] < 5) & (df["hour_of_day"].between(8, 17))
    
    # Generamos la predicción sintética
    synthetic_people = np.where(
        is_class,
        rng.integers(10, 35, len(df)),
        rng.integers(0, 5, len(df)),
    )
    
    # CAMBIO: Solo aplicar los datos sintéticos donde expected_people sea nulo o no exista
    if "expected_people" not in df.columns:
        df["expected_people"] = synthetic_people
    else:
        # Rellenar solo los vacíos (NaN) con la lógica sintética
        df["expected_people"] = df["expected_people"].fillna(pd.Series(synthetic_people))
        
    return df


def _compute_offset(df: pd.DataFrame) -> pd.Series:
    hour_weight = 1 + 0.3 * np.sin((df["hour_of_day"] - 8) * np.pi / 12)
    people_load = df["expected_people"] * 0.05 * hour_weight
    solar_gain = np.maximum(0, (df["temperature"] - 22) * 0.02)
    noise = np.random.default_rng(1).normal(0, 0.08, len(df))
    return np.maximum(0, people_load + solar_gain + noise).round(4)


def _generate_synthetic(n: int) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    hours = rng.integers(0, 24, n)
    days = rng.integers(0, 7, n)
    temps = rng.uniform(15.0, 45.0, n).round(2)
    humidity = rng.uniform(30.0, 100.0, n).round(2)
    co2 = rng.uniform(350.0, 2000.0, n).round(2)
    is_class = (days < 5) & (hours >= 8) & (hours <= 17)
    people = np.where(is_class, rng.integers(10, 35, n), rng.integers(0, 5, n))

    hour_weight = 1 + 0.3 * np.sin((hours - 8) * np.pi / 12)
    people_load = people * 0.05 * hour_weight
    solar_gain = np.maximum(0, (temps - 22) * 0.02)
    noise = rng.normal(0, 0.08, n)
    target = np.maximum(0, people_load + solar_gain + noise).round(4)

    return pd.DataFrame({
        "temperature": temps,
        "humidity": humidity,
        "co2_ppm": co2,
        "hour_of_day": hours,
        "day_of_week": days,
        "expected_people": people,
        TARGET: target,
    })


if __name__ == "__main__":
    main()
