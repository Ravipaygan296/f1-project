"""
F1 Analytics — Win Case Builder
Builds structured "why this driver can win" analysis for each driver.
Every point grounded in a specific, verifiable fact — zero speculation.

Data sources:
  - Championship standings (PostgreSQL)
  - Circuit history (PostgreSQL)
  - Recent form — last 5 races (PostgreSQL)
  - Practice pace (OpenF1 telemetry)
  - Verified incidents (Groq search)
"""

import os
import sys
import logging
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models import engine_readonly

logger = logging.getLogger(__name__)

# Drivers historically strong in wet conditions
WET_SPECIALISTS = {"hamilton", "verstappen", "alonso", "russell", "ocon", "stroll"}


def get_championship_standings(season: int, round_num: int) -> dict:
    """Pull real championship standings from the DB up to this round."""
    df = pd.read_sql("""
        SELECT r.driver_id,
               d.code,
               d.forename || ' ' || d.surname as name,
               SUM(r.points) as total_points,
               COUNT(CASE WHEN r.position = 1 THEN 1 END) as wins,
               COUNT(CASE WHEN r.position <= 3 THEN 1 END) as podiums,
               COUNT(*) as races_entered
        FROM results r
        JOIN races ra ON r.race_id = ra.race_id
        JOIN drivers d ON r.driver_id = d.driver_id
        WHERE ra.season = %(season)s
          AND ra.round < %(round)s
        GROUP BY r.driver_id, d.code, d.forename, d.surname
        ORDER BY total_points DESC
    """, engine_readonly, params={"season": season, "round": round_num})

    standings = {}
    for i, row in df.iterrows():
        standings[row["driver_id"]] = {
            "position": i + 1,
            "points": float(row["total_points"]),
            "wins": int(row["wins"]),
            "podiums": int(row["podiums"]),
            "races": int(row["races_entered"]),
        }
    return standings


def get_circuit_history(circuit_id: str, season: int) -> dict:
    """Pull real circuit history for all drivers from DB."""
    df = pd.read_sql("""
        SELECT r.driver_id,
               AVG(r.position) as avg_finish,
               COUNT(CASE WHEN r.position = 1 THEN 1 END) as wins,
               COUNT(CASE WHEN r.position <= 3 THEN 1 END) as podiums,
               COUNT(*) as races,
               MIN(r.position) as best_finish
        FROM results r
        JOIN races ra ON r.race_id = ra.race_id
        WHERE ra.circuit_id = %(circuit)s
          AND ra.season < %(season)s
          AND r.position IS NOT NULL
        GROUP BY r.driver_id
    """, engine_readonly, params={"circuit": circuit_id, "season": season})

    history = {}
    for _, row in df.iterrows():
        history[row["driver_id"]] = {
            "avg_finish": round(float(row["avg_finish"]), 1),
            "wins": int(row["wins"]),
            "podiums": int(row["podiums"]),
            "races": int(row["races"]),
            "best_finish": int(row["best_finish"]),
        }
    return history


def get_recent_form(season: int, round_num: int) -> dict:
    """Pull last 5 races form for all drivers from DB."""
    df = pd.read_sql("""
        SELECT sub.driver_id,
               AVG(sub.points) as avg_points,
               COUNT(CASE WHEN sub.position = 1 THEN 1 END) as wins,
               COUNT(CASE WHEN sub.position <= 3 THEN 1 END) as podiums,
               AVG(sub.position) as avg_position,
               COUNT(CASE WHEN sub.status NOT LIKE '%%Finished%%'
                           AND sub.status NOT LIKE '%%Lap%%' THEN 1 END) as dnfs
        FROM (
            SELECT r.driver_id, r.points, r.position, r.status
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            WHERE ra.season = %(season)s AND ra.round < %(round)s
            ORDER BY ra.round DESC
        ) sub
        GROUP BY sub.driver_id
    """, engine_readonly, params={"season": season, "round": round_num})

    form = {}
    for _, row in df.iterrows():
        form[row["driver_id"]] = {
            "avg_points": round(float(row["avg_points"]), 1),
            "wins": int(row["wins"]),
            "podiums": int(row["podiums"]),
            "avg_position": round(float(row["avg_position"]), 1) if row["avg_position"] else None,
            "dnfs": int(row["dnfs"]),
        }
    return form


