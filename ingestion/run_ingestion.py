"""
F1 Analytics — Main Ingestion Script
Pulls data from Jolpica (historical) + OpenF1 (telemetry) into PostgreSQL.

Usage:
    export DATABASE_URL="postgresql://localhost/f1_analytics"
    python ingestion/run_ingestion.py

All inserts use ON CONFLICT DO NOTHING — safe to re-run at any time.
"""

import os
import sys
import logging
import psycopg
from datetime import datetime, date

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.jolpica_client import fetch_season, get_driver_standings, get_constructor_standings, get_results, get_sprint_results, get_pitstops, get_laps
from ingestion.openf1_client import get_race_sessions, get_stints, get_weather

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Team colors for the UI — maps constructor_id to hex
TEAM_COLORS = {
    "red_bull": "#3671C6", "ferrari": "#E80020", "mclaren": "#FF8700",
    "mercedes": "#27F4D2", "aston_martin": "#229971", "alpine": "#FF87BC",
    "williams": "#64C4FF", "rb": "#6692FF", "haas": "#B6BABD",
    "sauber": "#52E252", "kick_sauber": "#52E252", "alphatauri": "#6692FF",
    "alfa": "#C92D4B", "racing_point": "#F596C8", "renault": "#FFF500",
    "toro_rosso": "#4689C8", "force_india": "#F596C8",
}


def parse_lap_time(time_str: str):
    """Convert 'M:SS.mmm' or 'SS.mmm' to PostgreSQL interval string."""
    if not time_str:
        return None
    try:
        parts = time_str.split(":")
        if len(parts) == 2:
            mins, secs = int(parts[0]), float(parts[1])
            total_secs = mins * 60 + secs
        else:
            total_secs = float(parts[0])
        return f"{total_secs} seconds"
    except (ValueError, IndexError):
        return None


def parse_pitstop_duration(duration_str: str):
    """Convert pit stop duration string to interval."""
    if not duration_str:
        return None
    try:
        return f"{float(duration_str)} seconds"
    except ValueError:
        return parse_lap_time(duration_str)


def ensure_driver(cur, driver_data: dict):
    """Insert driver if not exists."""
    cur.execute("""
        INSERT INTO drivers (driver_id, code, number, forename, surname, nationality)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (driver_id) DO NOTHING
    """, (
        driver_data["driverId"],
        driver_data.get("code", driver_data["familyName"][:3].upper()),
        driver_data.get("permanentNumber"),
        driver_data["givenName"],
        driver_data["familyName"],
        driver_data.get("nationality"),
    ))


def ensure_constructor(cur, constructor_data: dict):
    """Insert constructor if not exists."""
    cid = constructor_data["constructorId"]
    color = TEAM_COLORS.get(cid, "#6B7280")
    cur.execute("""
        INSERT INTO constructors (constructor_id, name, color_hex)
        VALUES (%s, %s, %s)
        ON CONFLICT (constructor_id) DO NOTHING
    """, (cid, constructor_data["name"], color))


