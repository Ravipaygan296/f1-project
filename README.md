# Telemetry Room — F1 Analytics & Race Engineering System

I built this because I watch every F1 race and I'm finishing my B.S. in Data Science at IIT Madras, and I wanted a project that actually combined both — not a tutorial clone, something I'd genuinely want to use on a race weekend.

It started as "an F1 dashboard" and turned into something a lot bigger: a historical analytics tool, a live race tracker, an AI chat analyst that writes its own SQL, a podium prediction model, and eventually a race-engineer style decision system that tries to flag pit stop windows the way a real pit wall does. I didn't plan all of that at the start — it grew piece by piece as I kept asking "okay but what would actually be useful here."

## What it does

- **Historical analytics** — 2018–2026 season data (results, laps, pit stops, tyre stints) pulled from Jolpica-F1 and OpenF1, normalized into Postgres. Driver vs driver, team vs team, tyre compound analysis, track-specific patterns.
- **Live race tracking** — polls OpenF1 during sessions and shows running order, tyre ages, and gap-based strategy flags. Auto-syncs new race data after every session with a background worker, so I don't have to manually re-run ingestion every race weekend.
- **Race Engineer System** — A real-time pit wall decision support system. It maps out pre-race strategy trees (Clean, SC, rival undercut/overcut scenarios) and monitors live OpenF1 telemetry lap-by-lap, flagging urgent alerts (e.g. tyre cliffs, safety car windows, or reactive covering) with estimated time gains.
- **AI Analyst** — a chat interface where you ask a question in plain English and it writes real SQL against the database, runs it, and answers using only what the query actually returned. It shows the SQL it ran so you can check it yourself. If the data isn't there, it says so instead of guessing.
- **Race prediction** — a Gradient Boosting model trained on 2018–2022 data, validated on 2023, tested on 2024–2025, with calibrated probabilities. It's explicitly labeled as an estimate, not a guarantee, because F1 has real randomness (safety cars, first-lap incidents, mechanical failures) that no model should pretend to predict.

## The stack

Python (FastAPI, pandas, scikit-learn) for the backend and analytics. PostgreSQL for storage. Next.js + React + Recharts for the frontend. Groq's LLaMA 3.3 70B for the AI analyst layer. OpenF1 and Jolpica-F1 as the two data sources — OpenF1 for anything from 2023 onward including live telemetry, Jolpica for the full historical record back further.

## Things that actually broke, and what I learned fixing them

I'm including this section on purpose, because I think the mistakes are more useful than the polished parts.

**Championship points mismatch due to missing Sprint races.** Our initial standings calculations were lower than the official F1 values because the Jolpica `/results.json` endpoint only reports Grand Prix Sunday results. Drivers who scored points in Saturday Sprint races (China, Miami, Canada) were missing those points. We resolved this by querying the `/sprint.json` endpoint and merging those points into the main results, restoring absolute accuracy to the leaderboard.

**API Rate-limiting and slow ingestion sync.** The manual sync took minutes because it re-ingested all 22 rounds of the season sequentially. This often timed out or hit API rate limits. We optimized this by introducing a "smart sync" that detects completed rounds that are currently missing from the DB and queries only those, resulting in a 10x faster sync.

**SQLite vs PostgreSQL syntax.** I started on SQLite for local development since it needed zero setup, but the AI analyst's SQL generation kept defaulting to PostgreSQL syntax (`ILIKE`, which SQLite doesn't have) and reusing the same table alias in subqueries. Both caused real query failures. Fixed it by being explicit in the system prompt about which database engine it's writing for, with worked examples.

**My prediction model was badly wrong before I fixed the features.** Early on, Fernando Alonso was showing up as the top podium probability for the Austrian GP at 53%, ahead of the actual championship leader. The root cause was that circuit history was a flat average across every season Alonso had ever raced at that track, with no weighting for recency or his actual 2026 form (four DNFs that season). Adding season-weighted circuit history and a 2026-specific form feature fixed it.

**The model still got the actual Austria result wrong**, and that taught me the most. Russell won, Verstappen finished second after recovering from a Q3 crash, and Hamilton lost a podium position because Ferrari called him into the pits a lap later than they should have — he literally said "you told me too late" on team radio. None of that — a qualifying crash, a late strategy call, a mid-race VSC that bunched the field — is something a model trained on 2018–2022 data could have known in advance. That's not a bug to fix, it's a real limit on how accurate race prediction can be, and I think being honest about that limit matters more than chasing a number that would only be achievable by overfitting.

## What I'd build next

A proper backtesting harness that runs the prediction model against every race week-by-week instead of one fixed test split, so I can see exactly which features help and which don't per race rather than only in aggregate. I'd also like to expand the Live Race Engineer system to incorporate live in-race probability updates that recalculate after every lap.

## Setup

```bash
# backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your own DATABASE_URL and GROQ_API_KEY
uvicorn backend.main:app --reload

# frontend
cd frontend
npm install
npm run dev
```

## Disclaimer

This is an independent project and isn't affiliated with Formula 1, the FIA, or any team. All data comes from public APIs (Jolpica-F1, OpenF1). Predictions are statistical estimates, not guarantees — please don't use them for betting.
