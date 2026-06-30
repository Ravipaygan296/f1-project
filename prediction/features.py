"""
F1 Analytics — Feature Engineering for Podium Prediction
Builds a feature matrix from the existing PostgreSQL database.
Uses SQLAlchemy engine from backend.models (same connection as the rest of the app).
"""

import os
import sys
import pandas as pd

# Ensure project root is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models import engine_readonly


def build_features(season_filter_end: int = 2023) -> pd.DataFrame:
    df = pd.read_sql("""
        SELECT 
            r.result_id, r.race_id, r.driver_id,
            r.constructor_id, r.grid, r.position,
            r.points, r.status,
            ra.season, ra.round, ra.circuit_id
        FROM results r
        JOIN races ra ON r.race_id = ra.race_id
        WHERE ra.season <= %(season_end)s
          AND r.grid IS NOT NULL
          AND r.grid > 0
          AND r.grid <= 20
    """, engine_readonly, params={"season_end": season_filter_end})
    
    # Target
    df["podium"] = (df["position"] <= 3).astype(int)
    df = df.sort_values(["driver_id", "season", "round"])
    
    # Feature 1: grid position — raw and squared
    df["grid_position"] = df["grid"]
    df["grid_squared"] = df["grid"] ** 2
    df["is_top3_grid"] = (df["grid"] <= 3).astype(int)
    df["is_top6_grid"] = (df["grid"] <= 6).astype(int)
    
    # Feature 2: driver points per race — rolling last 5
    df["driver_pts_per_race"] = (
        df.groupby("driver_id")["points"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
        .fillna(0)
    )
    
    # Feature 3: driver podium rate — rolling last 10 races
    df["driver_podium_rate"] = (
        df.groupby("driver_id")["podium"]
        .transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
        .fillna(0)
    )
    
    # Feature 4: constructor podium rate — rolling last 10
    df["constructor_podium_rate"] = (
        df.groupby("constructor_id")["podium"]
        .transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
        .fillna(0)
    )
    
    # Feature 5: circuit history — weighted by recency
    # Reverting to the simpler non-weighted history but including podium rate as the user requested for this specific build
    circuit_stats = (
        df.groupby(["driver_id", "circuit_id"])
        .apply(lambda g: pd.Series({
            "circuit_podium_rate": g["podium"].mean(),
            "circuit_avg_pos": g["position"].mean()
        }), include_groups=False)
        .reset_index()
    )
    df = df.merge(circuit_stats, on=["driver_id", "circuit_id"], how="left")
    df["circuit_podium_rate"] = df["circuit_podium_rate"].fillna(0)
    df["circuit_avg_pos"] = df["circuit_avg_pos"].fillna(12)
    
    # Feature 6: constructor points per race — rolling last 5
    df["constructor_pts_per_race"] = (
        df.groupby("constructor_id")["points"]
        .transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
        .fillna(0)
    )
    
    # Feature 7: DNF rate — rolling last 10
    df["is_dnf"] = (~df["status"].str.contains("Finished|Lap", na=False)).astype(int)
    df["dnf_rate"] = (
        df.groupby("driver_id")["is_dnf"]
        .transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
        .fillna(0.1)
    )
    
    return df

FEATURES = [
    "grid_position",
    "grid_squared",
    "is_top3_grid",
    "is_top6_grid",
    "driver_pts_per_race",
    "driver_podium_rate",
    "constructor_podium_rate",
    "constructor_pts_per_race",
    "circuit_podium_rate",
    "circuit_avg_pos",
    "dnf_rate",
]
