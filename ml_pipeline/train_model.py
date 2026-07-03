"""
Train a HistGradientBoostingRegressor to predict target_temp_offset.

Features  : temperature, hour_of_day, expected_occupancy, actual_occupancy,
            outdoor_temp, floor, volume_m3, ac_btu
Target    : target_temp_offset  (degrees to pre-compensate)
Output    : backend/app/ml/model.joblib  — a BUNDLE dict, not a bare estimator:
              { "model", "features", "room_id_map", "metadata" }

The feature list AND ORDER below is the single contract; predictive_service.py reads
bundle["features"] and builds its inference row in that order, so adding/reordering
features here does not silently break inference.

Validation:
  - CHRONOLOGICAL holdout (last 20% of rows) — no random shuffle → no time leakage.
  - Baselines (predict-mean, heuristic) printed alongside the model; the model must
    beat both to justify itself.

Usage (run from project root):
    python ml_pipeline/extract_data.py   # generate data first
    python ml_pipeline/train_model.py
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

DATA_CSV = Path(__file__).parent / "data" / "features.csv"
ROOM_MAP_JSON = Path(__file__).parent / "data" / "room_map.json"
MODEL_OUTPUT = Path(__file__).parent.parent / "backend" / "app" / "ml" / "model.joblib"

# Order MUST match the ML feature vector in predictive_service.calculate_cooling_demand.
# room_code (opaque) replaced by physical metadata: floor, volume_m3, ac_btu (Tier 3).
FEATURES = [
    "temperature", "hour_of_day", "expected_occupancy",
    "actual_occupancy", "outdoor_temp", "floor", "volume_m3", "ac_btu",
]
TARGET = "target_temp_offset"

TEST_FRACTION = 0.2


def _rmse(y_true, y_pred) -> float:
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def _heuristic_offset(X: np.ndarray) -> np.ndarray:
    """Occupancy-only bootstrap heuristic — the baseline the ML model must beat.

    Deliberately blind to outdoor_temp and room_code, so the model can win by using
    them. X columns are in FEATURES order.
    """
    hour = X[:, FEATURES.index("hour_of_day")]
    actual = X[:, FEATURES.index("actual_occupancy")]
    hour_weight = 1 + 0.3 * np.sin((hour - 8) * np.pi / 12)
    people_load = actual * 0.05 * hour_weight
    return np.maximum(0, people_load)


def main():
    # Windows consoles default to cp1252 — force UTF-8 so °C/R²/bar chars don't crash.
    # reconfigure exists on TextIOWrapper but not the TextIO base type — fetch dynamically.
    _reconfigure = getattr(sys.stdout, "reconfigure", None)
    if callable(_reconfigure):
        try:
            _reconfigure(encoding="utf-8")
        except Exception:
            pass

    if not DATA_CSV.exists():
        raise FileNotFoundError(f"{DATA_CSV} not found. Run extract_data.py first.")

    df = pd.read_csv(DATA_CSV)
    print(f"Loaded {len(df)} rows from {DATA_CSV}")

    df["expected_occupancy"] = df["expected_occupancy"].replace(-1, np.nan)

    room_map = json.loads(ROOM_MAP_JSON.read_text(encoding="utf-8")) if ROOM_MAP_JSON.exists() else {}

    X = df[FEATURES]
    y = df[TARGET]

    # D3 — chronological holdout: rows are already time-ordered by extract_data.
    cut = int(len(df) * (1 - TEST_FRACTION))
    # Fit on numpy arrays (no column names) so inference — which passes a plain
    # np.array — matches exactly and does not warn about missing feature names.
    X_train, X_test = X.iloc[:cut].to_numpy(), X.iloc[cut:].to_numpy()
    y_train, y_test = y.iloc[:cut], y.iloc[cut:]
    print(f"Chronological split: {len(X_train)} train / {len(X_test)} test")

    # D7 — early stopping on an internal validation split of the training data.
    model = HistGradientBoostingRegressor(
        max_iter=400,
        learning_rate=0.05,
        max_depth=4,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=15,
        random_state=42,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    rmse = _rmse(y_test, preds)
    r2 = r2_score(y_test, preds)

    # D4 — baselines on the same test set.
    base_mean = np.full(len(y_test), y_train.mean())
    rmse_mean = _rmse(y_test, base_mean)
    rmse_heur = _rmse(y_test, _heuristic_offset(X_test))

    print(f"\nTest RMSE (model)     : {rmse:.4f} °C")
    print(f"Test R²   (model)     : {r2:.4f}")
    print(f"Baseline RMSE (mean)  : {rmse_mean:.4f} °C")
    print(f"Baseline RMSE (heur.) : {rmse_heur:.4f} °C")
    beats = rmse < rmse_heur and rmse < rmse_mean
    print(f"Model beats baselines : {'YES' if beats else 'NO — reconsider using ML'}")

    print("\nFeature importances (permutation, mean R² drop):")
    perm = permutation_importance(model, X_test, y_test, n_repeats=10, random_state=42)
    for feat, imp in sorted(zip(FEATURES, perm.importances_mean), key=lambda x: -x[1]):
        bar = "█" * int(max(0.0, imp) * 40)
        print(f"  {feat:<22} {imp:.3f}  {bar}")

    # D6 — bundle model + contract + metadata.
    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_rows": len(df),
        "n_train": len(X_train),
        "n_test": len(X_test),
        "features": FEATURES,
        "target": TARGET,
        "sklearn_version": sklearn.__version__,
        "data_sha256": hashlib.sha256(DATA_CSV.read_bytes()).hexdigest(),
        "metrics": {
            "rmse": round(rmse, 4),
            "r2": round(r2, 4),
            "baseline_mean_rmse": round(rmse_mean, 4),
            "baseline_heuristic_rmse": round(rmse_heur, 4),
            "beats_baselines": beats,
        },
    }
    bundle = {
        "model": model,
        "features": FEATURES,
        "room_id_map": room_map,
        "metadata": metadata,
    }

    MODEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_OUTPUT)
    print(f"\nBundle saved → {MODEL_OUTPUT}")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