def ingest_jolpica(db_url: str, seasons: list[int]):
    """Ingest historical data from Jolpica for the given seasons."""
    for season in seasons:
        logger.info(f"=== Ingesting season {season} ===")
        
        # Save season first
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO seasons VALUES (%s) ON CONFLICT DO NOTHING", (season,))
            conn.commit()

        for race, results, sprint_results, pitstops, laps_data in fetch_season(season):
            circuit = race["Circuit"]
            loc = circuit.get("Location", {})
            round_num = int(race["round"])

            # Skip rounds that already have results in the DB (only for past seasons to avoid API load;
            # for the current season, we always verify and update points).
            if season < 2026:
                with psycopg.connect(db_url) as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT COUNT(*) FROM results r JOIN races ra ON r.race_id = ra.race_id WHERE ra.season = %s AND ra.round = %s",
                            (season, round_num)
                        )
                        existing = cur.fetchone()[0]
                        if existing > 0:
                            logger.info(f"  R{round_num}: {race['raceName']} — already ingested ({existing} results), skipping")
                            continue


            # Open connection ONLY for the duration of saving this race
            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    # Circuit
                    cur.execute("""
                        INSERT INTO circuits (circuit_id, name, country, locality, lat, lng)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (circuit_id) DO NOTHING
                    """, (
                        circuit["circuitId"], circuit["circuitName"],
                        loc.get("country"), loc.get("locality"),
                        loc.get("lat"), loc.get("long"),
                    ))

                    # Race
                    cur.execute("""
                        INSERT INTO races (season, round, circuit_id, name, race_date)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (season, round) DO NOTHING
                        RETURNING race_id
                    """, (season, race["round"], circuit["circuitId"], race["raceName"], race["date"]))

                    row = cur.fetchone()
                    if row:
                        race_id = row[0]
                    else:
                        # Already exists — fetch the race_id
                        cur.execute(
                            "SELECT race_id FROM races WHERE season=%s AND round=%s",
                            (season, race["round"])
                        )
                        race_id = cur.fetchone()[0]

                    # Build a dictionary of sprint points by driverId
                    sprint_points_map = {}
                    for sr in sprint_results:
                        sprint_points_map[sr["Driver"]["driverId"]] = float(sr.get("points", 0))

                    # Results
                    for r in results:
                        ensure_driver(cur, r["Driver"])
                        ensure_constructor(cur, r["Constructor"])

                        position = None
                        try:
                            position = int(r["position"])
                        except (ValueError, KeyError):
                            pass

                        fastest_lap = None
                        if "FastestLap" in r and "Time" in r["FastestLap"]:
                            fastest_lap = parse_lap_time(r["FastestLap"]["Time"].get("time"))

                        cur.execute("""
                            INSERT INTO results (race_id, driver_id, constructor_id, grid, position, points, status, fastest_lap_time)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::interval)
                            ON CONFLICT (race_id, driver_id) DO UPDATE SET
                                constructor_id = EXCLUDED.constructor_id,
                                grid = EXCLUDED.grid,
                                position = EXCLUDED.position,
                                points = EXCLUDED.points,
                                status = EXCLUDED.status,
                                fastest_lap_time = EXCLUDED.fastest_lap_time
                        """, (
                            race_id, r["Driver"]["driverId"], r["Constructor"]["constructorId"],
                            r.get("grid"), position, float(r.get("points", 0)) + sprint_points_map.get(r["Driver"]["driverId"], 0),
                            r.get("status"), fastest_lap,
                        ))

                    # Pit stops
                    for p in pitstops:
                        cur.execute("""
                            INSERT INTO pit_stops (race_id, driver_id, stop_number, lap, duration)
                            VALUES (%s, %s, %s, %s, %s::interval)
                            ON CONFLICT (race_id, driver_id, stop_number) DO NOTHING
                        """, (
                            race_id, p["driverId"], p["stop"],
                            p["lap"], parse_pitstop_duration(p.get("duration")),
                        ))

                    # Laps (only for recent seasons — can be large)
                    if laps_data:
                        for lap_entry in laps_data:
                            lap_num = int(lap_entry["number"])
                            for timing in lap_entry.get("Timings", []):
                                lap_interval = parse_lap_time(timing.get("time"))
                                t_pos = None
                                try:
                                    t_pos = int(timing.get("position"))
                                except (ValueError, TypeError):
                                    pass

                                cur.execute("""
                                    INSERT INTO laps (race_id, driver_id, lap_number, lap_time, position, is_pit_lap)
                                    VALUES (%s, %s, %s, %s::interval, %s, FALSE)
                                    ON CONFLICT (race_id, driver_id, lap_number) DO NOTHING
                                """, (
                                    race_id, timing["driverId"], lap_num, lap_interval, t_pos,
                                ))

                conn.commit()

            logger.info(f"  R{race['round']}: {race['raceName']} — "
                        f"{len(results)} results, {len(pitstops)} pit stops, "
                        f"{len(laps_data)} lap entries")

        logger.info(f"Season {season} finished processing")


