"""
F1 Analytics — Pace Comparison
Computes median/mean race pace for drivers, excluding pit laps and
safety car laps (which distort raw pace and aren't 'real' pace).
"""

import pandas as pd


def compare_pace(laps_df: pd.DataFrame, driver_ids: list[str]) -> pd.DataFrame:
    """
    Median lap time per driver, EXCLUDING pit laps.

    Args:
        laps_df: DataFrame with columns [driver_id, lap_time_seconds, is_pit_lap]
        driver_ids: List of driver IDs to compare

    Returns:
        DataFrame with columns [driver_id, median_pace, mean_pace, fastest_lap, lap_count]
    """
    if laps_df.empty:
        return pd.DataFrame(columns=["driver_id", "median_pace", "mean_pace", "fastest_lap", "lap_count"])

    clean = laps_df[~laps_df["is_pit_lap"]]
    clean = clean[clean["driver_id"].isin(driver_ids)]
    clean = clean.dropna(subset=["lap_time_seconds"])

    # Remove outlier laps (safety car, very slow laps > 150% of median)
    if not clean.empty:
        overall_median = clean["lap_time_seconds"].median()
        clean = clean[clean["lap_time_seconds"] < overall_median * 1.5]

    if clean.empty:
        return pd.DataFrame(columns=["driver_id", "median_pace", "mean_pace", "fastest_lap", "lap_count"])

    return (
        clean.groupby("driver_id")["lap_time_seconds"]
        .agg(
            median_pace="median",
            mean_pace="mean",
            fastest_lap="min",
            lap_count="count",
        )
        .reset_index()
        .sort_values("median_pace")
    )


def lap_by_lap_comparison(laps_df: pd.DataFrame, driver_ids: list[str]) -> pd.DataFrame:
    """
    Returns lap-by-lap times for specified drivers, suitable for charting.

    Returns:
        DataFrame with columns [lap_number, driver_id, lap_time_seconds]
    """
    if laps_df.empty:
        return pd.DataFrame(columns=["lap_number", "driver_id", "lap_time_seconds"])

    filtered = laps_df[laps_df["driver_id"].isin(driver_ids)]
    filtered = filtered.dropna(subset=["lap_time_seconds"])

    return filtered[["lap_number", "driver_id", "lap_time_seconds"]].sort_values(["driver_id", "lap_number"])


def pace_delta(laps_df: pd.DataFrame, driver_a: str, driver_b: str) -> pd.DataFrame:
    """
    Compute per-lap delta between two drivers (A time - B time).
    Negative = driver A faster on that lap.

    Returns:
        DataFrame with columns [lap_number, delta_seconds]
    """
    a_laps = laps_df[laps_df["driver_id"] == driver_a][["lap_number", "lap_time_seconds"]].set_index("lap_number")
    b_laps = laps_df[laps_df["driver_id"] == driver_b][["lap_number", "lap_time_seconds"]].set_index("lap_number")

    merged = a_laps.join(b_laps, lsuffix="_a", rsuffix="_b", how="inner")
    merged["delta_seconds"] = merged["lap_time_seconds_a"] - merged["lap_time_seconds_b"]
    merged["cumulative_delta"] = merged["delta_seconds"].cumsum()

    return merged[["delta_seconds", "cumulative_delta"]].reset_index()
