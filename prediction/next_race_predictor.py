"""
F1 Analytics — RAG-Augmented Next Race Predictor (v2)
Grounded in real data — zero speculation.

Pipeline:
  1. Find next race from DB
  2. Get baseline ML predictions (grid + form + history)
  3. Fetch REAL practice lap times from OpenF1
  4. Search for VERIFIED incidents (penalties, crashes, weather)
  5. Apply rule-based adjustments with exact formulas
  6. Every adjustment cites its source
"""

import os
import sys
import json
import logging
import pandas as pd
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prediction.features import FEATURES
from prediction.news_fetcher import get_practice_pace, search_verified_incidents
from prediction.adjust import apply_real_adjustments
from prediction.win_reasons import build_win_cases
from backend.models import engine_readonly

logger = logging.getLogger(__name__)

# Cache for 1 hour — practice times don't change every second
CACHE_FILE = Path(__file__).parent / "next_race_cache.json"
CACHE_TTL_SECONDS = 3600


def _get_model():
    from prediction.serve import _get_model
    return _get_model()


def get_next_race_info(season: int) -> dict | None:
    """Find the next upcoming race in the season."""
    today = date.today()

    # Future race
    future = pd.read_sql("""
        SELECT ra.race_id, ra.round, ra.name, ra.race_date, ra.season,
               ra.circuit_id, ci.name as circuit_name, ci.country
        FROM races ra
        JOIN circuits ci ON ra.circuit_id = ci.circuit_id
        WHERE ra.season = %(season)s AND ra.race_date >= %(today)s
        ORDER BY ra.round ASC
        LIMIT 1
    """, engine_readonly, params={"season": season, "today": today})

    if not future.empty:
        return future.iloc[0].to_dict()

    # Fallback: last completed race (for testing/demo)
    latest = pd.read_sql("""
        SELECT ra.race_id, ra.round, ra.name, ra.race_date, ra.season,
               ra.circuit_id, ci.name as circuit_name, ci.country
        FROM races ra
        JOIN circuits ci ON ra.circuit_id = ci.circuit_id
        JOIN results r ON ra.race_id = r.race_id
        WHERE ra.season = %(season)s
        GROUP BY ra.race_id, ra.round, ra.name, ra.race_date, ra.season,
                 ra.circuit_id, ci.name, ci.country
        ORDER BY ra.round DESC
        LIMIT 1
    """, engine_readonly, params={"season": season})

    return latest.iloc[0].to_dict() if not latest.empty else None


def get_driver_lineup(season: int) -> pd.DataFrame:
    """
    Before qualifying: use current championship position as grid proxy.
    After qualifying: use actual quali result from json.
    """
    import json
    from pathlib import Path
    
    # Read championship standing for estimate
    grid_df = pd.read_sql("""
        SELECT 
            r.driver_id,
            d.code,
            d.forename,
            d.surname,
            d.number as driver_number,
            r.constructor_id,
            con.name as team_name,
            con.color_hex,
            ROW_NUMBER() OVER (
                ORDER BY SUM(r.points) DESC
            ) as estimated_grid
        FROM results r
        JOIN drivers d ON r.driver_id = d.driver_id
        JOIN constructors con ON r.constructor_id = con.constructor_id
        JOIN races ra ON r.race_id = ra.race_id
        WHERE ra.season = (SELECT MAX(season) FROM races WHERE season <= %(season)s)
        GROUP BY r.driver_id, d.code, d.forename, d.surname, d.number,
                 r.constructor_id, con.name, con.color_hex
        ORDER BY estimated_grid ASC
    """, engine_readonly, params={"season": season})

    # Apply real qualifying if available
    quali_file = Path("prediction/qualifying_grid.json")
    quali_grid = {}
    if quali_file.exists():
        quali_grid = json.loads(quali_file.read_text())

    final_grid = []
    for _, row in grid_df.iterrows():
        driver_num = str(row["driver_number"])
        if driver_num in quali_grid:
            row["grid"] = quali_grid[driver_num]
        else:
            row["grid"] = row["estimated_grid"]
        final_grid.append(row)

    return pd.DataFrame(final_grid)


def _get_v2_model():
    import pickle
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_v2.pkl")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found at {model_path}. Run 'python prediction/train_v2.py' first.")
    with open(model_path, "rb") as f:
        return pickle.load(f)


