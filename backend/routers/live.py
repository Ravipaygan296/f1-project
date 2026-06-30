"""
F1 Analytics — Live Race Router
Polls OpenF1 for real-time session data during race weekends.
Falls back to "next race in X days" when no session is active.
"""

from fastapi import APIRouter, BackgroundTasks
from ingestion.openf1_client import (
    get_latest_session, get_live_positions, get_live_intervals,
    get_live_laps, parse_gap,
    get_stints, get_weather, get_drivers
)
from ingestion.jolpica_client import get_current_schedule
from datetime import datetime, date
import asyncio
import json
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/live", tags=["Live"])


@router.get("/status")
def live_status():
    """
    Check if a live session is running.
    Returns session info if active, or next race details if not.
    """
    try:
        session = get_latest_session()
        if session:
            # Check if session is actually live (within last 4 hours)
            session_end = session.get("date_end")
            if session_end:
                try:
                    end_dt = datetime.fromisoformat(session_end.replace("Z", "+00:00"))
                    now = datetime.now(end_dt.tzinfo) if end_dt.tzinfo else datetime.utcnow()
                    is_live = end_dt > now
                except (ValueError, TypeError):
                    is_live = False
            else:
                is_live = True  # No end time = potentially still running

            return {
                "is_live": is_live,
                "session": {
                    "session_key": session.get("session_key"),
                    "session_name": session.get("session_name"),
                    "session_type": session.get("session_type"),
                    "meeting_name": session.get("meeting_name"),
                    "circuit_short_name": session.get("circuit_short_name"),
                    "country_name": session.get("country_name"),
                    "date_start": session.get("date_start"),
                    "date_end": session.get("date_end"),
                },
            }
    except Exception:
        pass

    # Fallback: get next race from Jolpica
    try:
        schedule = get_current_schedule()
        today = date.today()
        for race in schedule:
            race_date = date.fromisoformat(race["date"])
            if race_date >= today:
                return {
                    "is_live": False,
                    "next_race": {
                        "name": race["raceName"],
                        "circuit": race["Circuit"]["circuitName"],
                        "country": race["Circuit"]["Location"]["country"],
                        "date": race["date"],
                        "days_until": (race_date - today).days,
                        "round": race["round"],
                    },
                }
    except Exception:
        pass

    return {"is_live": False, "next_race": None}


@router.get("/positions")
def live_positions():
    """Get current running order from the live/latest session."""
    try:
        session = get_latest_session()
        if not session:
            return {"error": "No active session", "positions": []}

        session_key = session["session_key"]
        positions = get_live_positions()
        drivers = get_drivers(session_key)

        # Build driver lookup
        driver_map = {}
        for d in (drivers or []):
            driver_map[d["driver_number"]] = {
                "name": d.get("full_name", f"#{d['driver_number']}"),
                "code": d.get("name_acronym", str(d["driver_number"])),
                "team": d.get("team_name", ""),
                "team_color": d.get("team_colour", "6B7280"),
            }

        # Get the latest position for each driver
        latest = {}
        for p in (positions or []):
            num = p.get("driver_number")
            if num:
                latest[num] = p

        result = []
        for num, p in sorted(latest.items(), key=lambda x: x[1].get("position", 99)):
            info = driver_map.get(num, {})
            result.append({
                "position": p.get("position"),
                "driver_number": num,
                "driver_code": info.get("code", str(num)),
                "driver_name": info.get("name", f"#{num}"),
                "team": info.get("team", ""),
                "team_color": f"#{info.get('team_color', '6B7280')}",
            })

        return {
            "session": session.get("session_name", ""),
            "positions": result,
        }
    except Exception as e:
        return {"error": str(e), "positions": []}


@router.get("/intervals")
def live_intervals():
    """Get gaps/intervals from the live session, with safe gap parsing."""
    try:
        intervals = get_live_intervals()
        if not intervals:
            return {"intervals": []}

        # Get latest interval per driver
        latest = {}
        for iv in intervals:
            num = iv.get("driver_number")
            if num:
                latest[num] = iv

        result = []
        for num, iv in latest.items():
            gap_leader = parse_gap(iv.get("gap_to_leader"))
            gap_ahead = parse_gap(iv.get("interval"))
            result.append({
                "driver_number": num,
                "gap_to_leader": gap_leader,
                "interval_to_ahead": gap_ahead,
            })

        return {"intervals": result}
    except Exception as e:
        return {"error": str(e), "intervals": []}


