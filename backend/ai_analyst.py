"""
F1 Analytics — AI Analyst (Text-to-SQL + Narration)
Uses Groq LLaMA 3.3 70B to convert plain English questions into SQL,
run the query against the database, and narrate the real results.

Same grounding principle as DocuMind AI: the LLM never invents numbers —
it always queries the database and reports what's actually there.

This version adds ENTITY GROUNDING before SQL generation: driver
nicknames, common spelling mistakes, and "is this race in the past or
future" are all resolved against real database values first, so the
LLM never has to guess what "Kimi" or "last race" or "Hamiltn" means.
"""

import os
import re
import logging
from difflib import get_close_matches
from functools import lru_cache

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
  NOTE: this table includes the FULL season calendar, including races
  that have not happened yet. Always filter by race_date when "last",
  "latest", "most recent", or "this year so far" is implied.

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
- races table includes the FULL 2026 calendar (past and future rounds)
"""

SQL_SYSTEM_PROMPT = f"""You write SQLite SELECT queries to answer F1 analytics questions.

DATABASE: SQLite (NOT PostgreSQL)

CRITICAL RULES — violations cause errors:
1. Use LIKE not ILIKE — SQLite has no ILIKE
2. Use LIKE '%value%' not ILIKE — LIKE is already case-insensitive in SQLite
3. Never use ILIKE, ARRAY, UNNEST, or any PostgreSQL-specific syntax
4. Always alias subqueries with a unique name — never reuse 'r', 'ra', 'd'
5. For circuit/race name search: WHERE ra.name LIKE '%Barcelona%'
6. Only SELECT statements — never INSERT, UPDATE, DELETE

DATE-AWARE RULES — the races table includes the FULL season calendar,
including races that have NOT happened yet. Get this wrong and "last
race" silently returns a future, unraced Grand Prix instead of the
most recent completed one.

For "last race" / "most recent race" / "latest race" — ALWAYS filter
to races that have already happened:
    WHERE ra.race_date = (
        SELECT MAX(race_date) FROM races WHERE race_date <= DATE('now')
    )

For "next race" / "upcoming race" — filter to races in the future:
    WHERE ra.race_date = (
        SELECT MIN(race_date) FROM races WHERE race_date > DATE('now')
    )

For "this season's points" / "points this year" / "X's points in 2026"
— SUM points across every completed race in that season, never a
single race:
    SELECT d.forename, d.surname, SUM(res.points) as total_points
    FROM results res
    JOIN drivers d ON res.driver_id = d.driver_id
    JOIN races ra ON res.race_id = ra.race_id
    WHERE ra.season = 2026
      AND ra.race_date <= DATE('now')
      AND <driver name filter>
    GROUP BY res.driver_id

NAME MATCHING — people ask about drivers by nickname or first name
only ("Kimi", "Max", "Checo"). The question you receive has already
been expanded with the driver's real surname in brackets when a
nickname was detected, e.g. "Kimi [Antonelli] points 2026". When you
see a bracketed name like this, match on BOTH the nickname and the
real surname using LIKE, never an exact match on a single field:
    WHERE d.forename LIKE '%Antonelli%' OR d.surname LIKE '%Antonelli%'

SCHEMA:
{SCHEMA_DESCRIPTION}

EXAMPLE — "winner of last race":
SELECT d.forename, d.surname, ra.name, ra.race_date
FROM results res
JOIN drivers d ON res.driver_id = d.driver_id
JOIN races ra ON res.race_id = ra.race_id
WHERE ra.race_date = (
    SELECT MAX(race_date) FROM races WHERE race_date <= DATE('now')
)
AND res.position = 1
LIMIT 1

EXAMPLE — "Kimi [Antonelli] points this year":
SELECT d.forename, d.surname, SUM(res.points) as total_points
FROM results res
JOIN drivers d ON res.driver_id = d.driver_id
JOIN races ra ON res.race_id = ra.race_id
WHERE (d.forename LIKE '%Antonelli%' OR d.surname LIKE '%Antonelli%')
  AND ra.season = 2026
  AND ra.race_date <= DATE('now')
