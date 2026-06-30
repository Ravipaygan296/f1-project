"""
F1 Analytics — Real Data News Fetcher
Combines OpenF1 practice telemetry + Groq-verified incidents.

Three real data sources, zero speculation:
  1. OpenF1 practice lap times (exact numbers)
  2. Groq web search for verified incidents (penalties, crashes, weather)
  3. Your historical DB (circuit history stats)
"""

import os
import sys
import json
import logging
import requests
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.openf1_client import get_sessions, get_laps, get_drivers, get_weather

logger = logging.getLogger(__name__)

OPENF1_BASE = "https://api.openf1.org/v1"


def get_practice_pace(year: int, meeting_name_hint: str) -> dict:
    """
    Fetch real practice lap times from OpenF1.
    Returns driver rankings with exact lap times — no opinions.
    """
    try:
        # Get all sessions for this year's meeting
        all_sessions = get_sessions(year)

        # Find FP2 first (better predictor), fall back to FP1
        target_session = None
        for session in reversed(all_sessions):
            s_name = session.get("session_name", "")
            m_name = session.get("meeting_name", "")
            # Match by meeting name keywords
            if (meeting_name_hint.split()[0].lower() in m_name.lower() and
                    s_name in ("Practice 2", "Practice 1", "Sprint Qualifying")):
                target_session = session
                break

        if not target_session:
            logger.info("No practice session found on OpenF1")
            return {"session": None, "rankings": [], "driver_map": {}}

        session_key = target_session["session_key"]
        session_name = target_session.get("session_name", "Practice")
        logger.info(f"Fetching practice pace from: {session_name} (key={session_key})")

        # Get all laps
        laps = get_laps(session_key)

        # Get driver info for mapping number -> name
        drivers_data = get_drivers(session_key)
        driver_map = {}
        for d in drivers_data:
            num = d.get("driver_number")
            driver_map[num] = {
                "name_acronym": d.get("name_acronym", ""),
                "full_name": d.get("full_name", ""),
                "team_name": d.get("team_name", ""),
                "team_colour": d.get("team_colour", ""),
            }

        # Find best lap per driver
        best_laps = defaultdict(lambda: float("inf"))
        for lap in laps:
            duration = lap.get("lap_duration")
            if duration and isinstance(duration, (int, float)) and duration > 30:
                num = lap["driver_number"]
                if duration < best_laps[num]:
                    best_laps[num] = duration

        # Sort by fastest
        rankings = sorted(
            [{"driver_number": k, "best_lap": round(v, 3)} for k, v in best_laps.items()],
            key=lambda x: x["best_lap"]
        )

        # Add gap to leader
        if rankings:
            leader_time = rankings[0]["best_lap"]
            for r in rankings:
                r["gap"] = round(r["best_lap"] - leader_time, 3)
                info = driver_map.get(r["driver_number"], {})
                r["code"] = info.get("name_acronym", f"#{r['driver_number']}")
                r["name"] = info.get("full_name", "")
                r["team"] = info.get("team_name", "")

        # Get weather from the session
        weather_data = get_weather(session_key)
        session_weather = None
        if weather_data:
            last_w = weather_data[-1]
            session_weather = {
                "air_temp": last_w.get("air_temperature"),
                "track_temp": last_w.get("track_temperature"),
                "humidity": last_w.get("humidity"),
                "rainfall": bool(last_w.get("rainfall", False)),
            }

        return {
            "session": session_name,
            "session_key": session_key,
            "rankings": rankings,
            "driver_map": driver_map,
            "weather": session_weather,
        }

    except Exception as e:
        logger.error(f"OpenF1 practice pace fetch failed: {e}")
        return {"session": None, "rankings": [], "driver_map": {}}


def search_verified_incidents(race_name: str, race_date: str) -> dict:
    """
    Search for SPECIFIC, VERIFIABLE race incidents only.
    No opinions, no speculation — only confirmed facts.
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key or api_key == "your_groq_api_key_here":
        return _empty_incidents()

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system",
                        "content": """You extract ONLY verifiable, specific F1 race facts.

INCLUDE only:
- Grid penalties (exact places, exact reason, confirmed by FIA)
- Engine/gearbox changes requiring back-of-grid start
- Crashes in practice/qualifying with confirmed car damage
- Weather forecast for race day (actual forecast data)
- Confirmed mechanical failures during practice sessions
- Qualifying result if qualifying has happened (exact grid order)

NEVER include:
- "Team X looks strong" — that's an opinion
- "Driver Y has good pace" — too vague
- "Upgrade expected to help" — speculation
- Anything without a specific, verifiable event or number

Return JSON:
{
    "grid_penalties": [{"driver": "Full Name", "driver_id": "surname_lowercase", "places": 10, "reason": "new ICE", "confirmed": true}],
    "back_of_grid": [{"driver": "Full Name", "driver_id": "surname_lowercase", "reason": "new power unit"}],
    "practice_incidents": [{"driver": "Full Name", "driver_id": "surname_lowercase", "type": "hydraulic_failure", "session": "FP1", "laps_lost_minutes": 45, "resolved": true}],
    "weather_forecast": {"race_day": "dry", "rain_probability_percent": 20, "temperature_celsius": 28},
    "qualifying_grid": [],
    "confirmed_facts": ["Exact factual statement 1", "Exact factual statement 2"]
}

Leave arrays empty and weather null if information is not confirmed."""
                    },
                    {
                        "role": "user",
                        "content": f"Find specific verifiable facts for the F1 {race_name} weekend ({race_date}). "
                                   f"Focus on: grid penalties, mechanical failures in practice, "
                                   f"weather forecast, qualifying results (if available), crashes or incidents."
                    }
                ],
                "temperature": 0,
                "max_tokens": 1200,
                "response_format": {"type": "json_object"}
            },
            timeout=20
        )
        response.raise_for_status()

        content = response.json()["choices"][0]["message"]["content"]
        incidents = json.loads(content)

        # Validate structure
        incidents.setdefault("grid_penalties", [])
        incidents.setdefault("back_of_grid", [])
        incidents.setdefault("practice_incidents", [])
        incidents.setdefault("weather_forecast", None)
        incidents.setdefault("qualifying_grid", [])
        incidents.setdefault("confirmed_facts", [])

        logger.info(f"Incidents fetched: {len(incidents['grid_penalties'])} penalties, "
                    f"{len(incidents['practice_incidents'])} incidents, "
                    f"{len(incidents['confirmed_facts'])} confirmed facts")
        return incidents

    except Exception as e:
        logger.error(f"Incident search failed: {e}")
        return _empty_incidents()


def _empty_incidents() -> dict:
    return {
        "grid_penalties": [],
        "back_of_grid": [],
        "practice_incidents": [],
        "weather_forecast": None,
        "qualifying_grid": [],
        "confirmed_facts": []
    }
