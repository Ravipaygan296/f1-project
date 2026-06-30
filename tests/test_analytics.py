"""
F1 Analytics — Unit Tests for Analytics Engine
These tests verify that computation functions are exactly correct.
"""

import pandas as pd
import pytest
from analytics.pace import compare_pace, pace_delta, lap_by_lap_comparison
from analytics.consistency import compare_consistency, finishing_consistency
from analytics.tyre_degradation import degradation_rate, tyre_life_analysis
from analytics.strategy import compare_strategy, stop_count_distribution


# ========== Pace Tests ==========

class TestPace:
    def test_excludes_pit_laps(self):
        laps = pd.DataFrame([
            {"driver_id": "ver", "lap_time_seconds": 80.0, "is_pit_lap": False},
            {"driver_id": "ver", "lap_time_seconds": 110.0, "is_pit_lap": True},
            {"driver_id": "ver", "lap_time_seconds": 80.5, "is_pit_lap": False},
        ])
        result = compare_pace(laps, ["ver"])
        assert len(result) == 1
        assert result.iloc[0]["median_pace"] == 80.25

    def test_empty_input(self):
        empty = pd.DataFrame(columns=["driver_id", "lap_time_seconds", "is_pit_lap"])
        result = compare_pace(empty, ["ver"])
        assert len(result) == 0

    def test_two_drivers(self):
        laps = pd.DataFrame([
            {"driver_id": "ver", "lap_time_seconds": 79.5, "is_pit_lap": False},
            {"driver_id": "ver", "lap_time_seconds": 80.0, "is_pit_lap": False},
            {"driver_id": "nor", "lap_time_seconds": 80.2, "is_pit_lap": False},
            {"driver_id": "nor", "lap_time_seconds": 80.8, "is_pit_lap": False},
        ])
        result = compare_pace(laps, ["ver", "nor"])
        assert len(result) == 2
        assert result.iloc[0]["driver_id"] == "ver"  # faster

    def test_pace_delta(self):
        laps = pd.DataFrame([
            {"driver_id": "ver", "lap_number": 1, "lap_time_seconds": 80.0},
            {"driver_id": "ver", "lap_number": 2, "lap_time_seconds": 79.5},
            {"driver_id": "nor", "lap_number": 1, "lap_time_seconds": 80.5},
            {"driver_id": "nor", "lap_number": 2, "lap_time_seconds": 80.0},
        ])
        delta = pace_delta(laps, "ver", "nor")
        assert len(delta) == 2
        assert delta.iloc[0]["delta_seconds"] == -0.5  # ver faster by 0.5s

    def test_lap_by_lap(self):
        laps = pd.DataFrame([
            {"driver_id": "ver", "lap_number": 1, "lap_time_seconds": 80.0, "is_pit_lap": False},
            {"driver_id": "ver", "lap_number": 2, "lap_time_seconds": 79.5, "is_pit_lap": False},
        ])
        result = lap_by_lap_comparison(laps, ["ver"])
        assert len(result) == 2


# ========== Consistency Tests ==========

class TestConsistency:
    def test_consistent_driver(self):
        laps = pd.DataFrame([
            {"driver_id": "ver", "lap_time_seconds": 80.0, "is_pit_lap": False},
            {"driver_id": "ver", "lap_time_seconds": 80.1, "is_pit_lap": False},
            {"driver_id": "ver", "lap_time_seconds": 80.0, "is_pit_lap": False},
            {"driver_id": "nor", "lap_time_seconds": 79.0, "is_pit_lap": False},
            {"driver_id": "nor", "lap_time_seconds": 82.0, "is_pit_lap": False},
            {"driver_id": "nor", "lap_time_seconds": 80.0, "is_pit_lap": False},
        ])
        result = compare_consistency(laps, ["ver", "nor"])
        assert result.iloc[0]["driver_id"] == "ver"  # ver is more consistent

    def test_finishing_consistency(self):
        results = pd.DataFrame([
            {"driver_id": "ver", "position": 1},
            {"driver_id": "ver", "position": 2},
            {"driver_id": "ver", "position": 1},
            {"driver_id": "nor", "position": 1},
            {"driver_id": "nor", "position": 10},
            {"driver_id": "nor", "position": 3},
        ])
        result = finishing_consistency(results, ["ver", "nor"])
        assert result.iloc[0]["driver_id"] == "ver"  # lower stddev


# ========== Tyre Degradation Tests ==========

class TestTyreDeg:
    def test_degradation_rate(self):
        stint = pd.DataFrame({
            "lap_in_stint": [1, 2, 3, 4, 5],
            "lap_time_seconds": [80.0, 80.1, 80.2, 80.3, 80.4],
        })
        rate = degradation_rate(stint)
        assert rate is not None
        assert abs(rate - 0.1) < 0.01  # ~0.1s per lap degradation

    def test_too_few_laps(self):
        stint = pd.DataFrame({
            "lap_in_stint": [1, 2],
            "lap_time_seconds": [80.0, 80.1],
        })
        assert degradation_rate(stint) is None

    def test_tyre_life(self):
        stints = pd.DataFrame([
            {"compound": "SOFT", "lap_start": 1, "lap_end": 15},
            {"compound": "MEDIUM", "lap_start": 16, "lap_end": 40},
            {"compound": "HARD", "lap_start": 41, "lap_end": 57},
        ])
        result = tyre_life_analysis(stints)
        assert len(result) == 3
        assert result[result["compound"] == "MEDIUM"].iloc[0]["avg_life_laps"] == 25.0


# ========== Strategy Tests ==========

class TestStrategy:
    def test_compare_strategy(self):
        pits = pd.DataFrame([
            {"driver_id": "ver", "stop_number": 1, "lap": 15, "duration_seconds": 22.5},
            {"driver_id": "ver", "stop_number": 2, "lap": 35, "duration_seconds": 23.0},
            {"driver_id": "nor", "stop_number": 1, "lap": 18, "duration_seconds": 21.8},
        ])
        result = compare_strategy(pits, ["ver", "nor"])
        assert len(result) == 2
        ver = result[result["driver_id"] == "ver"].iloc[0]
        assert ver["stop_count"] == 2

    def test_stop_distribution(self):
        pits = pd.DataFrame([
            {"race_id": 1, "driver_id": "ver", "stop_number": 1, "lap": 15, "duration_seconds": 22.5},
            {"race_id": 1, "driver_id": "ver", "stop_number": 2, "lap": 35, "duration_seconds": 23.0},
            {"race_id": 1, "driver_id": "nor", "stop_number": 1, "lap": 18, "duration_seconds": 21.8},
        ])
        result = stop_count_distribution(pits)
        assert len(result) >= 1


# ========== AI Analyst Safety Tests ==========

class TestSQLSafety:
    def test_safe_select(self):
        from backend.ai_analyst import is_safe_select
        assert is_safe_select("SELECT * FROM drivers") == True
        assert is_safe_select("SELECT d.code FROM drivers d WHERE d.code = 'VER'") == True
        assert is_safe_select("WITH cte AS (SELECT 1) SELECT * FROM cte") == True

    def test_rejects_dangerous(self):
        from backend.ai_analyst import is_safe_select
        assert is_safe_select("DROP TABLE drivers") == False
        assert is_safe_select("DELETE FROM drivers") == False
        assert is_safe_select("INSERT INTO drivers VALUES ('x')") == False
        assert is_safe_select("UPDATE drivers SET code='X'") == False
        assert is_safe_select("SELECT 1; DROP TABLE drivers") == False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
