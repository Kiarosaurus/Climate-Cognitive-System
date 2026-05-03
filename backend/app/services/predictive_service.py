import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "model.joblib"
_model = None

THERMAL_LOAD_PER_PERSON = 0.05  # heuristic fallback constant


def load_model() -> None:
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


async def calculate_cooling_demand(current_temp: float, room_context: dict) -> dict:
    expected_people = (room_context or {}).get("expected_people") or 0
    target_temp = (room_context or {}).get("target_temp")

    if not room_context or target_temp is None:
        return {"ac_status": "STANDBY", "cooling_mode": None, "target": target_temp, "model": "none"}

    hour = datetime.now(timezone.utc).hour

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