@router.get("/strategy")
def live_strategy():
    """
    Live strategy tracker: current tyre stints and pit stops.
    Every insight cites the data point — nothing is invented.
    """
    try:
        session = get_latest_session()
        if not session:
            return {"stints": [], "insights": []}

        session_key = session["session_key"]
        stints = get_stints(session_key)
        drivers = get_drivers(session_key)
        weather = get_weather(session_key)

        driver_map = {}
        for d in (drivers or []):
            driver_map[d["driver_number"]] = {
                "code": d.get("name_acronym", str(d["driver_number"])),
                "team": d.get("team_name", ""),
            }

        # Format stints
        formatted_stints = []
        for s in (stints or []):
            num = s.get("driver_number")
            info = driver_map.get(num, {})
            formatted_stints.append({
                "driver_number": num,
                "driver_code": info.get("code", str(num)),
                "team": info.get("team", ""),
                "stint_number": s.get("stint_number"),
                "compound": s.get("compound"),
                "lap_start": s.get("lap_start"),
                "lap_end": s.get("lap_end"),
                "tyre_age": (s.get("lap_end") or 0) - (s.get("lap_start") or 0) + 1 if s.get("lap_end") else None,
            })

        # Generate grounded insights (observations, not predictions)
        insights = []

        # Latest weather
        if weather:
            latest_w = weather[-1]
            insights.append({
                "type": "weather",
                "text": f"Track temp: {latest_w.get('track_temperature', '?')}°C, "
                        f"Air: {latest_w.get('air_temperature', '?')}°C, "
                        f"Humidity: {latest_w.get('humidity', '?')}%, "
                        f"Rain: {'Yes' if latest_w.get('rainfall') else 'No'}",
            })

        # Tyre age observations
        current_stints = {}
        for s in formatted_stints:
            num = s["driver_number"]
            if num not in current_stints or (s["stint_number"] or 0) > (current_stints[num]["stint_number"] or 0):
                current_stints[num] = s

        for num, s in current_stints.items():
            if s.get("tyre_age") and s["tyre_age"] > 15:
                insights.append({
                    "type": "tyre_age",
                    "text": f"{s['driver_code']} is on {s.get('compound', '?')} tyres, "
                            f"stint age: {s['tyre_age']} laps — potential pit window approaching",
                    "driver": s["driver_code"],
                })

        return {
            "session_name": session.get("session_name", ""),
            "stints": formatted_stints,
            "insights": insights,
        }
    except Exception as e:
        return {"error": str(e), "stints": [], "insights": []}

@router.post("/sync")
def trigger_manual_sync(background_tasks: BackgroundTasks):
    """
    Admin endpoint to manually trigger a database sync.
    Uses smart sync (only missing races) for speed, then full sync as fallback.
    Runs in the background so it doesn't block the HTTP response.
    """
    from ingestion.run_ingestion import sync_latest_results, ingest_openf1_stints, mark_pit_laps
    import os
    from dotenv import load_dotenv
    
    def run_sync():
        load_dotenv()
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            return
        try:
            # Fast path: only fetch missing race results
            sync_latest_results(db_url, season=2026)
            ingest_openf1_stints(db_url, [2026])
            mark_pit_laps(db_url)
        except Exception as e:
            print(f"Manual sync failed: {e}")
            
    background_tasks.add_task(run_sync)
    return {"status": "Sync started in background", "target_season": 2026}


@router.get("/stream")
async def live_stream():
    """
    Live lap-by-lap data streamed as Server-Sent Events (SSE).
    Clients connect once, and updates are pushed continuously.
    """
    async def event_generator():
        while True:
            try:
                # Use to_thread to prevent blocking the async event loop
                positions = await asyncio.to_thread(get_live_positions)
                intervals = await asyncio.to_thread(get_live_intervals)
                
                if positions:
                    latest_iv = {}
                    for iv in (intervals or []):
                        if num := iv.get("driver_number"):
                            latest_iv[num] = iv
                            
                    latest_pos = {}
                    for p in (positions or []):
                        if num := p.get("driver_number"):
                            latest_pos[num] = p
                            
                    for num, p in latest_pos.items():
                        iv = latest_iv.get(num, {})
                        data = {
                            "driver": num,
                            "position": p.get("position"),
                            "gap": parse_gap(iv.get("gap_to_leader")) if iv else ""
                        }
                        yield f"event: position_update\ndata: {json.dumps(data)}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                
            # Poll every 5 seconds
            await asyncio.sleep(5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
