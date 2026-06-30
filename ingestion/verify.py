import os
import psycopg
from dotenv import load_dotenv

def run_verification():
    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ Error: DATABASE_URL not found in .env")
        return

    print("=== Phase 2 Checkpoint: Data Verification ===")
    
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            # 1. Row counts
            print("\n📊 Checking row counts...")
            tables = ["races", "results", "laps", "stints"]
            for table in tables:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                count = cur.fetchone()[0]
                print(f"  {table}: {count:,} rows")
                if count == 0:
                    print(f"  ❌ ERROR: {table} is empty!")

            # 2. Known Fact 1: Max Verstappen 2023 Wins
            print("\n🏁 Checking Fact 1: Verstappen 2023 Wins (Should be 19)")
            cur.execute("""
                SELECT COUNT(*) 
                FROM results r
                JOIN races rc ON r.race_id = rc.race_id
                JOIN drivers d ON r.driver_id = d.driver_id
                WHERE rc.season = 2023 
                  AND d.driver_id = 'max_verstappen' 
                  AND r.position = 1
            """)
            verstappen_wins = cur.fetchone()[0]
            if verstappen_wins == 19:
                print("  ✅ PASS: Found 19 wins")
            else:
                print(f"  ❌ FAIL: Found {verstappen_wins} wins")

            # 3. Known Fact 2: Charles Leclerc won Monza (Italian GP) 2024
            print("\n🏎️ Checking Fact 2: Charles Leclerc won Monza 2024")
            cur.execute("""
                SELECT d.surname
                FROM results r
                JOIN races rc ON r.race_id = rc.race_id
                JOIN drivers d ON r.driver_id = d.driver_id
                WHERE rc.season = 2024 
                  AND rc.name ILIKE '%Italian%'
                  AND r.position = 1
            """)
            row = cur.fetchone()
            if row and row[0].lower() == 'leclerc':
                print("  ✅ PASS: Leclerc won Monza 2024")
            else:
                winner = row[0] if row else "Unknown"
                print(f"  ❌ FAIL: Expected Leclerc, got {winner}")

            # 4. Known Fact 3: Lando Norris won Miami 2024
            print("\n🌴 Checking Fact 3: Lando Norris won Miami 2024")
            cur.execute("""
                SELECT d.surname
                FROM results r
                JOIN races rc ON r.race_id = rc.race_id
                JOIN drivers d ON r.driver_id = d.driver_id
                WHERE rc.season = 2024 
                  AND rc.name ILIKE '%Miami%'
                  AND r.position = 1
            """)
            row = cur.fetchone()
            if row and row[0].lower() == 'norris':
                print("  ✅ PASS: Norris won Miami 2024")
            else:
                winner = row[0] if row else "Unknown"
                print(f"  ❌ FAIL: Expected Norris, got {winner}")

    print("\n✅ Verification complete!")

if __name__ == "__main__":
    run_verification()
