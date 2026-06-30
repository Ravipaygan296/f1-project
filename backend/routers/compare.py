"""
F1 Analytics — Comparison Router
Driver vs Driver, Team vs Team, Tyre, Track comparisons.
"""

from fastapi import APIRouter, Query, HTTPException
import pandas as pd
import sqlalchemy as sa
from backend.models import SessionLocal

router = APIRouter(prefix="/api/compare", tags=["Compare"])


def _get_laps_df(db, race_id: int) -> pd.DataFrame:
    """Load laps for a race as a DataFrame."""
    result = db.execute(sa.text("""
        SELECT driver_id, lap_number,
               EXTRACT(EPOCH FROM lap_time) AS lap_time_seconds,
               is_pit_lap
        FROM laps WHERE race_id = :race_id
    """), {"race_id": race_id})
    rows = [dict(r._mapping) for r in result]
    return pd.DataFrame(rows) if rows else pd.DataFrame(
        columns=["driver_id", "lap_number", "lap_time_seconds", "is_pit_lap"]
    )


def _get_pitstops_df(db, race_id: int) -> pd.DataFrame:
    """Load pit stops for a race as a DataFrame."""
    result = db.execute(sa.text("""
        SELECT driver_id, stop_number, lap,
               EXTRACT(EPOCH FROM duration) AS duration_seconds
        FROM pit_stops WHERE race_id = :race_id
    """), {"race_id": race_id})
    rows = [dict(r._mapping) for r in result]
    return pd.DataFrame(rows) if rows else pd.DataFrame(
        columns=["driver_id", "stop_number", "lap", "duration_seconds"]
    )


@router.get("/drivers")
def compare_drivers(race_id: int, driver_ids: list[str] = Query(...)):
    """Compare two or more drivers in a specific race — pace, consistency, strategy."""
    from analytics.pace import compare_pace, pace_delta, lap_by_lap_comparison
    from analytics.consistency import compare_consistency
    from analytics.strategy import compare_strategy

    db = SessionLocal()
    try:
        laps_df = _get_laps_df(db, race_id)
        pitstops_df = _get_pitstops_df(db, race_id)

        pace = compare_pace(laps_df, driver_ids)
        consistency = compare_consistency(laps_df, driver_ids)
        strategy = compare_strategy(pitstops_df, driver_ids)
        lap_by_lap = lap_by_lap_comparison(laps_df, driver_ids)

        result = {
            "pace": pace.to_dict(orient="records"),
            "consistency": consistency.to_dict(orient="records"),
            "strategy": strategy.to_dict(orient="records"),
            "lap_by_lap": lap_by_lap.to_dict(orient="records"),
        }

        # If exactly 2 drivers, include delta
        if len(driver_ids) == 2:
            delta = pace_delta(laps_df, driver_ids[0], driver_ids[1])
            result["delta"] = delta.to_dict(orient="records")

        return result
    finally:
        db.close()


@router.get("/drivers/season")
def compare_drivers_season(season: int, driver_ids: list[str] = Query(...)):
    """Compare drivers across an entire season — results, points, head-to-head."""
    db = SessionLocal()
    try:
        result = db.execute(sa.text("""
            SELECT r.race_id, ra.round, ra.name as race_name,
                   r.driver_id, r.grid, r.position, r.points, r.status,
                   c.name as team_name, c.color_hex
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE ra.season = :season AND r.driver_id = ANY(:driver_ids)
            ORDER BY ra.round
        """), {"season": season, "driver_ids": driver_ids})

        rows = [dict(r._mapping) for r in result]
        df = pd.DataFrame(rows)

        if df.empty:
            return {"error": "No data found for these drivers in this season"}

        # Build per-driver summaries
        summaries = {}
        for did in driver_ids:
            d = df[df["driver_id"] == did]
            if d.empty:
                continue
            summaries[did] = {
                "total_points": float(d["points"].sum()),
                "wins": int((d["position"] == 1).sum()),
                "podiums": int((d["position"] <= 3).sum()),
                "avg_grid": round(float(d["grid"].mean()), 1),
                "avg_finish": round(float(d["position"].dropna().mean()), 1),
                "dnfs": int((~d["status"].isin(["Finished"])).sum()) if "status" in d.columns else 0,
                "team": d.iloc[0]["team_name"] if not d.empty else None,
                "color": d.iloc[0]["color_hex"] if not d.empty else None,
                "races": d[["round", "race_name", "grid", "position", "points"]].to_dict("records"),
            }

        # Head to head
        h2h = {}
        if len(driver_ids) == 2:
            a, b = driver_ids
            a_results = df[df["driver_id"] == a].set_index("race_id")
            b_results = df[df["driver_id"] == b].set_index("race_id")
            common = a_results.index.intersection(b_results.index)
            if len(common) > 0:
                a_better = sum(
                    1 for rid in common
                    if a_results.loc[rid, "position"] is not None
                    and b_results.loc[rid, "position"] is not None
                    and a_results.loc[rid, "position"] < b_results.loc[rid, "position"]
                )
                h2h = {a: a_better, b: len(common) - a_better}

        return {
            "summaries": summaries,
            "head_to_head": h2h,
            "all_results": rows,
        }
    finally:
        db.close()


