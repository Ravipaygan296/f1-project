"""
F1 Analytics — Prediction Service
Loads the trained model and generates podium probabilities for any race.
"""

import os
import sys
import pickle
import logging
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prediction.features import FEATURES
from backend.models import engine_readonly

logger = logging.getLogger(__name__)

# Load model once at import time
MODEL = None
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.pkl")


def _get_model():
    global MODEL
    if MODEL is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. "
                "Run 'python prediction/train.py' first."
            )
        with open(MODEL_PATH, "rb") as f:
            MODEL = pickle.load(f)
        logger.info("Prediction model loaded successfully.")
    return MODEL


def predict_race(race_id: int) -> list[dict]:
    """
    Given a race_id, predict podium probability for every driver
    entered in that race. Returns sorted by podium probability desc.
    """
    model = _get_model()

    # Get the race context
    race = pd.read_sql("""
        SELECT ra.season, ra.round, ra.circuit_id,
               r.driver_id, r.constructor_id, r.grid,
               d.code, d.forename, d.surname,
               c.name as team_name, c.color_hex
        FROM results r
        JOIN races ra ON r.race_id = ra.race_id
        JOIN drivers d ON r.driver_id = d.driver_id
        JOIN constructors c ON r.constructor_id = c.constructor_id
        WHERE r.race_id = %(race_id)s
          AND r.grid IS NOT NULL AND r.grid > 0
    """, engine_readonly, params={"race_id": race_id})

    if race.empty:
        return []

    season = int(race["season"].iloc[0])
    round_ = int(race["round"].iloc[0])

    rows = []
    for _, entry in race.iterrows():
        driver_id = entry["driver_id"]
        constructor_id = entry["constructor_id"]
        grid = int(entry["grid"])

        # Recent form — last 5 races before this one
        recent = pd.read_sql("""
            SELECT AVG(r.points) as avg_pts
            FROM (
                SELECT r.points
                FROM results r
                JOIN races ra ON r.race_id = ra.race_id
                WHERE r.driver_id = %(driver)s
                  AND (ra.season < %(season)s
                       OR (ra.season = %(season)s AND ra.round < %(round)s))
                ORDER BY ra.season DESC, ra.round DESC
                LIMIT 5
            ) r
        """, engine_readonly, params={
            "driver": driver_id,
            "season": season,
            "round": round_
        })
        grid_pos = int(grid)

        # Driver pts per race (rolling last 5)
        d_pts = pd.read_sql("""
            SELECT AVG(sub.points) as val FROM (
                SELECT r.points FROM results r JOIN races ra ON r.race_id = ra.race_id
                WHERE r.driver_id = %(d)s AND (ra.season < %(s)s OR (ra.season = %(s)s AND ra.round < %(r)s))
                ORDER BY ra.season DESC, ra.round DESC LIMIT 5
            ) sub
        """, engine_readonly, params={"d": driver_id, "s": season, "r": round_})
        d_pts_per_race = float(d_pts["val"].iloc[0] or 0.0)

        # Driver podium rate (rolling last 10)
        d_pod = pd.read_sql("""
            SELECT AVG(CASE WHEN sub.position <= 3 THEN 1.0 ELSE 0.0 END) as val FROM (
                SELECT r.position FROM results r JOIN races ra ON r.race_id = ra.race_id
                WHERE r.driver_id = %(d)s AND (ra.season < %(s)s OR (ra.season = %(s)s AND ra.round < %(r)s))
                ORDER BY ra.season DESC, ra.round DESC LIMIT 10
            ) sub
        """, engine_readonly, params={"d": driver_id, "s": season, "r": round_})
        d_pod_rate = float(d_pod["val"].iloc[0] or 0.0)

        # Constructor podium rate (rolling last 10)
        c_pod = pd.read_sql("""
            SELECT AVG(CASE WHEN sub.position <= 3 THEN 1.0 ELSE 0.0 END) as val FROM (
                SELECT r.position FROM results r JOIN races ra ON r.race_id = ra.race_id
                WHERE r.constructor_id = %(c)s AND (ra.season < %(s)s OR (ra.season = %(s)s AND ra.round < %(r)s))
                ORDER BY ra.season DESC, ra.round DESC LIMIT 10
            ) sub
        """, engine_readonly, params={"c": constructor_id, "s": season, "r": round_})
        c_pod_rate = float(c_pod["val"].iloc[0] or 0.0)

        # Constructor pts per race (rolling last 5)
        c_pts = pd.read_sql("""
            SELECT AVG(sub.points) as val FROM (
                SELECT r.points FROM results r JOIN races ra ON r.race_id = ra.race_id
                WHERE r.constructor_id = %(c)s AND (ra.season < %(s)s OR (ra.season = %(s)s AND ra.round < %(r)s))
                ORDER BY ra.season DESC, ra.round DESC LIMIT 5
            ) sub
        """, engine_readonly, params={"c": constructor_id, "s": season, "r": round_})
        c_pts_per_race = float(c_pts["val"].iloc[0] or 0.0)

        # Circuit podium rate & avg pos (all time up to this race)
        circ = pd.read_sql("""
            SELECT AVG(CASE WHEN r.position <= 3 THEN 1.0 ELSE 0.0 END) as pod_rate,
                   AVG(r.position) as avg_pos
            FROM results r JOIN races ra ON r.race_id = ra.race_id
            WHERE r.driver_id = %(d)s AND ra.circuit_id = %(ci)s AND ra.season < %(s)s
        """, engine_readonly, params={"d": driver_id, "ci": entry["circuit_id"], "s": season})
        circ_pod_rate = float(circ["pod_rate"].iloc[0] or 0.0)
        circ_avg_pos = float(circ["avg_pos"].iloc[0] or 12.0)

        # DNF rate (rolling last 10)
        dnf = pd.read_sql("""
            SELECT AVG(CASE WHEN sub.status NOT LIKE '%%Finished%%' AND sub.status NOT LIKE '%%Lap%%' THEN 1.0 ELSE 0.0 END) as val
            FROM (
                SELECT r.status FROM results r JOIN races ra ON r.race_id = ra.race_id
                WHERE r.driver_id = %(d)s AND (ra.season < %(s)s OR (ra.season = %(s)s AND ra.round < %(r)s))
                ORDER BY ra.season DESC, ra.round DESC LIMIT 10
            ) sub
        """, engine_readonly, params={"d": driver_id, "s": season, "r": round_})
        dnf_rate = float(dnf["val"].iloc[0] or 0.1)

        features = pd.DataFrame([{
            "grid_position": grid_pos,
            "grid_squared": grid_pos ** 2,
            "is_top3_grid": int(grid_pos <= 3),
            "is_top6_grid": int(grid_pos <= 6),
            "driver_pts_per_race": d_pts_per_race,
            "driver_podium_rate": d_pod_rate,
            "constructor_podium_rate": c_pod_rate,
            "constructor_pts_per_race": c_pts_per_race,
            "circuit_podium_rate": circ_pod_rate,
            "circuit_avg_pos": circ_avg_pos,
            "dnf_rate": dnf_rate,
        }])

        proba = model.predict_proba(features[FEATURES])[0][1]

        rows.append({
            "driver_id": driver_id,
            "code": entry["code"],
            "name": f"{entry['forename']} {entry['surname']}",
            "team": entry["team_name"],
            "color": entry["color_hex"],
            "grid": grid,
            "podium_probability": round(float(proba), 3),
            "win_probability": round(float(proba) * 0.35, 3),
            "key_factor": _key_factor(grid, driver_form, circuit_avg),
        })

    return sorted(rows, key=lambda x: -x["podium_probability"])