GROUP BY res.driver_id

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

# ──────────────────────────────────────────────────────────────────
# ENTITY GROUNDING — driver nicknames, spelling correction
# ──────────────────────────────────────────────────────────────────

# Common nicknames / short names -> real surname.
# This is the fast path for predictable cases like "Kimi" -> Antonelli.
# It runs before fuzzy matching, which catches genuine typos.
DRIVER_NICKNAMES = {
    "kimi":     "Antonelli",   # Andrea Kimi Antonelli
    "max":      "Verstappen",
    "lewis":    "Hamilton",
    "charles":  "Leclerc",
    "lando":    "Norris",
    "oscar":    "Piastri",
    "george":   "Russell",
    "checo":    "Perez",
    "carlos":   "Sainz",
    "fernando": "Alonso",
    "alex":     "Albon",
    "yuki":     "Tsunoda",
    "ollie":    "Bearman",
    "franco":   "Colapinto",
}


@lru_cache(maxsize=1)
def get_known_entities() -> dict:
    """
    Pull the real, correctly-spelled names from the DB once and cache
    them. Used for both nickname resolution and typo correction, so
    the LLM is always grounded against what's actually in the data
    rather than guessing.
    """
    from backend.models import engine_readonly

    drivers_df = pd.read_sql(
        "SELECT DISTINCT forename, surname FROM drivers", engine_readonly
    )
    constructors_df = pd.read_sql(
        "SELECT DISTINCT name FROM constructors", engine_readonly
    )
    races_df = pd.read_sql(
        "SELECT DISTINCT name FROM races", engine_readonly
    )

    driver_names = set()
    for _, row in drivers_df.iterrows():
        if row["forename"]:
            driver_names.add(row["forename"])
        if row["surname"]:
            driver_names.add(row["surname"])

    return {
        "drivers":      sorted(driver_names),
        "constructors": sorted(constructors_df["name"].dropna().unique().tolist()),
        "circuits":     sorted(races_df["name"].dropna().unique().tolist()),
    }


def resolve_nicknames(question: str) -> tuple[str, list[dict]]:
    """
    Expand known nicknames into 'nickname [Surname]' so the SQL
    generation step can match on either. Handles the common,
    predictable cases (Kimi, Max, Checo) without needing fuzzy
    matching for them.
    """
    corrections = []
    words = question.split()
    out_words = []

    for word in words:
        clean = word.strip(".,?!").lower()
        if clean in DRIVER_NICKNAMES:
            surname = DRIVER_NICKNAMES[clean]
            out_words.append(f"{word} [{surname}]")
            corrections.append({"from": word, "to": surname, "type": "nickname"})
        else:
            out_words.append(word)

    return " ".join(out_words), corrections


def correct_spelling(question: str, known_entities: dict) -> tuple[str, list[dict]]:
    """
    Catch genuine typos ('Hamiltn', 'verstapen', 'mclarn') by fuzzy
    matching against real driver/constructor/circuit names pulled
    straight from the database. Runs after nickname resolution so it
    doesn't fight with the bracket expansion above.
    """
    corrections = []
    all_names = (
        known_entities["drivers"]
        + known_entities["constructors"]
        + known_entities["circuits"]
    )
    lower_lookup = {n.lower(): n for n in all_names}

    words = question.split()
    out_words = []

    for word in words:
        # Skip words that already got bracket-expanded by nickname resolution
        if "[" in word or len(word) < 4:
            out_words.append(word)
            continue

        clean = word.strip(".,?!").lower()

        if clean in lower_lookup:
            out_words.append(word)  # already correct, just different case
            continue

        matches = get_close_matches(clean, lower_lookup.keys(), n=1, cutoff=0.75)
        if matches:
            real_name = lower_lookup[matches[0]]
            out_words.append(f"{word} [{real_name}]")
            corrections.append({"from": word, "to": real_name, "type": "spelling"})
        else:
            out_words.append(word)

    return " ".join(out_words), corrections


