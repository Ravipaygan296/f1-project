"""
F1 Analytics — Schedule Router
Race calendar, upcoming races, and race details.
"""

from fastapi import APIRouter
import sqlalchemy as sa
from datetime import date, datetime
from backend.models import SessionLocal

router = APIRouter(prefix="/api/schedule", tags=["Schedule"])


@router.get("/{season}")
def season_schedule(season: int):
    """Get the full race calendar for a season with results summary."""
    db = SessionLocal()
    try:
        result = db.execute(sa.text("""
            SELECT ra.race_id, ra.round, ra.name, ra.race_date,
                   ci.circuit_id, ci.name as circuit_name, ci.country, ci.locality
            FROM races ra
            JOIN circuits ci ON ra.circuit_id = ci.circuit_id
            WHERE ra.season = :season
            ORDER BY ra.round
        """), {"season": season})

        races = [dict(r._mapping) for r in result]

        # Add winner info for completed races
        for race in races:
            winner_result = db.execute(sa.text("""
                SELECT d.code, d.forename, d.surname,
                       c.constructor_id, c.name as team_name, c.color_hex
                FROM results r
                JOIN drivers d ON r.driver_id = d.driver_id
                JOIN constructors c ON r.constructor_id = c.constructor_id
                WHERE r.race_id = :race_id AND r.position = 1
            """), {"race_id": race["race_id"]})

            winner_row = winner_result.fetchone()
            if winner_row:
                w = dict(winner_row._mapping)
                race["winner"] = w
                race["completed"] = True
            else:
                race["winner"] = None
                race["completed"] = False

            # Convert date for JSON
            if race["race_date"]:
                race["race_date"] = str(race["race_date"])

        return {"races": races, "season": season}
    finally:
        db.close()


@router.get("/{season}/race/{round_num}")
def race_detail(season: int, round_num: int):
    """Get detailed results for a specific race."""
    db = SessionLocal()
    try:
        # Race info
        race_result = db.execute(sa.text("""
            SELECT ra.race_id, ra.round, ra.name, ra.race_date,
                   ci.circuit_id, ci.name as circuit_name, ci.country, ci.locality
            FROM races ra
            JOIN circuits ci ON ra.circuit_id = ci.circuit_id
            WHERE ra.season = :season AND ra.round = :round
        """), {"season": season, "round": round_num})

        race_row = race_result.fetchone()
        if not race_row:
            return {"error": "Race not found"}

        race = dict(race_row._mapping)
        race_id = race["race_id"]
        if race["race_date"]:
            race["race_date"] = str(race["race_date"])

        # Full results
        results_q = db.execute(sa.text("""
            SELECT r.position, r.grid, r.points, r.status,
                   d.driver_id, d.code, d.forename, d.surname,
                   c.constructor_id, c.name as team_name, c.color_hex
            FROM results r
            JOIN drivers d ON r.driver_id = d.driver_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE r.race_id = :race_id
            ORDER BY r.position NULLS LAST
        """), {"race_id": race_id})

        results = [dict(r._mapping) for r in results_q]

        return {"race": race, "results": results}
    finally:
        db.close()


@router.get("/upcoming/next")
def next_race():
    """Get the next upcoming race based on today's date."""
    db = SessionLocal()
    try:
        today = date.today()
        result = db.execute(sa.text("""
            SELECT ra.race_id, ra.season, ra.round, ra.name, ra.race_date,
                   ci.circuit_id, ci.name as circuit_name, ci.country, ci.locality
            FROM races ra
            JOIN circuits ci ON ra.circuit_id = ci.circuit_id
            WHERE ra.race_date >= :today
            ORDER BY ra.race_date ASC
            LIMIT 1
        """), {"today": today})

        row = result.fetchone()
        if row:
            race = dict(row._mapping)
            if race["race_date"]:
                race_date = race["race_date"]
                race["race_date"] = str(race_date)
                race["days_until"] = (race_date - today).days
            return {"next_race": race}
        else:
            return {"next_race": None, "message": "No upcoming races found"}
    finally:
        db.close()
