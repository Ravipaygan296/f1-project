"""
F1 Analytics — Strategy Analysis
Pit stop comparisons, undercut detection, and historical strategy patterns.
"""

import pandas as pd
import numpy as np


def compare_strategy(pitstops_df: pd.DataFrame, driver_ids: list[str]) -> pd.DataFrame:
    """
    Pit stop count, average stop duration, and lap numbers chosen.

    Args:
        pitstops_df: DataFrame with columns [driver_id, stop_number, lap, duration_seconds]
        driver_ids: List of driver IDs to compare

    Returns:
        DataFrame with [driver_id, stop_count, avg_duration, fastest_stop, stop_laps]
    """
    if pitstops_df.empty:
        return pd.DataFrame(columns=["driver_id", "stop_count", "avg_duration", "fastest_stop", "stop_laps"])

    sub = pitstops_df[pitstops_df["driver_id"].isin(driver_ids)]
    if sub.empty:
        return pd.DataFrame(columns=["driver_id", "stop_count", "avg_duration", "fastest_stop", "stop_laps"])

    return (
        sub.groupby("driver_id")
        .agg(
            stop_count=("stop_number", "count"),
            avg_duration=("duration_seconds", "mean"),
            fastest_stop=("duration_seconds", "min"),
            stop_laps=("lap", lambda x: sorted(x.tolist())),
        )
        .reset_index()
    )


def pit_window_analysis(pitstops_df: pd.DataFrame, circuit_id: str = None) -> pd.DataFrame:
    """
    Distribution of pit stop laps — tells you the 'typical pit window' at a track.

    Args:
        pitstops_df: DataFrame with columns [race_id, driver_id, stop_number, lap]
        circuit_id: Optional filter (requires a circuit_id column or pre-filtering)

    Returns:
        DataFrame with [stop_number, median_lap, q25_lap, q75_lap, total_stops]
    """
    if pitstops_df.empty:
        return pd.DataFrame(columns=["stop_number", "median_lap", "q25_lap", "q75_lap", "total_stops"])

    return (
        pitstops_df.groupby("stop_number")["lap"]
        .agg(
            median_lap="median",
            q25_lap=lambda x: np.percentile(x, 25),
            q75_lap=lambda x: np.percentile(x, 75),
            total_stops="count",
        )
        .round(0)
        .reset_index()
    )


def stop_count_distribution(pitstops_df: pd.DataFrame) -> pd.DataFrame:
    """
    How many stops is 'normal' at this race/circuit?

    Returns:
        DataFrame with [num_stops, frequency, percentage]
    """
    if pitstops_df.empty:
        return pd.DataFrame(columns=["num_stops", "frequency", "percentage"])

    driver_stops = (
        pitstops_df.groupby(["race_id", "driver_id"])["stop_number"]
        .max()
        .reset_index()
        .rename(columns={"stop_number": "num_stops"})
    )

    dist = (
        driver_stops["num_stops"]
        .value_counts()
        .reset_index()
    )
    dist.columns = ["num_stops", "frequency"]
    dist["percentage"] = (dist["frequency"] / dist["frequency"].sum() * 100).round(1)
    return dist.sort_values("num_stops")


def undercut_analysis(laps_df: pd.DataFrame, pitstops_df: pd.DataFrame) -> list[dict]:
    """
    Detect undercut attempts: when driver A pits first while close to driver B,
    and check if A gained position within N laps.

    An undercut is successful when:
    1. Driver A is behind driver B (or within ~2s)
    2. Driver A pits first
    3. Driver A emerges ahead of (or closer to) driver B

    Returns:
        List of undercut events with {race_id, attacker, defender, success, lap}
    """
    if laps_df.empty or pitstops_df.empty:
        return []

    events = []
    for race_id in pitstops_df["race_id"].unique():
        race_pits = pitstops_df[pitstops_df["race_id"] == race_id].sort_values("lap")
        race_laps = laps_df[laps_df["race_id"] == race_id]

        if race_laps.empty:
            continue

        # Look at pairs of pit stops within 3 laps of each other
        for i, pit_a in race_pits.iterrows():
            nearby = race_pits[
                (race_pits["driver_id"] != pit_a["driver_id"]) &
                (race_pits["lap"] > pit_a["lap"]) &
                (race_pits["lap"] <= pit_a["lap"] + 3)
            ]

            for _, pit_b in nearby.iterrows():
                # A pitted first — check if they gained
                pre_lap = max(1, pit_a["lap"] - 1)
                post_lap = pit_b["lap"] + 2

                a_pre = race_laps[
                    (race_laps["driver_id"] == pit_a["driver_id"]) &
                    (race_laps["lap_number"] == pre_lap)
                ]
                b_pre = race_laps[
                    (race_laps["driver_id"] == pit_b["driver_id"]) &
                    (race_laps["lap_number"] == pre_lap)
                ]
                a_post = race_laps[
                    (race_laps["driver_id"] == pit_a["driver_id"]) &
                    (race_laps["lap_number"] == post_lap)
                ]
                b_post = race_laps[
                    (race_laps["driver_id"] == pit_b["driver_id"]) &
                    (race_laps["lap_number"] == post_lap)
                ]

                if a_pre.empty or b_pre.empty or a_post.empty or b_post.empty:
                    continue

                pos_a_pre = a_pre.iloc[0].get("position")
                pos_b_pre = b_pre.iloc[0].get("position")
                pos_a_post = a_post.iloc[0].get("position")
                pos_b_post = b_post.iloc[0].get("position")

                if pos_a_pre is None or pos_b_pre is None:
                    continue

                # A was behind B before pit, check if A is now ahead
                if pos_a_pre > pos_b_pre:  # A was behind
                    success = pos_a_post is not None and pos_b_post is not None and pos_a_post < pos_b_post
                    events.append({
                        "race_id": race_id,
                        "attacker": pit_a["driver_id"],
                        "defender": pit_b["driver_id"],
                        "attacker_pit_lap": pit_a["lap"],
                        "defender_pit_lap": pit_b["lap"],
                        "success": success,
                    })

    return events


def compound_win_rate(results_df: pd.DataFrame, stints_df: pd.DataFrame) -> pd.DataFrame:
    """
    Which tyre compound was the winner on for the final stint?
    Shows which compound is associated with winning at a track.

    Returns:
        DataFrame with [compound, wins, races, win_rate]
    """
    if results_df.empty or stints_df.empty:
        return pd.DataFrame(columns=["compound", "wins", "races", "win_rate"])

    # Get winner of each race
    winners = results_df[results_df["position"] == 1][["race_id", "driver_id"]]

    # Get final stint compound for each winner
    final_stints = (
        stints_df.sort_values("stint_number", ascending=False)
        .groupby(["race_id", "driver_id"])
        .first()
        .reset_index()[["race_id", "driver_id", "compound"]]
    )

    merged = winners.merge(final_stints, on=["race_id", "driver_id"], how="inner")

    if merged.empty:
        return pd.DataFrame(columns=["compound", "wins", "races", "win_rate"])

    total_races = merged["race_id"].nunique()
    result = (
        merged.groupby("compound")["race_id"]
        .count()
        .reset_index()
        .rename(columns={"race_id": "wins"})
    )
    result["races"] = total_races
    result["win_rate"] = (result["wins"] / total_races * 100).round(1)

    return result.sort_values("wins", ascending=False)