@router.get("/teams")
def compare_teams(season: int, team_ids: list[str] = Query(...)):
    """Compare two constructors across a season."""
    db = SessionLocal()
    try:
        result = db.execute(sa.text("""
            SELECT ra.round, ra.name as race_name,
                   r.constructor_id, r.driver_id, r.position, r.points, r.grid,
                   c.name as team_name, c.color_hex,
                   d.code as driver_code
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            JOIN drivers d ON r.driver_id = d.driver_id
            WHERE ra.season = :season AND r.constructor_id = ANY(:team_ids)
            ORDER BY ra.round, r.position
        """), {"season": season, "team_ids": team_ids})

        rows = [dict(r._mapping) for r in result]
        df = pd.DataFrame(rows)

        if df.empty:
            return {"error": "No data found"}

        summaries = {}
        for tid in team_ids:
            t = df[df["constructor_id"] == tid]
            if t.empty:
                continue
            summaries[tid] = {
                "name": t.iloc[0]["team_name"],
                "color": t.iloc[0]["color_hex"],
                "total_points": float(t.groupby("round")["points"].sum().sum()),
                "wins": int((t["position"] == 1).sum()),
                "podiums": int((t["position"] <= 3).sum()),
                "points_per_round": t.groupby("round")["points"].sum().cumsum().tolist(),
                "drivers": list(t["driver_code"].unique()),
            }

        # Pit stop comparison (last N races)
        pit_result = db.execute(sa.text("""
            SELECT r.constructor_id, ps.driver_id,
                   EXTRACT(EPOCH FROM ps.duration) as duration_seconds
            FROM pit_stops ps
            JOIN results r ON ps.race_id = r.race_id AND ps.driver_id = r.driver_id
            JOIN races ra ON ps.race_id = ra.race_id
            WHERE ra.season = :season AND r.constructor_id = ANY(:team_ids)
        """), {"season": season, "team_ids": team_ids})

        pit_rows = [dict(r._mapping) for r in pit_result]
        if pit_rows:
            pit_df = pd.DataFrame(pit_rows)
            pit_df = pit_df[pit_df["duration_seconds"] < 60]  # Filter slow stops
            for tid in team_ids:
                t_pits = pit_df[pit_df["constructor_id"] == tid]["duration_seconds"]
                if not t_pits.empty and tid in summaries:
                    summaries[tid]["pit_avg"] = round(float(t_pits.mean()), 2)
                    summaries[tid]["pit_fastest"] = round(float(t_pits.min()), 2)
                    summaries[tid]["pit_count"] = int(len(t_pits))

        return {"summaries": summaries}
    finally:
        db.close()


