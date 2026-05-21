"""
Train a HistGradientBoostingRegressor to predict target_temp_offset.

Features  : temperature, hour_of_day, expected_people
Target    : target_temp_offset  (degrees to pre-compensate)
Output    : backend/app/ml/model.joblib

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

DATA_CSV = Path(__file__).parent / "data" / "features.csv"
MODEL_OUTPUT = Path(__file__).parent.parent / "backend" / "app" / "ml" / "model.joblib"

# 2. CAMBIO: Añadir co2_ppm. Si no hay cámara, el CO2 "salvará" la predicción.
FEATURES = ["temperature", "hour_of_day", "expected_people", "co2_ppm"] 
TARGET = "target_temp_offset"

def main():
    if not DATA_CSV.exists():
        raise FileNotFoundError(
            f"{DATA_CSV} not found. Run extract_data.py first."
        )

    df = pd.read_csv(DATA_CSV)
    print(f"Loaded {len(df)} rows from {DATA_CSV}")

    df['expected_people'] = df['expected_people'].replace(-1, np.nan)

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

    print("\nFeature importances:")
    for feat, imp in sorted(
        zip(FEATURES, model.feature_importances_), key=lambda x: -x[1]
    ):
        bar = "█" * int(imp * 40)
        print(f"  {feat:<22} {imp:.3f}  {bar}")

    MODEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_OUTPUT)
    print(f"\nModel saved → {MODEL_OUTPUT}")


if __name__ == "__main__":
    main()