def build_baseline(race_info: dict, lineup: pd.DataFrame) -> list[dict]:
    """Generate 12-layer ML baseline predictions for every driver."""
    from prediction.features_v2 import build_upcoming_race_features, FEATURES_V2
    
    try:
        model = _get_v2_model()
    except FileNotFoundError:
        logger.warning("v2 model not found, falling back to v1 (NOT recommended).")
        from prediction.serve import _get_model
        model = _get_model()
        
    season = int(race_info.get("season", 2026))
    round_ = int(race_info["round"])
    circuit_id = race_info["circuit_id"]

    # Generate the 12-layer feature matrix
    features_df = build_upcoming_race_features(season, round_, circuit_id, lineup)

    predictions = []
    for i, (_, drv) in enumerate(features_df.iterrows()):
        driver_id = drv["driver_id"]
        grid_pos = int(drv["grid"])

        # Extract features vector
        try:
            x = drv[FEATURES_V2].to_frame().T.astype(float)
            proba = model.predict_proba(x)[0][1]
        except Exception as e:
            logger.error(f"Error predicting for {drv['code']}: {e}")
            proba = 0.0

        predictions.append({
            "driver_id": driver_id,
            "code": drv["code"],
            "name": f"{drv['forename']} {drv['surname']}",
            "team": drv.get("team_name", ""),
            "color": drv.get("color_hex", ""),
            "driver_number": drv.get("driver_number"),
            "grid": grid_pos,
            "podium_probability": round(float(proba), 3),
            "win_probability": round(float(proba) * 0.35, 3),
            # Send raw features back for the UI explanation
            "features": {
                "champ_gap": round(float(drv.get("champ_gap_to_leader", 0)), 1),
                "circuit_history": round(float(drv.get("circuit_weighted_pos", 12)), 1),
                "dnf_rate": round(float(drv.get("dnf_rate", 0)), 2),
                "grid": grid_pos
            }
        })

    return sorted(predictions, key=lambda x: -x["podium_probability"])


def predict_next_race_full(season: int = 2026) -> dict:
    """
    Full RAG pipeline:
      1. Next race from DB
      2. Baseline ML predictions
      3. Real OpenF1 practice lap times
      4. Verified incidents from Groq search
      5. Rule-based adjustments (exact formulas, cited sources)
    """
    # Check cache (disabled temporarily to force refresh)
    # cached = _read_cache()
    # if cached:
    #     return cached

    # 1. Find the race
    race_info = get_next_race_info(season)
    if not race_info:
        return {"error": "No upcoming races found"}

    race_name = race_info["name"]
    race_date = str(race_info.get("race_date", ""))
    circuit_name = race_info.get("circuit_name", race_name)
    round_ = int(race_info["round"])

    logger.info(f"=== Predicting: {race_name} ({race_date}) ===")

    # 2. Get driver lineup
    lineup = get_driver_lineup(season)
    if lineup.empty:
        return {"error": "No driver data for this season"}

    # 3. Baseline ML predictions
    logger.info("Step 1: Building ML baseline...")
    baseline = build_baseline(race_info, lineup)

    # 4. Fetch REAL practice pace from OpenF1
    logger.info("Step 2: Fetching OpenF1 practice times...")
    practice_data = get_practice_pace(season, race_name)

    # 5. Search for verified incidents
    logger.info("Step 3: Searching verified incidents...")
    incidents = search_verified_incidents(circuit_name, race_date)

    # 6. Apply rule-based adjustments
    logger.info("Step 4: Applying fact-based adjustments...")
    final = apply_real_adjustments(baseline, practice_data, incidents)

    # 7. Build "why this driver can win" cases from real DB data
    logger.info("Step 5: Building win cases from DB...")
    final = build_win_cases(
        final, practice_data, incidents,
        season=season, round_num=round_,
        circuit_id=race_info["circuit_id"]
    )

    # Build practice summary for frontend
    practice_summary = []
    for r in practice_data.get("rankings", [])[:10]:
        practice_summary.append({
            "position": practice_data["rankings"].index(r) + 1,
            "code": r.get("code", ""),
            "name": r.get("name", ""),
            "team": r.get("team", ""),
            "best_lap": r["best_lap"],
            "gap": r.get("gap", 0),
        })

    result = {
        "race": race_name,
        "circuit": race_info["circuit_id"],
        "circuit_name": circuit_name,
        "country": race_info.get("country", ""),
        "round": int(race_info["round"]),
        "date": race_date,
        "predictions": final[:20],
        "practice_pace": {
            "session": practice_data.get("session"),
            "top_10": practice_summary,
            "weather": practice_data.get("weather"),
        },
        "incidents": {
            "grid_penalties": incidents.get("grid_penalties", []),
            "back_of_grid": incidents.get("back_of_grid", []),
            "practice_incidents": incidents.get("practice_incidents", []),
            "weather_forecast": incidents.get("weather_forecast"),
            "confirmed_facts": incidents.get("confirmed_facts", []),
        },
        "disclaimer": "Statistical model + verified facts. Every adjustment cites its source. Not a guarantee.",
        "generated_at": datetime.utcnow().isoformat(),
        "data_sources": [
            "ML model trained on 2018-2022 (GradientBoosting + Isotonic Calibration)",
            "OpenF1 practice session lap times (real telemetry)",
            "Verified race incidents (Groq LLaMA 3.3 70B search)",
            "Historical circuit performance (PostgreSQL database)",
        ],
    }

    # Cache result
    _write_cache(result)
    return result


def _read_cache() -> dict | None:
    """Read cached prediction if fresh enough."""
    try:
        if CACHE_FILE.exists():
            data = json.loads(CACHE_FILE.read_text())
            cached_at = datetime.fromisoformat(data["generated_at"])
            age = (datetime.utcnow() - cached_at).total_seconds()
            if age < CACHE_TTL_SECONDS:
                logger.info(f"Using cached prediction ({int(age)}s old)")
                return data
    except Exception:
        pass
    return None


def _write_cache(data: dict):
    """Cache prediction result."""
    try:
        CACHE_FILE.write_text(json.dumps(data, default=str))
    except Exception as e:
        logger.warning(f"Cache write failed: {e}")