def sync_latest_results(db_url: str, season: int = 2026):
    """
    Smart sync: only fetch and insert results for races that have already
    happened (race_date <= today) but have NO results in the database yet.
    This is much faster than re-processing the entire season every time.
    """
    logger.info(f"=== Smart sync for {season} season ===")

    # Step 1: Find rounds that should have results but don't
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ra.race_id, ra.round, ra.name, ra.race_date, ra.circuit_id
                FROM races ra
                LEFT JOIN results r ON ra.race_id = r.race_id
                WHERE ra.season = %s
                  AND ra.race_date <= %s
                GROUP BY ra.race_id, ra.round, ra.name, ra.race_date, ra.circuit_id
                HAVING COUNT(r.result_id) = 0
                ORDER BY ra.round
            """, (season, date.today()))
            missing_rounds = cur.fetchall()

    if not missing_rounds:
        logger.info(f"All completed {season} races already have results. Nothing to sync.")
        return

    logger.info(f"Found {len(missing_rounds)} race(s) missing results: "
                f"{[f'R{r[1]} {r[2]}' for r in missing_rounds]}")

    # Step 2: Fetch and insert results for each missing round
    for race_id, round_num, race_name, race_date, circuit_id in missing_rounds:
        logger.info(f"  Syncing R{round_num}: {race_name} ({race_date})...")

        try:
            results = get_results(season, round_num)
            if not results:
                logger.info(f"    No results available from API yet for R{round_num}")
                continue

            import time
            time.sleep(0.4)
            sprint_results = get_sprint_results(season, round_num)
            time.sleep(0.4)
            pitstops = get_pitstops(season, round_num)
            time.sleep(0.4)

            # Fetch lap data for 2022+ seasons
            laps_data = []
            if season >= 2022:
                laps_data = get_laps(season, round_num)
                time.sleep(0.4)

            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    # Build a dictionary of sprint points by driverId
                    sprint_points_map = {}
                    for sr in sprint_results:
                        sprint_points_map[sr["Driver"]["driverId"]] = float(sr.get("points", 0))

                    # Insert results
                    for r in results:
                        ensure_driver(cur, r["Driver"])
                        ensure_constructor(cur, r["Constructor"])

                        position = None
                        try:
                            position = int(r["position"])
                        except (ValueError, KeyError):
                            pass

                        fastest_lap = None
                        if "FastestLap" in r and "Time" in r["FastestLap"]:
                            fastest_lap = parse_lap_time(r["FastestLap"]["Time"].get("time"))

                        cur.execute("""
                            INSERT INTO results (race_id, driver_id, constructor_id, grid, position, points, status, fastest_lap_time)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::interval)
                            ON CONFLICT (race_id, driver_id) DO UPDATE SET
                                constructor_id = EXCLUDED.constructor_id,
                                grid = EXCLUDED.grid,
                                position = EXCLUDED.position,
                                points = EXCLUDED.points,
                                status = EXCLUDED.status,
                                fastest_lap_time = EXCLUDED.fastest_lap_time
                        """, (
                            race_id, r["Driver"]["driverId"], r["Constructor"]["constructorId"],
                            r.get("grid"), position, float(r.get("points", 0)) + sprint_points_map.get(r["Driver"]["driverId"], 0),
                            r.get("status"), fastest_lap,
                        ))

                    # Insert pit stops
                    for p in pitstops:
                        cur.execute("""
                            INSERT INTO pit_stops (race_id, driver_id, stop_number, lap, duration)
                            VALUES (%s, %s, %s, %s, %s::interval)
                            ON CONFLICT (race_id, driver_id, stop_number) DO NOTHING
                        """, (
                            race_id, p["driverId"], p["stop"],
                            p["lap"], parse_pitstop_duration(p.get("duration")),
                        ))

                    # Insert laps
                    if laps_data:
                        for lap_entry in laps_data:
                            lap_num = int(lap_entry["number"])
                            for timing in lap_entry.get("Timings", []):
                                lap_interval = parse_lap_time(timing.get("time"))
                                t_pos = None
                                try:
                                    t_pos = int(timing.get("position"))
                                except (ValueError, TypeError):
                                    pass

                                cur.execute("""
                                    INSERT INTO laps (race_id, driver_id, lap_number, lap_time, position, is_pit_lap)
                                    VALUES (%s, %s, %s, %s::interval, %s, FALSE)
                                    ON CONFLICT (race_id, driver_id, lap_number) DO NOTHING
                                """, (
                                    race_id, timing["driverId"], lap_num, lap_interval, t_pos,
                                ))

                conn.commit()

            logger.info(f"    R{round_num}: {race_name} — "
                        f"{len(results)} results, {len(pitstops)} pit stops, "
                        f"{len(laps_data)} lap entries ✓")

        except Exception as e:
            logger.error(f"    Failed to sync R{round_num} {race_name}: {e}", exc_info=True)

    logger.info(f"Smart sync for {season} complete.")


def ingest_openf1_stints(db_url: str, seasons: list[int]):
    """Ingest tyre stint and weather data from OpenF1 (2023+ only)."""
    for season in [s for s in seasons if s >= 2023]:
        logger.info(f"=== OpenF1 stints for {season} ===")
        sessions = get_race_sessions(season)

        for session in sessions:
            session_key = session["session_key"]
            session_name = session.get("session_name", session.get("meeting_name", "Unknown"))

            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    # Find matching race_id by season + approximate round matching
                    meeting_name = session.get("meeting_name", "")
                    cur.execute("""
                        SELECT race_id FROM races
                        WHERE season = %s AND name ILIKE %s
                        LIMIT 1
                    """, (season, f"%{meeting_name.split(' ')[0]}%"))
                    row = cur.fetchone()
                    if not row:
                        logger.warning(f"  No matching race found for session: {session_name}")
                        continue
                    race_id = row[0]

                    # Stints
                    stints = get_stints(session_key)
                    for stint in stints:
                        driver_num = stint.get("driver_number")
                        # Look up driver_id from number
                        cur.execute(
                            "SELECT driver_id FROM drivers WHERE number = %s LIMIT 1",
                            (driver_num,)
                        )
                        d_row = cur.fetchone()
                        if not d_row:
                            continue
                        driver_id = d_row[0]

                        cur.execute("""
                            INSERT INTO stints (race_id, driver_id, stint_number, compound, lap_start, lap_end)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (race_id, driver_id, stint_number) DO NOTHING
                        """, (
                            race_id, driver_id, stint.get("stint_number"),
                            stint.get("compound"), stint.get("lap_start"), stint.get("lap_end"),
                        ))

                    # Weather
                    weather_data = get_weather(session_key)
                    for w in weather_data[:20]:  # Sample — don't store hundreds of rows
                        # OpenF1 returns rainfall as 0/1 int — cast to bool for Postgres
                        rainfall_val = bool(w.get("rainfall", False))
                        cur.execute("""
                            INSERT INTO weather (race_id, recorded_at, air_temp, track_temp, humidity, rainfall)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (race_id, recorded_at) DO NOTHING
                        """, (
                            race_id, w.get("date"), w.get("air_temperature"),
                            w.get("track_temperature"), w.get("humidity"),
                            rainfall_val,
                        ))

                conn.commit()
            logger.info(f"  {session_name}: {len(stints)} stints, {len(weather_data)} weather records")

        logger.info(f"OpenF1 data for {season} finished")


def mark_pit_laps(db_url: str):
    """Mark laps as pit laps by cross-referencing with pit_stops table."""
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE laps l
                SET is_pit_lap = TRUE
                FROM pit_stops p
                WHERE l.race_id = p.race_id
                  AND l.driver_id = p.driver_id
                  AND l.lap_number = p.lap
            """)
            affected = cur.rowcount
        conn.commit()
    logger.info(f"Marked {affected} laps as pit laps")