def ground_question(question: str) -> tuple[str, list[dict]]:
    """
    Full entity grounding pipeline: nicknames first, then spelling
    correction on whatever's left. Returns the expanded question and
    a list of every correction made, so the API can be transparent
    about what it changed instead of silently guessing.
    """
    try:
        known_entities = get_known_entities()
    except Exception as e:
        logger.warning(f"Could not load known entities, skipping grounding: {e}")
        return question, []

    q, nickname_corrections = resolve_nicknames(question)
    q, spelling_corrections = correct_spelling(q, known_entities)

    return q, nickname_corrections + spelling_corrections


# ──────────────────────────────────────────────────────────────────
# SQL SAFETY
# ──────────────────────────────────────────────────────────────────

def is_safe_select(sql: str) -> bool:
    """
    Defense in depth: reject anything that isn't a single SELECT.
    The DB connection itself is also read-only, but belt + suspenders.
    """
    cleaned = sql.strip().rstrip(";").strip()
    upper = cleaned.upper()

    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        return False

    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
                 "CREATE", "GRANT", "REVOKE", "EXECUTE", "EXEC"]
    for word in forbidden:
        if re.search(rf'\b{word}\b', upper):
            return False

    if ";" in cleaned:
        return False

    return True


# ──────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ──────────────────────────────────────────────────────────────────

def ask_analyst(question: str) -> dict:
    """
    Main entry point: question in, grounded answer out.

    Flow:
    1. Question is grounded against real DB entities (nicknames, typos)
    2. LLM generates SQL from the grounded question
    3. SQL is validated and run against the read-only DB
    4. Real results are sent back to LLM for narration
    5. Response includes the answer, the SQL, the raw data, and any
       corrections that were silently applied (shown to the user,
       never hidden — same grounding discipline as the SQL itself)
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

    # Step 0: Ground the question against real entities
    grounded_question, corrections = ground_question(question)

    # Step 1: Generate SQL from the grounded question
    try:
        sql = generate_sql(grounded_question)
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

Original question: {grounded_question}

Fix the SQL and return only the corrected query.
Remember: SQLite only, use LIKE not ILIKE, don't reuse table aliases,
and filter race_date <= DATE('now') for "last"/"most recent" queries."""
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
                "data": [],
            }

    # Step 4: If the result is suspiciously empty but we did NOT ground
    # any entities, it's worth one more attempt with explicit
    # nickname/typo hints — covers cases the regex-based grounding
    # missed (e.g. a nickname not in our dictionary).
    if result_df.empty and not corrections:
        logger.info("Empty result with no grounding applied — retrying with hint")
        retry_prompt = f"""The following query returned no rows:
{sql}

Original question: {question}

This may be because a driver/team/circuit name in the question is a
nickname, shorthand, or slightly misspelled version of the name
stored in the database. Try matching with LIKE '%fragment%' on both
forename and surname instead of an exact match, and double check
season/date filters aren't excluding valid rows. Return only the
corrected SQL."""
        try:
            retry_sql = generate_sql(retry_prompt)
            if is_safe_select(retry_sql):
                retry_df = pd.read_sql(retry_sql, engine_readonly)
                if not retry_df.empty:
                    sql = retry_sql
                    result_df = retry_df
        except Exception as e:
            logger.warning(f"Empty-result retry failed, keeping original empty result: {e}")

    # Step 5: Narrate the REAL result — nothing invented
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

    response = {
        "answer": answer,
        "sql": sql,
        "data": result_df.head(50).to_dict(orient="records"),
        "row_count": len(result_df),
    }

    if corrections:
        response["corrections"] = corrections

    return response