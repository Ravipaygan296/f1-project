import os
import sys
import time
import logging
import schedule
import requests
import json
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.run_ingestion import ingest_jolpica, ingest_openf1_stints, mark_pit_laps, sync_latest_results

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

OPENF1_BASE = "https://api.openf1.org/v1"

def sync_qualifying_grid(session_key: int):
    """
    After qualifying: update estimated grid with real positions.
    This is the single biggest improvement to prediction accuracy.
    """
    try:
        results = requests.get(
            f"{OPENF1_BASE}/position",
            params={"session_key": session_key},
            timeout=15
        ).json()
        
        if not results:
            return
            
        # Get final position for each driver
        # The /position endpoint returns many records per driver. 
        # We need the one with the highest sequence number or just get qualifying results differently.
        # But if the user provided this specific endpoint, we'll use it as requested. 
        # Wait, the user snippet is slightly simplified, it just loops:
        final_positions = {}
        for pos in results:
            driver = pos["driver_number"]
            position = pos["position"]
            final_positions[driver] = position
        
        logger.info(f"Qualifying grid updated: {final_positions}")
        
        # Save to a simple JSON file for now
        os.makedirs("prediction", exist_ok=True)
        with open("prediction/qualifying_grid.json", "w") as f:
            json.dump(final_positions, f)
    except Exception as e:
        logger.error(f"Failed to sync qualifying grid: {e}")

def sync_job():
    """Runs on schedule — checks for new race results and ingests them into our database."""
    logger.info("Starting auto-sync job for current season...")
    from dotenv import load_dotenv
    load_dotenv()
    
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL not set. Cannot run sync.")
        return
        
    try:
        # Phase 1: Smart sync — only fetch results for races missing data (fast!)
        sync_latest_results(db_url, season=2026)
        
        # Phase 2: Update OpenF1 telemetry (stints, weather, etc.)
        ingest_openf1_stints(db_url, [2026])
        
        # Phase 3: Update pit laps
        mark_pit_laps(db_url)

        # Phase 4: Sync latest qualifying grid if available
        try:
            sessions = requests.get(f"{OPENF1_BASE}/sessions?year=2026&session_name=Qualifying").json()
            if sessions:
                latest_quali_key = sessions[-1]["session_key"]
                sync_qualifying_grid(latest_quali_key)
        except Exception as e:
            logger.error(f"Could not fetch qualifying sessions: {e}")
            
        logger.info("Auto-sync job completed successfully.")
    except Exception as e:
        logger.error(f"Auto-sync job failed: {e}")

if __name__ == "__main__":
    logger.info("Auto-sync background worker started. Checking for new F1 sessions every 30 minutes.")
    
    # Run once immediately on start
    sync_job()
    
    # Schedule to run every 30 minutes
    schedule.every(30).minutes.do(sync_job)
    
    while True:
        schedule.run_pending()
        time.sleep(60)
