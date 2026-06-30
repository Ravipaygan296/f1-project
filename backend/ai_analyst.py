"""
F1 Analytics — AI Analyst (Text-to-SQL + Narration)
Uses Groq LLaMA 3.3 70B to convert plain English questions into SQL,
run the query against the database, and narrate the real results.

Same grounding principle as DocuMind AI: the LLM never invents numbers —
it always queries the database and reports what's actually there.
"""

import os
import re
import logging
import pandas as pd
import sqlalchemy as sa
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Groq client (lazy init to avoid import errors if key not set)
_groq_client = None


def _get_groq():
    global _groq_client
    if _groq_client is None:
        from groq import Groq
        _groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    return _groq_client


SCHEMA_DESCRIPTION = """
Tables available (SQLite, read-only):

seasons(year INT PK)

circuits(circuit_id TEXT PK, name TEXT, country TEXT, locality TEXT, lat FLOAT, lng FLOAT)

races(race_id SERIAL PK, season INT FK->seasons, round INT, circuit_id TEXT FK->circuits, name TEXT, race_date DATE)
  UNIQUE(season, round)

constructors(constructor_id TEXT PK, name TEXT, color_hex TEXT)

drivers(driver_id TEXT PK, code TEXT, number INT, forename TEXT, surname TEXT, nationality TEXT)

results(result_id SERIAL PK, race_id INT FK->races, driver_id TEXT FK->drivers, constructor_id TEXT FK->constructors, grid INT, position INT, points FLOAT, status TEXT, fastest_lap_time INTERVAL)

laps(lap_id SERIAL PK, race_id INT FK->races, driver_id TEXT FK->drivers, lap_number INT, lap_time INTERVAL, position INT, is_pit_lap BOOLEAN)

stints(stint_id SERIAL PK, race_id INT FK->races, driver_id TEXT FK->drivers, stint_number INT, compound TEXT, lap_start INT, lap_end INT)
  compound values: SOFT, MEDIUM, HARD, INTERMEDIATE, WET

pit_stops(pit_stop_id SERIAL PK, race_id INT FK->races, driver_id TEXT FK->drivers, stop_number INT, lap INT, duration INTERVAL)

weather(weather_id SERIAL PK, race_id INT FK->races, recorded_at TIMESTAMP, air_temp FLOAT, track_temp FLOAT, humidity FLOAT, rainfall BOOLEAN)

Key relationships:
- results.race_id -> races.race_id, results.driver_id -> drivers.driver_id
- To get lap times in seconds: EXTRACT(EPOCH FROM lap_time)
- To get pit stop duration in seconds: EXTRACT(EPOCH FROM duration)
- Seasons available: 2018-2026
- Stints data available from 2023+ only (OpenF1)
- 2026 season is currently active (data through Round 7 Barcelona GP)
"""

SQL_SYSTEM_PROMPT = f"""You write SQLite SELECT queries to answer F1 analytics questions.

DATABASE: SQLite (NOT PostgreSQL)

CRITICAL RULES — violations cause errors:
1. Use LIKE not ILIKE — SQLite has no ILIKE
2. Use LIKE '%value%' not ILIKE — LIKE is already case-insensitive in SQLite
3. Never use ILIKE, ARRAY, UNNEST, or any PostgreSQL-specific syntax
4. For "last race" or "most recent race" use:
   WHERE ra.race_date = (SELECT MAX(race_date) FROM races)
   NOT a subquery that reuses the same alias
5. Always alias subqueries with a unique name — never reuse 'r', 'ra', 'd'
6. For circuit name search: WHERE ra.name LIKE '%Barcelona%'
7. Only SELECT statements — never INSERT, UPDATE, DELETE

SCHEMA:
{SCHEMA_DESCRIPTION}

EXAMPLE — "winner of last race":
SELECT d.forename, d.surname, ra.name, ra.race_date
FROM results res
JOIN drivers d ON res.driver_id = d.driver_id  
JOIN races ra ON res.race_id = ra.race_id
WHERE ra.race_date = (SELECT MAX(race_date) FROM races)
AND res.position = 1
LIMIT 1

EXAMPLE — "Barcelona 2026 winner":
SELECT d.forename, d.surname
FROM results res
JOIN drivers d ON res.driver_id = d.driver_id
JOIN races ra ON res.race_id = ra.race_id
WHERE ra.name LIKE '%Barcelona%'
AND ra.season = 2026
AND res.position = 1
LIMIT 1

Return ONLY raw SQL. No explanation. No markdown. No backticks."""

