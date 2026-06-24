"""
Predictive service — dual-mode thermal load engine.

Operates in two modes:
  - ML mode: loads a scikit-learn model trained on historical sensor readings.
    Features: [current_temp, hour_of_day, expected_occupancy].
  - Heuristic mode (fallback): estimates thermal load as
    expected_people × THERMAL_LOAD_PER_PERSON when no model.joblib is present.

The output drives the AC cognitive action: if the current temperature exceeds
the occupancy-adjusted target, the system emits ac_status=ON (PRE-COOLING);
otherwise it emits STANDBY, avoiding unnecessary energy consumption.
"""
import logging
from datetime import datetime
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "model.joblib"
_model = None

# Degrees Celsius of thermal load added per person present (heuristic bootstrap)
THERMAL_LOAD_PER_PERSON = 0.05


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
    current_temp: float, room_context: dict, reading_timestamp: datetime
) -> dict:
    """Compute the cognitive AC action for an incoming sensor reading.

    Args:
        current_temp: Measured temperature in °C from the sensor.
        room_context: Dict with room metadata (target_temp, expected_people, etc.)
                      or None/empty when the sensor has no registered room or
                      control is disabled.
        reading_timestamp: UTC datetime of the reading; used to extract hour_of_day
                           as a feature for the ML model.

    Returns:
        Dict with keys: ac_status ('ON' | 'STANDBY'), cooling_mode, target,
        thermal_load_offset, model ('ml' | 'heuristic' | 'none').
    """
    expected_people = (room_context or {}).get("expected_people") or 0
    target_temp = (room_context or {}).get("target_temp")

    if not room_context or target_temp is None:
        return {"ac_status": "STANDBY", "cooling_mode": None, "target": target_temp, "model": "none"}

    # Use sensor timestamp hour, stripped of tzinfo to match naive UTC assumption
    ts = reading_timestamp.replace(tzinfo=None) if reading_timestamp.tzinfo else reading_timestamp
    hour = ts.hour

    if _model is not None:
        features = np.array([[current_temp, hour, expected_people]], dtype=float)
        thermal_load = float(max(0.0, _model.predict(features)[0]))
        model_used = "ml"
    else:
        thermal_load = expected_people * THERMAL_LOAD_PER_PERSON
        model_used = "heuristic"

    thermal_load = round(thermal_load, 3)
    adjusted_target = round(target_temp - thermal_load, 2)

    if current_temp > adjusted_target:
        return {
            "ac_status": "ON",
            "cooling_mode": "PRE-COOLING",
            "target": adjusted_target,
            "thermal_load_offset": thermal_load,
            "model": model_used,
        }
    return {
        "ac_status": "STANDBY",
        "cooling_mode": None,
        "target": adjusted_target,
        "thermal_load_offset": thermal_load,
        "model": model_used,
    }
