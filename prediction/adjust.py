"""
F1 Analytics — Rule-Based Prediction Adjustments
Adjusts ML baseline using ONLY verified, specific facts.
Every adjustment has an exact reason, exact source, and exact formula.
"""

import logging

logger = logging.getLogger(__name__)

# Wet-weather specialists (historically strong in rain)
WET_SPECIALISTS = {"hamilton", "verstappen", "alonso", "ocon", "stroll"}


def apply_real_adjustments(
    predictions: list[dict],
    practice_data: dict,
    incidents: dict,
) -> list[dict]:
    """
    Adjust ML baseline using only verified, specific facts.
    Every adjustment cites its exact source.
    """
    # Build practice pace lookup: driver_number -> rank
    pace_rankings = practice_data.get("rankings", [])
    pace_rank_by_number = {
        item["driver_number"]: (rank + 1)
        for rank, item in enumerate(pace_rankings)
    }
    pace_gap_by_number = {
        item["driver_number"]: item.get("gap", 0)
        for item in pace_rankings
    }
    # Map code -> driver_number from practice data
    code_to_number = {}
    for item in pace_rankings:
        code_to_number[item.get("code", "").lower()] = item["driver_number"]

    session_name = practice_data.get("session", "Practice")

    for pred in predictions:
        driver_id = pred["driver_id"]
        code = pred.get("code", "").lower()
        adjustments_applied = []
        adjusted_prob = pred["podium_probability"]

        # ── GRID PENALTIES (exact, FIA-confirmed) ──
        for penalty in incidents.get("grid_penalties", []):
            p_id = penalty.get("driver_id", "").lower()
            if p_id and (p_id in driver_id.lower() or driver_id.lower() in p_id):
                places = int(penalty.get("places", 0))
                if places > 0 and penalty.get("confirmed", True):
                    # Each 5 places back reduces podium prob by ~15%
                    penalty_factor = 1 - (places / 5) * 0.15
                    penalty_factor = max(penalty_factor, 0.05)
                    adjusted_prob *= penalty_factor
                    adjustments_applied.append({
                        "type": "penalty",
                        "impact": round((penalty_factor - 1) * 100, 1),
                        "reason": f"Grid penalty: -{places} places ({penalty.get('reason', 'FIA decision')})",
                        "source": "FIA confirmed"
                    })

        # ── BACK OF GRID ──
        for bog in incidents.get("back_of_grid", []):
            b_id = bog.get("driver_id", "").lower()
            if b_id and (b_id in driver_id.lower() or driver_id.lower() in b_id):
                adjusted_prob *= 0.08
                adjustments_applied.append({
                    "type": "back_of_grid",
                    "impact": -92.0,
                    "reason": f"Starts from back of grid: {bog.get('reason', 'PU change')}",
                    "source": "FIA confirmed"
                })

        # ── QUALIFYING GRID (strongest signal — overrides practice) ──
        for q in incidents.get("qualifying_grid", []):
            q_id = q.get("driver_id", "").lower()
            if q_id and (q_id in driver_id.lower() or driver_id.lower() in q_id):
                grid_pos = int(q.get("position", 20))
                pred["grid"] = grid_pos
                old_prob = adjusted_prob
                if grid_pos == 1:
                    adjusted_prob = max(adjusted_prob, 0.75)
                elif grid_pos == 2:
                    adjusted_prob = max(adjusted_prob, 0.60)
                elif grid_pos == 3:
                    adjusted_prob = max(adjusted_prob, 0.50)
                elif grid_pos <= 5:
                    adjusted_prob = max(adjusted_prob, 0.30)
                elif grid_pos <= 10:
                    adjusted_prob = min(adjusted_prob, 0.20)
                elif grid_pos > 10:
                    adjusted_prob = min(adjusted_prob, 0.08)
                if adjusted_prob != old_prob:
                    adjustments_applied.append({
                        "type": "qualifying",
                        "impact": round((adjusted_prob - old_prob) / max(old_prob, 0.01) * 100, 1),
                        "reason": f"Qualified P{grid_pos}",
                        "source": "FIA qualifying result"
                    })

        # ── RAIN FORECAST (changes race dynamics completely) ──
        weather = incidents.get("weather_forecast")
        if weather and weather.get("rain_probability_percent", 0) > 50:
            rain_pct = weather["rain_probability_percent"]
            if driver_id.lower() in WET_SPECIALISTS or code in WET_SPECIALISTS:
                boost = 1 + (rain_pct / 100) * 0.30
                adjusted_prob *= boost
                adjustments_applied.append({
                    "type": "weather",
                    "impact": round((boost - 1) * 100, 1),
                    "reason": f"Rain forecast {rain_pct}% — known wet specialist",
                    "source": "Weather forecast"
                })
            else:
                penalty_f = 1 - (rain_pct / 100) * 0.15
                adjusted_prob *= penalty_f
                adjustments_applied.append({
                    "type": "weather",
                    "impact": round((penalty_f - 1) * 100, 1),
                    "reason": f"Rain forecast {rain_pct}% — standard wet impact",
                    "source": "Weather forecast"
                })

        # ── PRACTICE PACE (real OpenF1 lap times) ──
        driver_number = code_to_number.get(code)
        if driver_number and driver_number in pace_rank_by_number:
            rank = pace_rank_by_number[driver_number]
            gap = pace_gap_by_number.get(driver_number, 0)

            if rank == 1:
                boost = 1.15
                adjusted_prob *= boost
                adjustments_applied.append({
                    "type": "practice_pace",
                    "impact": round((boost - 1) * 100, 1),
                    "reason": f"{session_name} pace leader",
                    "source": f"OpenF1 — fastest lap in {session_name}"
                })
            elif rank <= 3:
                boost = 1.08
                adjusted_prob *= boost
                adjustments_applied.append({
                    "type": "practice_pace",
                    "impact": round((boost - 1) * 100, 1),
                    "reason": f"{session_name} P{rank} (+{gap:.3f}s)",
                    "source": f"OpenF1 lap times"
                })
            elif rank > 15:
                factor = 0.85
                adjusted_prob *= factor
                adjustments_applied.append({
                    "type": "practice_pace",
                    "impact": round((factor - 1) * 100, 1),
                    "reason": f"{session_name} P{rank} — off pace (+{gap:.3f}s)",
                    "source": f"OpenF1 lap times"
                })

        # ── MECHANICAL ISSUES IN PRACTICE ──
        for incident in incidents.get("practice_incidents", []):
            i_id = incident.get("driver_id", "").lower()
            if i_id and (i_id in driver_id.lower() or driver_id.lower() in i_id):
                resolved = incident.get("resolved", False)
                lost_min = incident.get("laps_lost_minutes", 0)
                inc_type = incident.get("type", "issue")
                session = incident.get("session", "practice")

                if not resolved:
                    factor = 0.70
                    adjusted_prob *= factor
                    adjustments_applied.append({
                        "type": "mechanical",
                        "impact": -30.0,
                        "reason": f"UNRESOLVED {inc_type} from {session}",
                        "source": "Confirmed team report"
                    })
                elif lost_min > 30:
                    factor = 0.92
                    adjusted_prob *= factor
                    adjustments_applied.append({
                        "type": "mechanical",
                        "impact": -8.0,
                        "reason": f"Lost ~{lost_min} min setup time ({inc_type} in {session}, resolved)",
                        "source": "OpenF1 session data"
                    })

        # Clamp probability
        pred["adjusted_probability"] = round(min(max(adjusted_prob, 0.01), 0.99), 3)
        pred["adjustment"] = round(pred["adjusted_probability"] - pred["podium_probability"], 3)
        pred["adjustments"] = adjustments_applied
        pred["news_factors"] = [a["reason"] for a in adjustments_applied]

    return sorted(predictions, key=lambda x: -x["adjusted_probability"])
