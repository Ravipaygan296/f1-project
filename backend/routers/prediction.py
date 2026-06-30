"""
F1 Analytics — Prediction Router
Exposes ML-based podium probability predictions via REST API.
"""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/prediction", tags=["Prediction"])


@router.get("/race/{race_id}")
def get_race_prediction(race_id: int):
    """Predict podium probabilities for a specific race."""
    try:
        from prediction.serve import predict_race
        predictions = predict_race(race_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    if not predictions:
        return {
            "race_id": race_id,
            "predictions": [],
            "error": "No grid data found for this race. Predictions require qualifying results.",
        }

    return {
        "race_id": race_id,
        "predictions": predictions,
        "disclaimer": "Model estimates based on historical patterns. "
                      "Not a guarantee of race outcome.",
        "model_info": {
            "trained_on": "2018–2022 seasons",
            "validated_on": "2023 season",
            "tested_on": "2024–2025 seasons",
            "features": ["grid_position", "driver_recent_form",
                         "constructor_recent_form", "circuit_history"],
        }
    }


@router.get("/season/{season}")
def get_season_prediction(season: int):
    """
    Predict the next upcoming race in a season.
    If all races are done, predicts the last completed race.
    """
    try:
        from prediction.serve import predict_next_race
        result = predict_next_race(season)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    if "error" in result:
        return result

    result["disclaimer"] = (
        "Model estimates based on historical patterns. "
        "Not a guarantee of race outcome."
    )
    return result


@router.get("/races/{season}")
def get_predictable_races(season: int):
    """List all races in a season that have grid data (can be predicted)."""
    from backend.models import SessionLocal
    import sqlalchemy as sa

    db = SessionLocal()
    try:
        result = db.execute(sa.text("""
            SELECT DISTINCT ra.race_id, ra.round, ra.name, ra.race_date
            FROM races ra
            JOIN results r ON ra.race_id = r.race_id
            WHERE ra.season = :season
              AND r.grid IS NOT NULL AND r.grid > 0
            ORDER BY ra.round
        """), {"season": season})
        races = [dict(r._mapping) for r in result]
        for race in races:
            if race.get("race_date"):
                race["race_date"] = str(race["race_date"])
        return {"races": races, "season": season}
    finally:
        db.close()


@router.get("/next-race")
def get_next_race_prediction(season: int = 2026):
    """
    RAG-augmented prediction for the next race.
    Combines: ML baseline + real OpenF1 practice times + verified incidents.
    Every adjustment cites its exact source.
    """
    try:
        from prediction.next_race_predictor import predict_next_race_full
        result = predict_next_race_full(season)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    if "error" in result:
        return result

    return result


@router.delete("/next-race/cache")
def clear_prediction_cache():
    """Clear the prediction cache to force a fresh computation."""
    from pathlib import Path
    cache = Path(__file__).parent.parent.parent / "prediction" / "next_race_cache.json"
    if cache.exists():
        cache.unlink()
        return {"status": "Cache cleared"}
    return {"status": "No cache to clear"}

