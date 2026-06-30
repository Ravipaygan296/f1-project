import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
db_url = os.environ.get("DATABASE_URL")
print("Connecting to:", db_url)

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        # Check races for 2026
        cur.execute("SELECT race_id, round, name, race_date FROM races WHERE season = 2026 ORDER BY round")
        races = cur.fetchall()
        print(f"2026 Races count: {len(races)}")
        for r in races[:5]:
            print(r)
            
        # Check how many results we have per race in 2026
        cur.execute("""
            SELECT ra.round, ra.name, COUNT(re.result_id) as results_count, SUM(re.points) as total_points
            FROM races ra
            LEFT JOIN results re ON ra.race_id = re.race_id
            WHERE ra.season = 2026
            GROUP BY ra.round, ra.name
            ORDER BY ra.round
        """)
        for row in cur.fetchall():
            print(row)
