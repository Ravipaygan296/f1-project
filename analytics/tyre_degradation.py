"""
F1 Analytics — Tyre Degradation Analysis
Calculates degradation rate (seconds lost per lap) via linear regression
on lap times within a stint.
"""

import pandas as pd
import numpy as np


def degradation_rate(stint_laps: pd.DataFrame) -> float | None:
    """
    Linear regression slope of lap_time vs lap-number-within-stint.
    Positive slope = tyre getting slower (degrading) as expected.

    Args:
        stint_laps: DataFrame with columns [lap_in_stint, lap_time_seconds]

    Returns:
        Seconds lost per lap (float), or None if not enough data
    """
    if len(stint_laps) < 3:
        return None  # Not enough laps to fit a trend reliably

    clean = stint_laps.dropna(subset=["lap_time_seconds"])
    if len(clean) < 3:
        return None

    x = clean["lap_in_stint"].values
    y = clean["lap_time_seconds"].values

    # Remove outlier laps within the stint (e.g. safety car laps)
    median_time = np.median(y)
    mask = y < median_time * 1.3  # Keep laps within 30% of median
    if mask.sum() < 3:
        return None

    x, y = x[mask], y[mask]

    slope, _intercept = np.polyfit(x, y, 1)
    return round(float(slope), 4)


def compare_tyre_compounds(stints_with_laps: pd.DataFrame) -> pd.DataFrame:
    """
    Average degradation rate per compound across all stints provided.

    Args:
        stints_with_laps: DataFrame with columns
            [compound, stint_number, driver_id, lap_in_stint, lap_time_seconds]

    Returns:
        DataFrame with [compound, deg_rate_sec_per_lap, stint_count, avg_stint_length]
    """
    if stints_with_laps.empty:
        return pd.DataFrame(columns=["compound", "deg_rate_sec_per_lap", "stint_count", "avg_stint_length"])

    results = []
    for compound, group in stints_with_laps.groupby("compound"):
        stint_groups = group.groupby(["driver_id", "stint_number"])
        rates = []
        lengths = []
        for _, stint_df in stint_groups:
            rate = degradation_rate(stint_df)
            if rate is not None:
                rates.append(rate)
                lengths.append(len(stint_df))

        if rates:
            results.append({
                "compound": compound,
                "deg_rate_sec_per_lap": round(np.mean(rates), 4),
                "stint_count": len(rates),
                "avg_stint_length": round(np.mean(lengths), 1),
            })

    return pd.DataFrame(results).sort_values("deg_rate_sec_per_lap")


def tyre_life_analysis(stints_df: pd.DataFrame) -> pd.DataFrame:
    """
    Average stint length (in laps) per compound — how long each tyre
    actually lasts in practice.

    Args:
        stints_df: DataFrame with columns [compound, lap_start, lap_end]

    Returns:
        DataFrame with [compound, avg_life_laps, max_life_laps, usage_count]
    """
    if stints_df.empty:
        return pd.DataFrame(columns=["compound", "avg_life_laps", "max_life_laps", "usage_count"])

    stints_df = stints_df.copy()
    stints_df["stint_length"] = stints_df["lap_end"] - stints_df["lap_start"] + 1

    return (
        stints_df.groupby("compound")["stint_length"]
        .agg(
            avg_life_laps="mean",
            max_life_laps="max",
            usage_count="count",
        )
        .round(1)
        .reset_index()
        .sort_values("avg_life_laps", ascending=False)
    )
