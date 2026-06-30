"""
F1 Analytics — Consistency Analysis
Measures how consistent a driver's lap times are across a race/stint.
Lower standard deviation = more consistent.
"""

import pandas as pd
import numpy as np


def compare_consistency(laps_df: pd.DataFrame, driver_ids: list[str]) -> pd.DataFrame:
    """
    Standard deviation of clean-air lap times.
    Lower stddev = more consistent driver across a stint.

    Args:
        laps_df: DataFrame with columns [driver_id, lap_time_seconds, is_pit_lap]
        driver_ids: List of driver IDs to compare

    Returns:
        DataFrame sorted by consistency_stddev (best first)
    """
    if laps_df.empty:
        return pd.DataFrame(columns=["driver_id", "consistency_stddev", "iqr", "lap_count"])

    clean = laps_df[~laps_df["is_pit_lap"]]
    clean = clean[clean["driver_id"].isin(driver_ids)]
    clean = clean.dropna(subset=["lap_time_seconds"])

    # Remove extreme outliers (safety cars, red flags)
    if not clean.empty:
        overall_median = clean["lap_time_seconds"].median()
        clean = clean[clean["lap_time_seconds"] < overall_median * 1.4]

    if clean.empty:
        return pd.DataFrame(columns=["driver_id", "consistency_stddev", "iqr", "lap_count"])

    def calc_iqr(x):
        return np.percentile(x, 75) - np.percentile(x, 25)

    return (
        clean.groupby("driver_id")["lap_time_seconds"]
        .agg(
            consistency_stddev="std",
            iqr=calc_iqr,
            lap_count="count",
        )
        .reset_index()
        .sort_values("consistency_stddev")
    )


def finishing_consistency(results_df: pd.DataFrame, driver_ids: list[str]) -> pd.DataFrame:
    """
    Standard deviation of finishing positions across multiple races.
    Lower = more consistent race-to-race results.

    Args:
        results_df: DataFrame with columns [driver_id, position]
        driver_ids: List of driver IDs

    Returns:
        DataFrame with [driver_id, avg_position, position_stddev, races_counted]
    """
    if results_df.empty:
        return pd.DataFrame(columns=["driver_id", "avg_position", "position_stddev", "races_counted"])

    filtered = results_df[results_df["driver_id"].isin(driver_ids)]
    filtered = filtered.dropna(subset=["position"])

    return (
        filtered.groupby("driver_id")["position"]
        .agg(
            avg_position="mean",
            position_stddev="std",
            races_counted="count",
        )
        .reset_index()
        .sort_values("position_stddev")
    )
