from fastapi import APIRouter, WebSocket, Depends
from engineer.race_engineer_system import (
    PreRaceStrategyTree, LiveDecisionEngine, RaceProjection
)
from backend.models import get_db, engine
from sqlalchemy.orm import Session
import asyncio

router = APIRouter(prefix="/api/engineer", tags=["Race Engineer"])
engines = {}  # session_key → LiveDecisionEngine

@router.post("/setup/{session_key}")
def setup_race(
    session_key: int,
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
def analyze_lap(session_key: int, lap_number: int):
    """Called after every lap — returns full engineer briefing."""
    sys_engine = engines.get(session_key)
    if not sys_engine:
        return {"error": "Session not initialized"}
    return sys_engine.analyze_lap(lap_number)

@router.websocket("/live/{session_key}")
async def live_stream(
    websocket: WebSocket, 
    session_key: int
):
    """
    WebSocket: pushes updates to pit wall screen
    automatically after every lap.
    """
    await websocket.accept()
    sys_engine = engines.get(session_key)
    if not sys_engine:
        await websocket.send_json({"error": "Not initialized"})
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