@router.get("/tyres")
def compare_tyres(race_id: int):
    """Tyre analysis for a specific race — stints, degradation, strategy timelines."""
    from analytics.tyre_degradation import tyre_life_analysis

    db = SessionLocal()
    try:
        # Stints
        stint_result = db.execute(sa.text("""
            SELECT s.driver_id, d.code as driver_code, s.stint_number, s.compound,
                   s.lap_start, s.lap_end, c.color_hex as team_color,
                   c.name as team_name
            FROM stints s
            JOIN drivers d ON s.driver_id = d.driver_id
            JOIN results r ON s.race_id = r.race_id AND s.driver_id = r.driver_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE s.race_id = :race_id
            ORDER BY r.position, s.stint_number
        """), {"race_id": race_id})

        stints = [dict(r._mapping) for r in stint_result]
        stints_df = pd.DataFrame(stints) if stints else pd.DataFrame()

        # Tyre life
        tyre_life = pd.DataFrame()
        if not stints_df.empty:
            tyre_life = tyre_life_analysis(stints_df[["compound", "lap_start", "lap_end"]])

        # Pit stops
        pit_result = db.execute(sa.text("""
            SELECT ps.driver_id, d.code as driver_code,
                   ps.stop_number, ps.lap,
                   EXTRACT(EPOCH FROM ps.duration) as duration_seconds
            FROM pit_stops ps
            JOIN drivers d ON ps.driver_id = d.driver_id
            WHERE ps.race_id = :race_id
            ORDER BY ps.driver_id, ps.stop_number
        """), {"race_id": race_id})

        pit_stops = [dict(r._mapping) for r in pit_result]

        return {
            "stints": stints,
            "tyre_life": tyre_life.to_dict(orient="records") if not tyre_life.empty else [],
            "pit_stops": pit_stops,
        }
    finally:
        db.close()


@router.get("/track")
def track_analysis(circuit_id: str, seasons: list[int] = Query(default=None)):
    """Track-specific analysis — historical winners, team dominance, strategy patterns."""
    from analytics.strategy import pit_window_analysis, stop_count_distribution

    db = SessionLocal()
    try:
        # Circuit info
        circuit = db.execute(sa.text(
            "SELECT * FROM circuits WHERE circuit_id = :cid"
        ), {"cid": circuit_id})
        circuit_info = [dict(r._mapping) for r in circuit]
        if not circuit_info:
            raise HTTPException(status_code=404, detail="Circuit not found")

        # Historical winners
        winners_q = db.execute(sa.text("""
            SELECT ra.season, ra.name as race_name,
                   d.driver_id, d.code, d.forename, d.surname,
                   c.constructor_id, c.name as team_name, c.color_hex
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            JOIN drivers d ON r.driver_id = d.driver_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE ra.circuit_id = :cid AND r.position = 1
            ORDER BY ra.season DESC
        """), {"cid": circuit_id})

        winners = [dict(r._mapping) for r in winners_q]

        # Team dominance (win count by constructor)
        team_wins_q = db.execute(sa.text("""
            SELECT c.constructor_id, c.name, c.color_hex, COUNT(*) as wins
            FROM results r
            JOIN races ra ON r.race_id = ra.race_id
            JOIN constructors c ON r.constructor_id = c.constructor_id
            WHERE ra.circuit_id = :cid AND r.position = 1
            GROUP BY c.constructor_id, c.name, c.color_hex
            ORDER BY wins DESC
        """), {"cid": circuit_id})

        team_dominance = [dict(r._mapping) for r in team_wins_q]

        # Pit stop patterns at this circuit
        pit_q = db.execute(sa.text("""
            SELECT ps.race_id, ps.driver_id, ps.stop_number, ps.lap,
                   EXTRACT(EPOCH FROM ps.duration) AS duration_seconds
            FROM pit_stops ps
            JOIN races ra ON ps.race_id = ra.race_id
            WHERE ra.circuit_id = :cid
        """), {"cid": circuit_id})

        pit_rows = [dict(r._mapping) for r in pit_q]
        pit_df = pd.DataFrame(pit_rows) if pit_rows else pd.DataFrame()

        pit_window = pd.DataFrame()
        stop_dist = pd.DataFrame()
        if not pit_df.empty:
            pit_window = pit_window_analysis(pit_df)
            stop_dist = stop_count_distribution(pit_df)

        return {
            "circuit": circuit_info[0],
            "winners": winners,
            "team_dominance": team_dominance,
            "pit_window": pit_window.to_dict("records") if not pit_window.empty else [],
            "stop_distribution": stop_dist.to_dict("records") if not stop_dist.empty else [],
        }
    finally:
        db.close()
