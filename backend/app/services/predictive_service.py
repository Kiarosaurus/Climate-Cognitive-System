"""
Predictive service — dual-mode thermal load engine.

Occupancy model (feed-forward + feedback):
  - expected_occupancy → PLANNED headcount from Schedule/Reservation. Feed-forward
    signal: drives anticipatory pre-cooling, the only value known before arrival.
  - actual_occupancy   → REALIZED headcount inferred from CO2 (occupancy_service).
    Feedback signal: trims the demand once the room actually fills (or doesn't).
  The engine blends both into an effective_occupancy via FEEDBACK_WEIGHT.

Operates in two modes:
  - ML mode: loads a scikit-learn model trained on historical sensor readings.
    Features: [current_temp, hour_of_day, expected_occupancy, actual_occupancy].
  - Heuristic mode (fallback): estimates thermal load as
    effective_occupancy × THERMAL_LOAD_PER_PERSON when no model.joblib is present.

The output drives the AC cognitive action: if the current temperature exceeds
the occupancy-adjusted target, the system emits ac_status=ON (PRE-COOLING);
otherwise it emits STANDBY, avoiding unnecessary energy consumption.
"""
import logging
from datetime import datetime
from pathlib import Path

import numpy as np

from app.services.occupancy_service import estimate_actual_occupancy, occupancy_gap

logger = logging.getLogger(__name__)

_MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "model.joblib"
_model = None

# Degrees Celsius of thermal load added per person present (heuristic bootstrap)
THERMAL_LOAD_PER_PERSON = 0.05

# Weight of the FEEDBACK (CO2-measured actual) signal vs the FEED-FORWARD
# (reservation-planned expected) signal when both are available. 0 → trust the
# plan only; 1 → trust the live sensor only. 0.6 leans on measured reality while
# retaining anticipation for the ramp-up at the start of an occupancy window.
FEEDBACK_WEIGHT = 0.6


def load_model() -> None:
    """Load the trained scikit-learn model from disk at application startup.

    If the model file does not exist, the service degrades gracefully to the
    heuristic fallback. No exception is raised so the rest of the API stays live.
    Train with: ml_pipeline/extract_data.py → ml_pipeline/train_model.py
    """
    global _model
    try:
        import joblib
        if _MODEL_PATH.exists():
            _model = joblib.load(_MODEL_PATH)
            logger.info("ML model loaded from %s", _MODEL_PATH)
        else:
            logger.warning(
                "model.joblib not found at %s — heuristic fallback active. "
                "Run ml_pipeline/extract_data.py then ml_pipeline/train_model.py.",
                _MODEL_PATH,
            )
    except Exception as exc:
        logger.error("Failed to load ML model: %s — heuristic fallback active.", exc)


def active_engine() -> str:
    """Return the engine currently driving cognitive actions.

    'ml' when a trained model is loaded in memory, otherwise 'heuristic'. This is
    global, startup-bound server state — independent of any single reading.
    """
    return "ml" if _model is not None else "heuristic"


async def calculate_cooling_demand(
    current_temp: float,
    room_context: dict,
    reading_timestamp: datetime,
    co2_ppm: float | None = None,
) -> dict:
    """Compute the cognitive AC action for an incoming sensor reading.

    Args:
        current_temp: Measured temperature in °C from the sensor.
        room_context: Dict with room metadata (target_temp, expected_people,
                      max_capacity, etc.) or None/empty when the sensor has no
                      registered room or control is disabled.
        reading_timestamp: UTC datetime of the reading; used to extract hour_of_day
                           as a feature for the ML model.
        co2_ppm: Measured CO2 in ppm, used to infer actual (realized) occupancy for
                 the feedback correction. None → feed-forward on expected only.

    Returns:
        Dict with keys: ac_status ('ON' | 'STANDBY'), cooling_mode, target,
        thermal_load_offset, model ('ml' | 'heuristic' | 'none'), and the
        occupancy telemetry: expected_occupancy, actual_occupancy,
        effective_occupancy, occupancy_gap.
    """
    expected_people = (room_context or {}).get("expected_people") or 0
    target_temp = (room_context or {}).get("target_temp")
    policy = (room_context or {}).get("control_policy") or "auto"
    max_capacity = (room_context or {}).get("max_capacity")

    if not room_context or target_temp is None:
        return {"ac_status": "STANDBY", "cooling_mode": None, "target": target_temp, "model": "none"}

    # Feedback signal: infer realized occupancy from CO2 (None when no CO2 channel).
    actual_people = estimate_actual_occupancy(co2_ppm, max_capacity)

    # Effective occupancy = feed-forward (plan) blended with feedback (measured).
    # No CO2 signal → pure feed-forward on the reservation/schedule expectation.
    if actual_people is None:
        effective_people = float(expected_people)
    else:
        effective_people = (
            (1 - FEEDBACK_WEIGHT) * expected_people + FEEDBACK_WEIGHT * actual_people
        )

    # Use sensor timestamp hour, stripped of tzinfo to match naive UTC assumption
    ts = reading_timestamp.replace(tzinfo=None) if reading_timestamp.tzinfo else reading_timestamp
    hour = ts.hour

    # Per-room policy decides the engine:
    #   manual    → no prediction, hold the configured target (zero offset)
    #   heuristic → force the heuristic formula regardless of loaded ML model
    #   auto      → ML model when loaded, else heuristic fallback
    if policy == "manual":
        thermal_load = 0.0
        model_used = "manual"
    elif policy == "heuristic" or _model is None:
        thermal_load = effective_people * THERMAL_LOAD_PER_PERSON
        model_used = "heuristic"
    else:
        # actual_people may be None (no CO2) — fall back to expected for that slot
        actual_feature = actual_people if actual_people is not None else expected_people
        features = np.array(
            [[current_temp, hour, expected_people, actual_feature]], dtype=float
        )
        thermal_load = float(max(0.0, _model.predict(features)[0]))
        model_used = "ml"

    thermal_load = round(thermal_load, 3)
    adjusted_target = round(target_temp - thermal_load, 2)

    occupancy_telemetry = {
        "expected_occupancy": expected_people,
        "actual_occupancy": actual_people,
        "effective_occupancy": round(effective_people, 2),
        "occupancy_gap": occupancy_gap(expected_people, actual_people),
    }

    if current_temp > adjusted_target:
        return {
            "ac_status": "ON",
            "cooling_mode": "PRE-COOLING",
            "target": adjusted_target,
            "thermal_load_offset": thermal_load,
            "model": model_used,
            **occupancy_telemetry,
        }
    return {
        "ac_status": "STANDBY",
        "cooling_mode": None,
        "target": adjusted_target,
        "thermal_load_offset": thermal_load,
        "model": model_used,
        **occupancy_telemetry,
    }
