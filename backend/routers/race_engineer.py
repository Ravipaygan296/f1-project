from fastapi import APIRouter, WebSocket, Depends
from engineer.race_engineer_system import (
    PreRaceStrategyTree, LiveDecisionEngine, RaceProjection
)
from backend.models import get_db, engine
from sqlalchemy.orm import Session
from ingestion.openf1_client import get_latest_session, get_weather
import asyncio

router = APIRouter(prefix="/api/engineer", tags=["Race Engineer"])
engines = {}  # session_key (str or int) → LiveDecisionEngine

def auto_setup_engine(session_key_str: str) -> LiveDecisionEngine:
    # Resolve 'latest' if needed
    actual_key = None
    if session_key_str == "latest":
        sess = get_latest_session()
        if sess:
            actual_key = sess.get("session_key")
    else:
        try:
            actual_key = int(session_key_str)
        except ValueError:
            pass

    if not actual_key:
        # Fallback to Bahrain GP 2024 (9158) if nothing is running
        actual_key = 9158

    # Check if already initialized under the actual key
    if actual_key in engines:
        return engines[actual_key]

    # Otherwise, fetch metadata to bootstrap the engine
    circuit_id = "bahrain"  # fallback
    total_laps = 57        # fallback
    our_driver_number = 12 # Kimi Antonelli
    constructor_id = "mercedes"
    qualifying_pos = 5
    track_temp = 30.0

    # Try to fetch live session details from OpenF1
    try:
        sess = get_latest_session()
        if sess and sess.get("session_key") == actual_key:
            country = sess.get("country_name", "")
            # Query circuit_id from DB matching the country
            from backend.models import SessionLocal
            import sqlalchemy as sa
            db = SessionLocal()
            try:
                circ = db.execute(sa.text("SELECT circuit_id FROM circuits WHERE country = :c"), {"c": country}).scalar()
                if circ:
                    circuit_id = circ
            except:
                pass
            finally:
                db.close()

            # Fetch live weather temp
            w_data = get_weather(actual_key)
            if w_data:
                track_temp = float(w_data[-1].get("track_temperature", 30.0))
    except Exception as ex:
        print(f"Error during auto setup metadata fetch: {ex}")

    # Build pre-race strategy tree
    strategy = PreRaceStrategyTree(
        circuit_id, total_laps, 
        str(our_driver_number), engine
    )
    tree = strategy.build(
        qualifying_pos, track_temp, {}
    )
    
    # Initialize live engine
    live_eng = LiveDecisionEngine(
        actual_key, total_laps,
        our_driver_number, constructor_id,
        tree, engine
    )
    engines[actual_key] = live_eng
    engines[session_key_str] = live_eng
    return live_eng

@router.post("/setup/{session_key}")
def setup_race(
    session_key: str,
    our_driver_number: int,
    constructor_id: str,
    circuit_id: str,
    total_laps: int,
    qualifying_position: int,
    track_temp: float
):
    """Called once before race start — builds strategy tree."""
    
    # Build pre-race strategy tree
    strategy = PreRaceStrategyTree(
        circuit_id, total_laps, 
        str(our_driver_number), engine
    )
    tree = strategy.build(
        qualifying_position, track_temp, {}
    )
    
    # Initialize live engine
    engines[session_key] = LiveDecisionEngine(
        session_key, total_laps,
        our_driver_number, constructor_id,
        tree, engine
    )
    
    return {
        "status":        "Race engineer initialized",
        "strategy_tree": tree,
        "message":       "Ready. System will alert on every decision window."
    }

@router.get("/lap/{session_key}/{lap_number}")
def analyze_lap(session_key: str, lap_number: int):
    """Called after every lap — returns full engineer briefing."""
    sys_engine = engines.get(session_key)
    if not sys_engine:
        # Fallback to auto setup
        sys_engine = auto_setup_engine(session_key)
    return sys_engine.analyze_lap(lap_number)

@router.websocket("/live/{session_key}")
async def live_stream(
    websocket: WebSocket, 
    session_key: str
):
    """
    WebSocket: pushes updates to pit wall screen
    automatically after every lap.
    """
    await websocket.accept()
    sys_engine = engines.get(session_key)
    if not sys_engine:
        # Try auto setup
        try:
            sys_engine = auto_setup_engine(session_key)
        except Exception as err:
            await websocket.send_json({"error": f"Failed to initialize session: {err}"})
            return
    
    current_lap = 0
    try:
        while True:
            await asyncio.sleep(10)  # poll every 10 seconds
            briefing = sys_engine.analyze_lap(current_lap)
            
            if briefing and not "error" in briefing and briefing.get("lap", 0) > current_lap:
                current_lap = briefing["lap"]
                await websocket.send_json(briefing)
    except Exception as e:
        print(f"WebSocket closed for session {session_key}: {e}")
