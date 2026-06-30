"""
One-time fix: Remove duplicate rows and add unique constraints.
Run this once: python ingestion/fix_duplicates.py
"""

import os
import sys
import psycopg
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

db_url = os.environ.get("DATABASE_URL")

print("=== Fixing duplicate data ===")

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:

        # 1. Delete duplicate results (keep lowest result_id per race_id + driver_id)
        cur.execute("""
            DELETE FROM results
            WHERE result_id NOT IN (
                SELECT MIN(result_id)
                FROM results
                GROUP BY race_id, driver_id
            )
        """)
        print(f"  Deleted {cur.rowcount} duplicate results rows")

        # 2. Delete duplicate laps
        cur.execute("""
            DELETE FROM laps
            WHERE lap_id NOT IN (
                SELECT MIN(lap_id)
                FROM laps
                GROUP BY race_id, driver_id, lap_number
            )
        """)
        print(f"  Deleted {cur.rowcount} duplicate laps rows")

        # 3. Delete duplicate pit_stops
        cur.execute("""
            DELETE FROM pit_stops
            WHERE pit_stop_id NOT IN (
                SELECT MIN(pit_stop_id)
                FROM pit_stops
                GROUP BY race_id, driver_id, stop_number
            )
        """)
        print(f"  Deleted {cur.rowcount} duplicate pit_stops rows")

        # 4. Delete duplicate stints
        cur.execute("""
            DELETE FROM stints
            WHERE stint_id NOT IN (
                SELECT MIN(stint_id)
                FROM stints
                GROUP BY race_id, driver_id, stint_number
            )
        """)
        print(f"  Deleted {cur.rowcount} duplicate stints rows")

        # 5. Delete duplicate weather
        cur.execute("""
            DELETE FROM weather
            WHERE weather_id NOT IN (
                SELECT MIN(weather_id)
                FROM weather
                GROUP BY race_id, recorded_at
            )
        """)
        print(f"  Deleted {cur.rowcount} duplicate weather rows")

        # 6. Add unique constraints to prevent future duplicates
        constraints = [
            ("results", "uq_results_race_driver", "race_id, driver_id"),
            ("laps", "uq_laps_race_driver_lap", "race_id, driver_id, lap_number"),
            ("pit_stops", "uq_pitstops_race_driver_stop", "race_id, driver_id, stop_number"),
            ("stints", "uq_stints_race_driver_stint", "race_id, driver_id, stint_number"),
            ("weather", "uq_weather_race_time", "race_id, recorded_at"),
        ]

        for table, name, cols in constraints:
            try:
                cur.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} UNIQUE ({cols})")
                print(f"  Added UNIQUE constraint: {name}")
            except Exception as e:
                if "already exists" in str(e):
                    print(f"  Constraint {name} already exists, skipping")
                    conn.rollback()
                    # Re-open a savepoint after rollback
                else:
                    print(f"  Warning: Could not add {name}: {e}")
                    conn.rollback()

    conn.commit()

# Verify counts
with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        for table in ["results", "laps", "pit_stops", "stints", "weather"]:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            print(f"  {table}: {cur.fetchone()[0]} rows (after cleanup)")

print("=== Fix complete! Points should now be accurate. ===")
