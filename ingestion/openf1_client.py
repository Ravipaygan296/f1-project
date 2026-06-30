"""
F1 Analytics — OpenF1 Client
Live/recent telemetry: laps, stints, pit stops, weather, positions (2023+)
"""

import requests
import logging

logger = logging.getLogger(__name__)

BASE = "https://api.openf1.org/v1"


def _get(url: str, params: dict = None, timeout: int = 20):
    """Make a GET request with retry logic."""
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                logger.warning(f"No data found (404) for {url} with params {params}")
                return []
            logger.warning(f"HTTP Error attempt {attempt + 1} failed for {url}: {e}")
            if attempt < 2:
                import time
                time.sleep(2 ** attempt)
            else:
                raise
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}")
            if attempt < 2:
                import time
                time.sleep(2 ** attempt)
            else:
                raise
    return []


def get_sessions(year: int, session_type: str = None) -> list:
    """Get all sessions for a year, optionally filtered by type."""
    params = {"year": year}
    if session_type:
        params["session_type"] = session_type
    return _get(f"{BASE}/sessions", params=params)


def get_race_sessions(year: int) -> list:
    """Get only Race sessions for a year."""
    return get_sessions(year, session_type="Race")


def get_drivers(session_key: int) -> list:
    """Get drivers participating in a session."""
    return _get(f"{BASE}/drivers", params={"session_key": session_key})


def get_laps(session_key: int, driver_number: int = None) -> list:
    """Get lap data for a session. Optionally filter by driver."""
    params = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return _get(f"{BASE}/laps", params=params)


def get_stints(session_key: int) -> list:
    """Get tyre stint data (compound, lap range) for a session."""
    return _get(f"{BASE}/stints", params={"session_key": session_key})


def get_pit_stops(session_key: int) -> list:
    """Get pit stop events for a session."""
    return _get(f"{BASE}/pit", params={"session_key": session_key})


def get_position(session_key: int) -> list:
    """Get position data (running order) for a session."""
    return _get(f"{BASE}/position", params={"session_key": session_key})


def get_intervals(session_key: int) -> list:
    """
    Get interval data (gap to leader, gap to car ahead).
    WARNING: gap_to_leader can be a float OR a string like '+1 LAP'
    for lapped cars. Always handle both types.
    """
    return _get(f"{BASE}/intervals", params={"session_key": session_key})


def get_weather(session_key: int) -> list:
    """Get weather data recorded during a session."""
    return _get(f"{BASE}/weather", params={"session_key": session_key})


def get_latest_session() -> dict | None:
    """Get the most recent session (for live tracking)."""
    sessions = _get(f"{BASE}/sessions", params={"session_key": "latest"})
    return sessions[0] if sessions else None


def get_live_positions() -> list:
    """Get positions from the latest/current session."""
    return _get(f"{BASE}/position", params={"session_key": "latest"})


def get_live_intervals() -> list:
    """Get intervals from the latest/current session."""
    return _get(f"{BASE}/intervals", params={"session_key": "latest"})


def get_live_laps() -> list:
    """Get lap data from the latest/current session."""
    return _get(f"{BASE}/laps", params={"session_key": "latest"})


def parse_gap(gap_value) -> dict:
    """
    Safely parse gap_to_leader which can be float or string.
    Returns {"seconds": float | None, "laps_behind": int | None, "raw": str}
    """
    if gap_value is None:
        return {"seconds": None, "laps_behind": None, "raw": "N/A"}

    if isinstance(gap_value, (int, float)):
        return {"seconds": float(gap_value), "laps_behind": None, "raw": f"+{gap_value:.3f}s"}

    # String value like "+1 LAP" or "+2 LAPS"
    raw = str(gap_value)
    try:
        return {"seconds": float(raw), "laps_behind": None, "raw": f"+{float(raw):.3f}s"}
    except ValueError:
        pass

    # Parse "+N LAP(S)" format
    import re
    match = re.search(r'\+?(\d+)\s*LAP', raw, re.IGNORECASE)
    if match:
        laps = int(match.group(1))
        return {"seconds": None, "laps_behind": laps, "raw": f"+{laps} LAP{'S' if laps > 1 else ''}"}

    return {"seconds": None, "laps_behind": None, "raw": raw}