def predict_next_race(season: int) -> dict:
    """
    Find the next upcoming race in a season and predict it.
    Falls back to the latest completed race if no upcoming races exist.
    """
    from datetime import date

    race_info = pd.read_sql("""
        SELECT race_id, round, name, race_date, circuit_id
        FROM races
        WHERE season = %(season)s
        ORDER BY round
    """, engine_readonly, params={"season": season})

    if race_info.empty:
        return {"error": "No races found for this season"}

    today = date.today()
    # Find next upcoming race (one with no results yet, or future date)
    for _, race_row in race_info.iterrows():
        result_count = pd.read_sql(
            "SELECT COUNT(*) as cnt FROM results WHERE race_id = %(rid)s",
            engine_readonly, params={"rid": int(race_row["race_id"])}
        )
        if result_count["cnt"].iloc[0] == 0:
            predictions = predict_race(int(race_row["race_id"]))
            # If no results yet (upcoming race), we can't predict from grid
            # Fall back to latest completed race
            if not predictions:
                continue
            return {
                "race_id": int(race_row["race_id"]),
                "round": int(race_row["round"]),
                "name": race_row["name"],
                "predictions": predictions,
            }

    # If all races completed, predict the last one
    last_race_id = int(race_info.iloc[-1]["race_id"])
    predictions = predict_race(last_race_id)
    return {
        "race_id": last_race_id,
        "round": int(race_info.iloc[-1]["round"]),
        "name": race_info.iloc[-1]["name"],
        "predictions": predictions,
    }


def _key_factor(grid: int, driver_form: float, circuit_avg: float) -> str:
    """Human-readable reason for the probability — shown in UI."""
    if grid <= 2:
        return "Front row start"
    elif driver_form > 15:
        return "Strong recent form"
    elif circuit_avg <= 4:
        return "Strong circuit history"
    elif grid > 15:
        return "Back of grid start"
    else:
        return "Mid-grid, form dependent"
