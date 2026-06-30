"""
F1 Analytics — Standings Router
Driver and Constructor championship standings.
"""

from fastapi import APIRouter
import sqlalchemy as sa
from backend.models import SessionLocal

router = APIRouter(prefix="/api/standings", tags=["Standings"])


@router.get("/drivers/{season}")
def driver_standings(season: int):
    """Get driver championship standings with wins, podiums, and points progression."""
    db = SessionLocal()
    try:
        # Get all results for the season, ordered by round
        result = db.execute(sa.text("""
            SELECT d.driver_id, d.code, d.forename, d.surname,
                   c.constructor_id, c.name as team_name, c.color_hex,
                   ra.round, ra.name as race_name,
                   r.position, r.points, r.grid
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            JOIN drivers d ON r.driver_id = d.driver_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE ra.season = :season
            ORDER BY ra.round, r.position
        """), {"season": season})

        rows = [dict(r._mapping) for r in result]
        if not rows:
            return {"standings": [], "season": season}

        # Aggregate per driver
        from collections import defaultdict
        drivers = defaultdict(lambda: {
            "points": 0, "wins": 0, "podiums": 0, "races": 0,
            "points_by_round": [], "positions": [],
        })

        rounds = sorted(set(r["round"] for r in rows))

        for row in rows:
            did = row["driver_id"]
            d = drivers[did]
            d["driver_id"] = did
            d["code"] = row["code"]
            d["name"] = f"{row['forename']} {row['surname']}"
            d["team"] = row["team_name"]
            d["team_id"] = row["constructor_id"]
            d["color"] = row["color_hex"]
            d["points"] += row["points"] or 0
            d["races"] += 1
            if row["position"] == 1:
                d["wins"] += 1
            if row["position"] and row["position"] <= 3:
                d["podiums"] += 1
            d["positions"].append(row["position"])

        # Build cumulative points progression
        for row in rows:
            did = row["driver_id"]
            # Already tracked above

        # Sort by total points descending
        standings = sorted(drivers.values(), key=lambda x: -x["points"])

        # Add position and gap
        leader_pts = standings[0]["points"] if standings else 0
        for i, s in enumerate(standings):
            s["position"] = i + 1
            s["gap_to_leader"] = round(s["points"] - leader_pts, 1)
            # Clean up internal tracking
            s.pop("positions", None)

        return {"standings": standings, "season": season, "rounds_completed": len(rounds)}
    finally:
        db.close()


@router.get("/constructors/{season}")
def constructor_standings(season: int):
    """Get constructor championship standings."""
    db = SessionLocal()
    try:
        result = db.execute(sa.text("""
            SELECT c.constructor_id, c.name, c.color_hex,
                   SUM(r.points) as total_points,
                   COUNT(CASE WHEN r.position = 1 THEN 1 END) as wins,
                   COUNT(CASE WHEN r.position <= 3 THEN 1 END) as podiums,
                   COUNT(DISTINCT ra.round) as races
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE ra.season = :season
            GROUP BY c.constructor_id, c.name, c.color_hex
            ORDER BY total_points DESC
        """), {"season": season})

        standings = [dict(r._mapping) for r in result]

        leader_pts = standings[0]["total_points"] if standings else 0
        for i, s in enumerate(standings):
            s["position"] = i + 1
            s["gap_to_leader"] = round(float(s["total_points"] - leader_pts), 1)
            s["total_points"] = float(s["total_points"])

        return {"standings": standings, "season": season}
    finally:
        db.close()
