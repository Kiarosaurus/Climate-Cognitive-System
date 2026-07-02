"""
Train a HistGradientBoostingRegressor to predict target_temp_offset.

Features  : temperature, hour_of_day, expected_occupancy, actual_occupancy
Target    : target_temp_offset  (degrees to pre-compensate)
Output    : backend/app/ml/model.joblib

NOTE: The feature list AND ORDER below must stay identical to the vector built in
backend/app/services/predictive_service.py (calculate_cooling_demand, ML branch):
    [current_temp, hour, expected_occupancy, actual_occupancy]

Usage (run from project root):
    python ml_pipeline/extract_data.py   # generate data first
    python ml_pipeline/train_model.py
"""

import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

DATA_CSV = Path(__file__).parent / "data" / "features.csv"
MODEL_OUTPUT = Path(__file__).parent.parent / "backend" / "app" / "ml" / "model.joblib"

# Order MUST match the ML feature vector in predictive_service.calculate_cooling_demand.
# actual_occupancy is the CO2-derived realized headcount (feedback); expected_occupancy
# is the reservation plan (feed-forward). Keeping both lets the model weight them.
FEATURES = ["temperature", "hour_of_day", "expected_occupancy", "actual_occupancy"]
TARGET = "target_temp_offset"

def main():
    if not DATA_CSV.exists():
        raise FileNotFoundError(
            f"{DATA_CSV} not found. Run extract_data.py first."
        )

    df = pd.read_csv(DATA_CSV)
    print(f"Loaded {len(df)} rows from {DATA_CSV}")

    df['expected_occupancy'] = df['expected_occupancy'].replace(-1, np.nan)

    X = df[FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # 4. CAMBIO: Usar HistGradientBoostingRegressor
    model = HistGradientBoostingRegressor(
        max_iter=200,       # Equivale a n_estimators
        learning_rate=0.05,
        max_depth=4,
        random_state=42,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    r2 = r2_score(y_test, preds)
    print(f"Test RMSE : {rmse:.4f}°C")
    print(f"Test R²   : {r2:.4f}")

    # HistGradientBoostingRegressor has no .feature_importances_ — use permutation
    # importance (drop in R² when each feature is shuffled) on the held-out set.
    perm = permutation_importance(
        model, X_test, y_test, n_repeats=10, random_state=42
    )
    print("\nFeature importances (permutation, mean R² drop):")
    for feat, imp in sorted(
        zip(FEATURES, perm.importances_mean), key=lambda x: -x[1]
    ):
        bar = "█" * int(max(0.0, imp) * 40)
        print(f"  {feat:<22} {imp:.3f}  {bar}")

    MODEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_OUTPUT)
    print(f"\nModel saved → {MODEL_OUTPUT}")


if __name__ == "__main__":
    main()