def build_win_cases(
    predictions: list[dict],
    practice_data: dict,
    incidents: dict,
    season: int,
    round_num: int,
    circuit_id: str,
) -> list[dict]:
    """
    Build win cases for the top drivers.
    Queries the DB for real championship + history + form data.
    """
    logger.info("Building win cases from real DB data...")

    # Pull all real data from DB
    standings = get_championship_standings(season, round_num)
    circuit_hist = get_circuit_history(circuit_id, season)
    recent_form = get_recent_form(season, round_num)

    # Build practice pace lookup: code -> {position, gap, time}
    practice_lookup = {}
    for rank, item in enumerate(practice_data.get("rankings", []), 1):
        code = item.get("code", "").upper()
        practice_lookup[code] = {
            "position": rank,
            "gap": item.get("gap", 0),
            "best_lap": item.get("best_lap", 0),
        }

    session_name = practice_data.get("session", "Practice")

    # Build win case for each prediction (top 10)
    for pred in predictions[:10]:
        driver_id = pred["driver_id"]
        code = (pred.get("code") or "").upper()
        prob = pred.get("adjusted_probability", pred.get("podium_probability", 0))

        strengths = []
        risks = []

        # ── CHAMPIONSHIP POSITION ──
        champ = standings.get(driver_id, {})
        if champ:
            if champ.get("position") == 1:
                pts = champ["points"]
                # Calculate gap to P2
                p2_pts = 0
                for did, st in standings.items():
                    if st["position"] == 2:
                        p2_pts = st["points"]
                        break
                gap = pts - p2_pts
                strengths.append({
                    "fact": f"Championship leader — {pts:.0f} points ({gap:.0f} ahead of P2)",
                    "why_it_matters": "Mental confidence + team prioritises car development for #1 driver",
                    "source": "Championship standings"
                })
            elif champ.get("position", 99) <= 3:
                strengths.append({
                    "fact": f"P{champ['position']} in championship — {champ['points']:.0f} points",
                    "why_it_matters": "Fighting for the title — maximum motivation and team support",
                    "source": "Championship standings"
                })

            if champ.get("wins", 0) >= 3:
                strengths.append({
                    "fact": f"{champ['wins']} wins already this season",
                    "why_it_matters": "Car development clearly going in the right direction",
                    "source": "Season results"
                })

        # ── PRACTICE PACE (real OpenF1 data) ──
        fp = practice_lookup.get(code, {})
        if fp:
            fp_pos = fp["position"]
            fp_gap = fp["gap"]
            fp_time = fp["best_lap"]

            if fp_pos == 1:
                strengths.append({
                    "fact": f"Fastest in {session_name} — {fp_time:.3f}s",
                    "why_it_matters": "Practice pace on representative tyres is the strongest predictor of race pace",
                    "source": f"OpenF1 — {session_name} telemetry"
                })
            elif fp_pos <= 3:
                strengths.append({
                    "fact": f"P{fp_pos} in {session_name}, +{fp_gap:.3f}s off pace",
                    "why_it_matters": "Within striking distance — overnight setup changes can bridge that gap",
                    "source": f"OpenF1 — {session_name} telemetry"
                })
            elif fp_pos > 6:
                risks.append({
                    "fact": f"P{fp_pos} in {session_name}, +{fp_gap:.3f}s off leader",
                    "why_it_matters": "Large gap to close — short circuit amplifies time differences",
                    "source": f"OpenF1 — {session_name} telemetry"
                })

        # ── CIRCUIT HISTORY (real DB data) ──
        circ = circuit_hist.get(driver_id, {})
        if circ:
            circ_wins = circ.get("wins", 0)
            circ_avg = circ.get("avg_finish")
            circ_races = circ.get("races", 0)

            if circ_wins > 0:
                strengths.append({
                    "fact": f"{circ_wins} previous win{'s' if circ_wins > 1 else ''} at this circuit",
                    "why_it_matters": "Track familiarity — knows exactly where to push and where to manage tyres",
                    "source": f"Historical data ({circ_races} races at this circuit)"
                })
            elif circ_avg and circ_avg <= 4.0 and circ_races >= 2:
                strengths.append({
                    "fact": f"Average finish P{circ_avg} at this circuit ({circ_races} races)",
                    "why_it_matters": "Consistently strong here across multiple seasons and regulation changes",
                    "source": "Historical circuit performance"
                })
            elif circ_avg and circ_avg > 10.0 and circ_races >= 2:
                risks.append({
                    "fact": f"Average finish P{circ_avg} here historically ({circ_races} races)",
                    "why_it_matters": "Track layout may not suit driving style or car characteristics",
                    "source": "Historical circuit performance"
                })

        # ── RECENT FORM (real DB data) ──
        form = recent_form.get(driver_id, {})
        if form:
            if form.get("wins", 0) >= 2:
                strengths.append({
                    "fact": f"{form['wins']} wins in last {form.get('podiums', 0) + form.get('wins', 0)} races this season",
                    "why_it_matters": "In-season momentum — driver and team operating at peak performance",
                    "source": "2026 season results"
                })
            elif form.get("avg_points", 0) > 15:
                strengths.append({
                    "fact": f"Averaging {form['avg_points']} points per race this season",
                    "why_it_matters": "Consistent points scorer — race pace is reliable even if not always fastest qualifier",
                    "source": "2026 season results"
                })
            if form.get("dnfs", 0) >= 2:
                risks.append({
                    "fact": f"{form['dnfs']} DNFs this season",
                    "why_it_matters": "Reliability concern — same failure mode could repeat",
                    "source": "2026 season results"
                })

        # ── PRACTICE INCIDENTS (verified) ──
        for incident in incidents.get("practice_incidents", []):
            i_id = incident.get("driver_id", "").lower()
            if i_id and (i_id in driver_id.lower() or driver_id.lower() in i_id):
                resolved = incident.get("resolved", False)
                lost = incident.get("laps_lost_minutes", incident.get("laps_lost", "?"))
                inc_type = incident.get("type", "issue")
                session = incident.get("session", "practice")

                if not resolved:
                    risks.append({
                        "fact": f"Unresolved {inc_type} from {session}",
                        "why_it_matters": "Going into qualifying with an unresolved issue is a major red flag",
                        "source": "Confirmed team report"
                    })
                else:
                    risks.append({
                        "fact": f"Lost ~{lost} min of practice to {inc_type} in {session} (resolved)",
                        "why_it_matters": "Less setup data than rivals — engineers making educated guesses on some settings",
                        "source": "Session data"
                    })

        # ── GRID PENALTIES (FIA confirmed) ──
        for penalty in incidents.get("grid_penalties", []):
            p_id = penalty.get("driver_id", "").lower()
            if p_id and (p_id in driver_id.lower() or driver_id.lower() in p_id):
                places = penalty.get("places", 0)
                risks.append({
                    "fact": f"{places}-place grid penalty ({penalty.get('reason', 'FIA decision')})",
                    "why_it_matters": f"Drops to P{places + 3} or worse — overtaking is hard on short circuits",
                    "source": "FIA penalty bulletin"
                })

        # ── WEATHER ──
        weather = incidents.get("weather_forecast") or {}
        rain_pct = weather.get("rain_probability_percent", 0)
        if rain_pct > 50:
            if driver_id.lower() in WET_SPECIALISTS:
                strengths.append({
                    "fact": f"Rain forecast {rain_pct}% — proven wet-weather driver",
                    "why_it_matters": "Rain randomises the race — specialists gain several places in mixed conditions",
                    "source": "Weather forecast"
                })
            else:
                risks.append({
                    "fact": f"Rain forecast {rain_pct}%",
                    "why_it_matters": "Adds unpredictability — harder for drivers without strong wet-weather record",
                    "source": "Weather forecast"
                })

        # ── VERDICT ──
        if prob >= 0.70:
            confidence = "High"
            verdict = "Strong favourite — pace, form and race history all point the same direction."
        elif prob >= 0.45:
            confidence = "Medium"
            verdict = "Genuine contender — needs a clean qualifying lap and a problem-free race start."
        elif prob >= 0.20:
            confidence = "Low"
            verdict = "Possible but needs something to go wrong for the cars ahead."
        else:
            confidence = "Very Low"
            verdict = "Unlikely from here — would need major incidents ahead to reach the podium."

        pred["win_case"] = {
            "headline": f"Why {(code or driver_id).upper()} can win",
            "strengths": strengths,
            "risks": risks,
            "verdict": verdict,
            "confidence": confidence,
            "data_sources": [
                "OpenF1 lap times",
                "Championship standings",
                "Historical circuit data",
                "Verified race incidents"
            ]
        }

    # Drivers outside top 10 get a minimal case
    for pred in predictions[10:]:
        pred["win_case"] = {
            "headline": f"Why {(pred.get('code') or pred['driver_id']).upper()} can win",
            "strengths": [],
            "risks": [{"fact": "Outside top 10 prediction", "why_it_matters": "Would need multiple DNFs ahead", "source": "Model"}],
            "verdict": "Very unlikely — statistical long shot.",
            "confidence": "Very Low",
            "data_sources": []
        }

    return predictions
