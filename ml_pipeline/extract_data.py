"""
Extract sensor_readings from MongoDB, engineer features, generate target label,
and save a clean CSV ready for training.

Occupancy features (kept as DISTINCT columns — never conflated):
    expected_occupancy → PLANNED headcount from the room Schedule/Reservation.
                         Feed-forward signal (known before arrival).
    actual_occupancy   → REALIZED headcount inferred from CO2 via a steady-state
                         mass-balance proxy. Feedback signal (measured reality).

Target — target_temp_offset:
    How many degrees the cooling system must pre-compensate beyond the room's
    target_temp, given current conditions. Computed heuristically from the
    REALIZED thermal load:
        people_load  = actual_occupancy * 0.05 * hour_weight
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

# CO2 mass-balance constants — MUST mirror backend/app/services/occupancy_service.py
CO2_BASELINE_PPM = 420.0
CO2_PPM_PER_PERSON = 25.0

FEATURES = [
    "temperature", "humidity", "co2_ppm",
    "hour_of_day", "day_of_week",
    "expected_occupancy", "actual_occupancy",
]
TARGET = "target_temp_offset"


def _people_from_co2(co2: np.ndarray, max_capacity: int | None = None) -> np.ndarray:
    """Inverse mass balance: infer realized headcount from CO2 (mirrors backend)."""
    people = np.maximum(0.0, (co2 - CO2_BASELINE_PPM) / CO2_PPM_PER_PERSON)
    if max_capacity is not None:
        people = np.minimum(people, max_capacity)
    return np.round(people)


def _co2_from_people(people: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Forward mass balance: synthesize a plausible CO2 level from real occupancy."""
    noise = rng.normal(0, 15, len(people))  # sensor/ventilation jitter in ppm
    return np.maximum(350.0, CO2_BASELINE_PPM + people * CO2_PPM_PER_PERSON + noise).round(2)


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
    df = _add_occupancy(df)
    df[TARGET] = _compute_offset(df)
    return df[FEATURES + [TARGET]]


def _add_occupancy(df: pd.DataFrame) -> pd.DataFrame:
    """Attach BOTH occupancy signals.

    actual_occupancy → derived from the measured CO2 (physical ground truth).
    expected_occupancy → the plan; taken from the reading when present, else
    synthesized from the academic-hours pattern to bootstrap the feed-forward view.
    """
    rng = np.random.default_rng(0)

    # Feedback signal: realized occupancy inferred from measured CO2.
    df["actual_occupancy"] = _people_from_co2(df["co2_ppm"].to_numpy())

    # Feed-forward signal: planned occupancy. Backfill missing plan with a pattern.
    is_class = (df["day_of_week"] < 5) & (df["hour_of_day"].between(8, 17))
    synthetic_expected = np.where(
        is_class,
        rng.integers(10, 35, len(df)),
        rng.integers(0, 5, len(df)),
    )
    if "expected_occupancy" not in df.columns:
        df["expected_occupancy"] = synthetic_expected
    else:
        df["expected_occupancy"] = df["expected_occupancy"].fillna(
            pd.Series(synthetic_expected, index=df.index)
        )

    return df


def _compute_offset(df: pd.DataFrame) -> pd.Series:
    # Realized load is driven by who ACTUALLY showed up, not who was booked.
    hour_weight = 1 + 0.3 * np.sin((df["hour_of_day"] - 8) * np.pi / 12)
    people_load = df["actual_occupancy"] * 0.05 * hour_weight
    solar_gain = np.maximum(0, (df["temperature"] - 22) * 0.02)
    noise = np.random.default_rng(1).normal(0, 0.08, len(df))
    return np.maximum(0, people_load + solar_gain + noise).round(4)


def _generate_synthetic(n: int) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    hours = rng.integers(0, 24, n)
    days = rng.integers(0, 7, n)
    temps = rng.uniform(15.0, 45.0, n).round(2)
    humidity = rng.uniform(30.0, 100.0, n).round(2)
    is_class = (days < 5) & (hours >= 8) & (hours <= 17)

    # Feed-forward: PLANNED occupancy (the reservation).
    expected = np.where(is_class, rng.integers(10, 35, n), rng.integers(0, 5, n))

    # Feedback: REALIZED occupancy — a fraction of the plan actually shows up
    # (no-shows / over-reservation), occasionally exceeding it (walk-ins).
    attendance_rate = rng.uniform(0.55, 0.95, n)
    actual = np.round(expected * attendance_rate).astype(int)
    actual = np.maximum(0, actual + rng.integers(-2, 3, n))  # walk-ins / stragglers

    # CO2 is generated FROM realized occupancy → the gap stays physically coherent.
    co2 = _co2_from_people(actual, rng)

    hour_weight = 1 + 0.3 * np.sin((hours - 8) * np.pi / 12)
    people_load = actual * 0.05 * hour_weight
    solar_gain = np.maximum(0, (temps - 22) * 0.02)
    noise = rng.normal(0, 0.08, n)
    target = np.maximum(0, people_load + solar_gain + noise).round(4)

    return pd.DataFrame({
        "temperature": temps,
        "humidity": humidity,
        "co2_ppm": co2,
        "hour_of_day": hours,
        "day_of_week": days,
        "expected_occupancy": expected,
        "actual_occupancy": actual,
        TARGET: target,
    })


if __name__ == "__main__":
    main()
