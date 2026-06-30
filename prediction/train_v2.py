"""
F1 Analytics — 12-Layer Model Training Script (v2)
===================================================
Trains on the full 12-layer feature set with proper time-based splits.

Usage:
    python prediction/train_v2.py
"""

import os
import sys
import pickle
import logging
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

from prediction.features_v2 import build_features_v2, FEATURES_V2
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, roc_auc_score, brier_score_loss


def train_v2():
    logger.info("=" * 60)
    logger.info("F1 PREDICTION — 12-LAYER MODEL TRAINING")
    logger.info("=" * 60)

    logger.info("\nBuilding 12-layer features from database...")
    df = build_features_v2(season_filter_end=2025)

    if df.empty:
        logger.error("ERROR: No data found. Make sure your database is populated.")
        return

    # Drop rows with NaN in features (early-season rows with insufficient history)
    valid_mask = df[FEATURES_V2].notna().all(axis=1)
    df_clean = df[valid_mask].copy()
    logger.info(f"Clean rows: {len(df_clean)} / {len(df)} "
                f"({len(df) - len(df_clean)} dropped due to NaN features)")

    # ═══════════════════════════════════════════════════════════════
    # TIME-BASED SPLIT — never random, that leaks future data
    # ═══════════════════════════════════════════════════════════════
    train_df = df_clean[df_clean["season"] <= 2022]
    val_df = df_clean[df_clean["season"] == 2023]
    test_df = df_clean[df_clean["season"].isin([2024, 2025])]

    X_train = train_df[FEATURES_V2].astype(float)
    y_train = train_df["podium"]
    X_val = val_df[FEATURES_V2].astype(float)
    y_val = val_df["podium"]
    X_test = test_df[FEATURES_V2].astype(float)
    y_test = test_df["podium"]

    logger.info(f"\nTrain: {len(train_df)} rows (≤2022)")
    logger.info(f"Val:   {len(val_df)} rows (2023)")
    logger.info(f"Test:  {len(test_df)} rows (2024-2025)")
    logger.info(f"Features: {len(FEATURES_V2)}")

    # ═══════════════════════════════════════════════════════════════
    # TRAIN — Hyperparameter Search + Time Decay Weights
    # ═══════════════════════════════════════════════════════════════
    logger.info("\nOptimizing model parameters (this may take a minute)...")
    
    # Give more weight to recent seasons (2022 matters more than 2018)
    sample_weights = np.exp((train_df["season"] - 2018) * 0.3)
    
    from sklearn.model_selection import GridSearchCV
    
    # Try different configurations to squeeze out more accuracy
    param_grid = {
        'n_estimators': [200, 300, 400],
        'max_depth': [3, 4, 5],
        'learning_rate': [0.03, 0.05, 0.08]
    }
    
    base_search = GradientBoostingClassifier(
        subsample=0.8,
        min_samples_leaf=10,
        random_state=42
    )
    
    grid_search = GridSearchCV(
        base_search, 
        param_grid, 
        cv=3, 
        scoring='roc_auc',
        n_jobs=-1
    )
    
    grid_search.fit(X_train, y_train, sample_weight=sample_weights)
    
    best_base = grid_search.best_estimator_
    logger.info(f"Best parameters found: {grid_search.best_params_}")
    
    logger.info("Applying sigmoid calibration for smooth probabilities...")
    model = CalibratedClassifierCV(best_base, cv=3, method="sigmoid")

    model.fit(X_train, y_train, sample_weight=sample_weights)
    logger.info("Training complete.")

    # ═══════════════════════════════════════════════════════════════
    # EVALUATE — honest metrics
    # ═══════════════════════════════════════════════════════════════
    for split_name, X_split, y_split in [
        ("Validation (2023)", X_val, y_val),
        ("Test (2024-2025)", X_test, y_test),
    ]:
        if len(X_split) == 0:
            continue

        logger.info(f"\n{'─' * 50}")
        logger.info(f"  {split_name}")
        logger.info(f"{'─' * 50}")

        preds = model.predict(X_split)
        proba = model.predict_proba(X_split)[:, 1]

        print(classification_report(y_split, preds,
                                    target_names=["No podium", "Podium"]))

        auc = roc_auc_score(y_split, proba)
        brier = brier_score_loss(y_split, proba)
        acc = (preds == y_split).mean()

        logger.info(f"ROC-AUC:       {auc:.4f}")
        logger.info(f"Brier Score:   {brier:.4f} (lower = better calibration)")
        logger.info(f"Accuracy:      {acc:.4f}")

    # Baseline comparison
    if len(test_df) > 0:
        baseline = (X_test["grid_position"] <= 3).astype(int)
        baseline_acc = (baseline == y_test).mean()
        model_acc = (model.predict(X_test) == y_test).mean()
        logger.info(f"\n{'═' * 50}")
        logger.info(f"  BASELINE vs MODEL (Test Set)")
        logger.info(f"{'═' * 50}")
        logger.info(f"Baseline accuracy (grid ≤ 3):  {baseline_acc:.4f}")
        logger.info(f"Model accuracy (12-layer):     {model_acc:.4f}")
        logger.info(f"Improvement:                   +{(model_acc - baseline_acc)*100:.1f}%")

    # ═══════════════════════════════════════════════════════════════
    # SAVE
    # ═══════════════════════════════════════════════════════════════
    model_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(model_dir, "model_v2.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    logger.info(f"\n✓ Model saved to {model_path}")

    # Also save feature list for reference
    features_path = os.path.join(model_dir, "features_v2_list.txt")
    with open(features_path, "w") as f:
        for feat in FEATURES_V2:
            f.write(f"{feat}\n")

    # ═══════════════════════════════════════════════════════════════
    # FEATURE IMPORTANCE
    # ═══════════════════════════════════════════════════════════════
    logger.info(f"\n{'═' * 50}")
    logger.info("  FEATURE IMPORTANCE (12 Layers)")
    logger.info(f"{'═' * 50}")

    try:
        # Fit the base model separately to get importances (using best params)
        base_for_importance = GradientBoostingClassifier(
            **grid_search.best_params_,
            subsample=0.8, min_samples_leaf=10, random_state=42
        )
        base_for_importance.fit(X_train, y_train, sample_weight=sample_weights)
        importances = base_for_importance.feature_importances_

        # Group by layer
        layer_groups = {
            "L1+L2 Season":    FEATURES_V2[0:6],
            "L3+L4 Car":       FEATURES_V2[6:10],
            "L5+L6 Circuit":   FEATURES_V2[10:14],
            "L7+L8 Practice":  FEATURES_V2[14:16],
            "L9+L10 Quali":    FEATURES_V2[16:25],
            "L11+L12 Events":  FEATURES_V2[25:28],
            "Form (shared)":   FEATURES_V2[28:],
        }

        logger.info("\nPer-feature importance:")
        for feat, imp in sorted(zip(FEATURES_V2, importances), key=lambda x: -x[1]):
            bar = "█" * int(imp * 50)
            logger.info(f"  {feat:35s} {imp:.4f}  {bar}")

        logger.info("\nPer-layer importance:")
        for layer_name, feats in layer_groups.items():
            layer_imp = sum(
                importances[FEATURES_V2.index(f)] for f in feats
                if f in FEATURES_V2
            )
            bar = "█" * int(layer_imp * 30)
            logger.info(f"  {layer_name:20s} {layer_imp:.4f}  {bar}")

    except Exception as e:
        logger.warning(f"Could not extract feature importances: {e}")


if __name__ == "__main__":
    train_v2()
