"""
F1 Analytics — FastAPI Main Application
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="F1 Analytics API",
    description="Historical F1 data analysis — driver, team, tyre & track comparisons with AI-powered chat analyst",
    version="1.0.0",
)

# CORS — allow Next.js frontend
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url, 
        "http://localhost:3000", 
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routers
from backend.routers import compare, standings, schedule, chat, live, prediction, live_prediction, race_engineer

app.include_router(compare.router)
app.include_router(standings.router)
app.include_router(schedule.router)
app.include_router(chat.router)
app.include_router(live.router)
app.include_router(prediction.router)
app.include_router(live_prediction.router)
app.include_router(race_engineer.router)


import threading
import time
import schedule
import logging
from ingestion.auto_sync import sync_job

logger = logging.getLogger("backend.scheduler")

def run_sync_scheduler():
    logger.info("Background auto-sync scheduler thread started.")
    
    # Run once immediately on startup
    try:
        logger.info("Running initial database sync...")
        sync_job()
    except Exception as e:
        logger.error(f"Error during initial sync: {e}", exc_info=True)
        
    # Schedule to run every 30 minutes
    schedule.every(30).minutes.do(sync_job)
    
    while True:
        try:
            schedule.run_pending()
        except Exception as e:
            logger.error(f"Error in scheduler run_pending: {e}", exc_info=True)
        time.sleep(10)

@app.on_event("startup")
def start_scheduler():
    if os.environ.get("DATABASE_URL"):
        thread = threading.Thread(target=run_sync_scheduler, daemon=True)
        thread.start()
    else:
        logger.warning("DATABASE_URL not set. Background scheduler not started.")


@app.get("/health")
def health():
    return {"status": "ok", "service": "f1-analytics-api"}


@app.get("/debug-db")
def debug_db():
    from backend.models import SessionLocal
    import sqlalchemy as sa
    db = SessionLocal()
    try:
        races = db.execute(sa.text("SELECT COUNT(*) FROM races WHERE season = 2026")).scalar()
        results = db.execute(sa.text("SELECT COUNT(*) FROM results r JOIN races ra ON r.race_id = ra.race_id WHERE ra.season = 2026")).scalar()
        points_sum = db.execute(sa.text("SELECT SUM(points) FROM results r JOIN races ra ON r.race_id = ra.race_id WHERE ra.season = 2026")).scalar()
        return {"races_count": races, "results_count": results, "points_sum": points_sum}
    finally:
        db.close()



@app.get("/api/seasons")
def get_seasons():
    """List all available seasons."""
    from backend.models import SessionLocal
    db = SessionLocal()
    try:
        result = db.execute(
            __import__("sqlalchemy").text("SELECT year FROM seasons ORDER BY year DESC")
        )
        return {"seasons": [row[0] for row in result]}
    finally:
        db.close()


@app.get("/api/drivers")
def get_drivers(season: int = None):
    """List all drivers, optionally filtered by season."""
    from backend.models import SessionLocal
    import sqlalchemy as sa
    db = SessionLocal()
    try:
        if season:
            result = db.execute(sa.text("""
                SELECT DISTINCT d.driver_id, d.code, d.forename, d.surname, d.nationality,
                       c.constructor_id, c.name as team_name, c.color_hex
                FROM drivers d
                JOIN results r ON d.driver_id = r.driver_id
                JOIN races ra ON r.race_id = ra.race_id
                JOIN constructors c ON r.constructor_id = c.constructor_id
                WHERE ra.season = :season
                ORDER BY d.surname
            """), {"season": season})
        else:
            result = db.execute(sa.text(
                "SELECT driver_id, code, forename, surname, nationality FROM drivers ORDER BY surname"
            ))

        drivers = [dict(row._mapping) for row in result]
        return {"drivers": drivers}
    finally:
        db.close()


@app.get("/api/constructors")
def get_constructors(season: int = None):
    """List all constructors, optionally filtered by season."""
    from backend.models import SessionLocal
    import sqlalchemy as sa
    db = SessionLocal()
    try:
        if season:
            result = db.execute(sa.text("""
                SELECT DISTINCT c.constructor_id, c.name, c.color_hex
                FROM constructors c
                JOIN results r ON c.constructor_id = r.constructor_id
                JOIN races ra ON r.race_id = ra.race_id
                WHERE ra.season = :season
                ORDER BY c.name
            """), {"season": season})
        else:
            result = db.execute(sa.text(
                "SELECT constructor_id, name, color_hex FROM constructors ORDER BY name"
            ))

        constructors = [dict(row._mapping) for row in result]
        return {"constructors": constructors}
    finally:
        db.close()


@app.get("/api/circuits")
def get_circuits():
    """List all circuits."""
    from backend.models import SessionLocal
    import sqlalchemy as sa
    db = SessionLocal()
    try:
        result = db.execute(sa.text(
            "SELECT circuit_id, name, country, locality, lat, lng FROM circuits ORDER BY name"
        ))
        return {"circuits": [dict(row._mapping) for row in result]}
    finally:
        db.close()
