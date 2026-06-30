"""
F1 Analytics — Jolpica Client
Historical F1 data: races, results, standings, pit stops (all seasons back to 1950)
"""

import requests
import time
import logging

logger = logging.getLogger(__name__)

BASE = "https://api.jolpi.ca/ergast/f1"
REQUEST_DELAY = 0.4  # seconds between requests — be polite to the free API


def _get(url: str, timeout: int = 20):
    """Make a GET request with retry logic."""
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise
    return None


def get_races(season: int) -> list:
    """Get all races in a season."""
    data = _get(f"{BASE}/{season}.json?limit=30")
    return data["MRData"]["RaceTable"]["Races"]


def get_results(season: int, round_: int) -> list:
    """Get race results for a specific round."""
    data = _get(f"{BASE}/{season}/{round_}/results.json?limit=30")
    races = data["MRData"]["RaceTable"]["Races"]
    return races[0]["Results"] if races else []


def get_qualifying(season: int, round_: int) -> list:
    """Get qualifying results for a specific round."""
    data = _get(f"{BASE}/{season}/{round_}/qualifying.json?limit=30")
    races = data["MRData"]["RaceTable"]["Races"]
    return races[0].get("QualifyingResults", []) if races else []


def get_pitstops(season: int, round_: int) -> list:
    """Get pit stop data for a specific round."""
    data = _get(f"{BASE}/{season}/{round_}/pitstops.json?limit=100")
    races = data["MRData"]["RaceTable"]["Races"]
    return races[0].get("PitStops", []) if races else []


def get_laps(season: int, round_: int) -> list:
    """Get lap-by-lap timing data for a specific round."""
    all_laps = []
    offset = 0
    limit = 100
    while True:
        data = _get(f"{BASE}/{season}/{round_}/laps.json?limit={limit}&offset={offset}")
        laps = data["MRData"]["RaceTable"]["Races"]
        if not laps or not laps[0].get("Laps"):
            break
        all_laps.extend(laps[0]["Laps"])
        total = int(data["MRData"]["total"])
        offset += limit
        if offset >= total:
            break
        time.sleep(REQUEST_DELAY)
    return all_laps


def get_driver_standings(season: int) -> list:
    """Get driver championship standings."""
    data = _get(f"{BASE}/{season}/driverStandings.json")
    lists = data["MRData"]["StandingsTable"]["StandingsLists"]
    return lists[0]["DriverStandings"] if lists else []


def get_constructor_standings(season: int) -> list:
    """Get constructor championship standings."""
    data = _get(f"{BASE}/{season}/constructorStandings.json")
    lists = data["MRData"]["StandingsTable"]["StandingsLists"]
    return lists[0]["ConstructorStandings"] if lists else []


def get_current_schedule() -> list:
    """Get the current season's full schedule (for upcoming races)."""
    data = _get(f"{BASE}/current.json?limit=30")
    return data["MRData"]["RaceTable"]["Races"]


def fetch_season(season: int):
    """
    Generator: yields (race_meta, results, pitstops, laps_data) for every
    round in a season. Sleeps between calls to respect rate limits.
    """
    races = get_races(season)
    logger.info(f"Season {season}: {len(races)} races found")

    for race in races:
        round_ = int(race["round"])
        logger.info(f"  Round {round_}: {race['raceName']}")

        results = get_results(season, round_)
        time.sleep(REQUEST_DELAY)

        pitstops = get_pitstops(season, round_)
        time.sleep(REQUEST_DELAY)

        # Lap data is large — only fetch for recent seasons
        laps_data = []
        if season >= 2022:
            laps_data = get_laps(season, round_)
            time.sleep(REQUEST_DELAY)

        yield race, results, pitstops, laps_data