NARRATION_SYSTEM_PROMPT = """You are an F1 data analyst narrating query results.

Rules:
1. Answer the question using ONLY the numbers from the query result. Never invent or assume data not present.
2. If the result is empty, say so plainly — don't guess why.
3. Format numbers clearly: lap times as M:SS.mmm, points as integers, gaps with 3 decimal places.
4. Use team and driver names, not IDs.
5. Add brief context (e.g. "this means X was faster by Y seconds per lap") but never speculate beyond what the data shows.
6. Keep the response concise — 2-4 paragraphs max.
"""


def is_safe_select(sql: str) -> bool:
    """
    Defense in depth: reject anything that isn't a single SELECT.
    The DB connection itself is also read-only, but belt + suspenders.
    """
    cleaned = sql.strip().rstrip(";").strip()

    # Must start with SELECT (or WITH for CTEs)
    upper = cleaned.upper()
    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        return False

    # Reject any dangerous keywords
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
                  "CREATE", "GRANT", "REVOKE", "EXECUTE", "EXEC"]
    # Check each word boundary
    for word in forbidden:
        if re.search(rf'\b{word}\b', upper):
            return False

    # Reject multiple statements (semicolons)
    if ";" in cleaned:
        return False

    return True


def ask_analyst(question: str) -> dict:
    """
    Main entry point: question in, grounded answer out.

    Flow:
    1. LLM generates SQL from the question
    2. SQL is validated and run against the read-only DB
    3. Real results are sent back to LLM for narration
    4. Response includes the answer, the SQL, and the raw data
    """
    groq = _get_groq()

    def generate_sql(prompt_text):
        sql_resp = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SQL_SYSTEM_PROMPT},
                {"role": "user", "content": prompt_text},
            ],
            temperature=0,
            max_tokens=1000,
        )
        sql = sql_resp.choices[0].message.content.strip()
        sql = re.sub(r'^```(?:sql)?\s*', '', sql, flags=re.MULTILINE)
        sql = re.sub(r'\s*```$', '', sql, flags=re.MULTILINE)
        return sql.strip()

    # Step 1: Generate SQL
    try:
        sql = generate_sql(question)
    except Exception as e:
        logger.error(f"SQL generation failed: {e}")
        return {"error": f"Could not generate query: {str(e)}", "sql": None, "data": []}

    # Step 2: Validate
    if not is_safe_select(sql):
        logger.warning(f"Unsafe SQL rejected: {sql[:200]}")
        return {
            "error": "The generated query was not a safe SELECT statement. Please rephrase your question.",
            "sql": sql,
            "data": [],
        }

    # Step 3: Run against read-only DB
    from backend.models import engine_readonly
    try:
        result_df = pd.read_sql(sql, engine_readonly)
    except Exception as e:
        logger.warning(f"Query execution failed, retrying: {e}")
        retry_prompt = f"""Previous query failed with error: {str(e)}
        
Failed SQL:
{sql}

Fix the SQL and return only the corrected query.
Remember: SQLite only, use LIKE not ILIKE, 
don't reuse table aliases."""
        try:
            sql = generate_sql(retry_prompt)
            if not is_safe_select(sql):
                raise ValueError("Retried SQL was unsafe.")
            result_df = pd.read_sql(sql, engine_readonly)
        except Exception as e2:
            logger.error(f"Retry query execution failed: {e2}")
            return {
                "error": "Could not answer that question with available data",
                "sql": sql,
                "data": []
            }

    # Step 4: Narrate the REAL result — nothing invented
    data_str = result_df.to_string(index=False) if not result_df.empty else "(empty result set)"

    narration_prompt = f"""User's question: {question}

SQL query that was run:
{sql}

Query result (the ONLY facts you may state):
{data_str}

Answer the user's question using ONLY these numbers. If the result is empty, say so."""

    try:
        narration = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": NARRATION_SYSTEM_PROMPT},
                {"role": "user", "content": narration_prompt},
            ],
            temperature=0.2,
            max_tokens=1500,
        )
        answer = narration.choices[0].message.content
    except Exception as e:
        logger.error(f"Narration failed: {e}")
        answer = f"Query returned {len(result_df)} rows but narration failed. Raw data is available below."

    return {
        "answer": answer,
        "sql": sql,
        "data": result_df.head(50).to_dict(orient="records"),
        "row_count": len(result_df),
    }
