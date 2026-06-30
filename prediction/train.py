"""
F1 Analytics — Model Training Script
Trains a GradientBoosting + Calibration model for podium prediction.

Usage:
    python prediction/train.py
"""

import os
import sys
import pickle
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from prediction.features import build_features, FEATURES
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, roc_auc_score


def train():
    print("Building features from database...")
    df = build_features(season_filter_end=2025)

    if df.empty:
        print("ERROR: No data found. Make sure your database is populated.")
        return

    # TIME-BASED SPLIT — never random, that leaks future data
    train_df = df[df["season"] <= 2022]
    val_df = df[df["season"] == 2023]
    test_df = df[df["season"].isin([2024, 2025])]

    X_train = train_df[FEATURES]
    y_train = train_df["podium"]
    X_val = val_df[FEATURES]
    y_val = val_df["podium"]
    X_test = test_df[FEATURES]
    y_test = test_df["podium"]

    print(f"Train: {len(train_df)} rows | Val: {len(val_df)} | Test: {len(test_df)}")

    # Train with calibration — so 68% means ~68% of the time
    base = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        random_state=42
    )
    model = CalibratedClassifierCV(base, cv=3, method="isotonic")
    print("Training model...")
    model.fit(X_train, y_train)

    # Evaluate honestly
    if len(val_df) > 0:
        print("\n--- Validation (2023) ---")
        val_preds = model.predict(X_val)
        val_proba = model.predict_proba(X_val)[:, 1]
        print(classification_report(y_val, val_preds,
                                    target_names=["No podium", "Podium"]))
        print(f"ROC-AUC: {roc_auc_score(y_val, val_proba):.3f}")

    if len(test_df) > 0:
        print("\n--- Test (2024-2025) ---")
        test_preds = model.predict(X_test)
        test_proba = model.predict_proba(X_test)[:, 1]
        print(classification_report(y_test, test_preds,
                                    target_names=["No podium", "Podium"]))
        print(f"ROC-AUC: {roc_auc_score(y_test, test_proba):.3f}")

        # Baseline: predict podium purely by grid position (top 3 grid = podium)
        baseline = (X_test["grid_position"] <= 3).astype(int)
        print(f"\nBaseline accuracy (grid ≤ 3 = podium): "
              f"{(baseline == y_test).mean():.3f}")
        print(f"Model accuracy: {(test_preds == y_test).mean():.3f}")

    # Save
    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)))
    model_path = os.path.join(model_dir, "model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"\nModel saved to {model_path}")

    # Print feature importance from the base estimator
    print("\nFeature Importances:")
    # CalibratedClassifierCV wraps base estimators; get importance from the base
    try:
        importances = base.feature_importances_
        for feat, imp in sorted(zip(FEATURES, importances), key=lambda x: -x[1]):
            bar = "█" * int(imp * 40)
            print(f"  {feat:30s} {imp:.3f}  {bar}")
    except Exception:
        print("  (Could not extract feature importances from calibrated model)")


if __name__ == "__main__":
    train()