def ingest_2026_schedule(db_url: str):
    """Quick fix: Ingest 2026 schedule so the live race endpoint knows what is coming."""
    import requests
    logger.info("=== Ingesting 2026 Schedule ===")
    
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO seasons VALUES (2026) ON CONFLICT DO NOTHING")
        conn.commit()

    try:
        r = requests.get("https://api.jolpi.ca/ergast/f1/2026.json", timeout=10)
        r.raise_for_status()
        races = r.json()["MRData"]["RaceTable"]["Races"]
        
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                for race in races:
                    circuit = race["Circuit"]
                    loc = circuit.get("Location", {})
                    
                    cur.execute("""
                        INSERT INTO circuits (circuit_id, name, country, locality, lat, lng)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (circuit_id) DO NOTHING
                    """, (
                        circuit["circuitId"], circuit["circuitName"],
                        loc.get("country"), loc.get("locality"),
                        loc.get("lat"), loc.get("long"),
                    ))

                    cur.execute("""
                        INSERT INTO races (season, round, circuit_id, name, race_date)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (season, round) DO NOTHING
                    """, (2026, race["round"], circuit["circuitId"], race["raceName"], race["date"]))
            conn.commit()
        logger.info(f"Successfully ingested {len(races)} races for 2026 season.")
    except Exception as e:
        logger.error(f"Failed to ingest 2026 schedule: {e}")



def main():
    from dotenv import load_dotenv
    load_dotenv()

    # psycopg3 uses a different connection string format or keyword args
    # but handles standard postgresql:// fine.
    db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost/f1_analytics")

    # Temporarily set to empty to bypass re-ingesting 2022-2025
    seasons = []

    try:
        # Phase 1: Historical data from Jolpica
        # ingest_jolpica(db_url, seasons)

        # Phase 2: Tyre stints + weather from OpenF1 (2023+)
        # ingest_openf1_stints(db_url, seasons)
        
        # Phase 2.5: Inject 2026 schedule (Quick Fix)
        ingest_2026_schedule(db_url)

        # Phase 3: Cross-reference pit laps
        mark_pit_laps(db_url)

        logger.info("=== INGESTION COMPLETE ===")

        # Print summary
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                for table in ["seasons", "circuits", "races", "drivers", "constructors", "results", "laps", "stints", "pit_stops", "weather"]:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cur.fetchone()[0]
                    logger.info(f"  {table}: {count} rows")

    except Exception as e:
        logger.error(f"Ingestion failed: {e}", exc_info=True)


if __name__ == "__main__":
    main()
