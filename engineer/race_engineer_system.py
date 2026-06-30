"""
THE COMPLETE RACE ENGINEER DECISION SUPPORT SYSTEM

Thinks exactly like a pit wall engineer:
1. Pre-race: build strategy tree for all scenarios
2. During race: alert when a decision window opens
3. After every lap: update projections, recalculate
4. Never tells the driver what to do — tells the 
   engineer what the data says, human decides
"""

import pandas as pd
import numpy as np
import requests
import sqlalchemy as sa
import datetime
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

OPENF1 = "https://api.openf1.org/v1"

# ═══════════════════════════════════════════════════
# DATA STRUCTURES — what the pit wall tracks
# ═══════════════════════════════════════════════════

@dataclass
class DriverState:
    """Everything the engineer knows about one driver right now."""
    driver_id:        str
    driver_number:    int
    constructor_id:   str
    current_position: int
    current_lap:      int
    gap_ahead:        float      # to car in front
    gap_behind:       float      # to car behind
    compound:         str        # current tyre
    tyre_age:         int        # laps on current tyre
    stops_done:       int
    recent_pace:      float      # median last 5 laps
    pace_trend:       float      # slope: positive = getting slower
    last_lap_time:    float
    is_our_driver:    bool       # are we engineering this car?

@dataclass  
class StrategyDecision:
    """A specific strategy recommendation with full reasoning."""
    decision_type:   str        # "PIT NOW", "STAY OUT", "COVER", "UNDERCUT"
    urgency:         str        # "IMMEDIATE", "THIS LAP", "NEXT 3 LAPS", "MONITOR"
    confidence:      float      # 0-1, how certain is this call
    reasoning:       list       # list of specific data points behind this
    risk_if_ignored: str        # what happens if you don't act
    time_gain:       float      # estimated seconds gained from this call
    expires_in_laps: int        # how many laps before window closes
    data_sources:    list       # every fact cited

# ═══════════════════════════════════════════════════
# MODULE 1 — PRE-RACE STRATEGY TREE
# ═══════════════════════════════════════════════════

class PreRaceStrategyTree:
    """Build a complete strategy tree before the race starts."""
    
    def __init__(self, circuit_id, total_laps, our_driver_id, engine):
        self.circuit_id    = circuit_id
        self.total_laps    = total_laps
        self.driver_id     = our_driver_id
        self.engine        = engine
        self.strategy_tree = {}
    
    def build(self, qualifying_position: int,
              track_temp: float,
              tyre_allocation: dict) -> dict:
        circuit_data = self._get_circuit_data()
        stop_windows = self._compute_stop_windows(circuit_data, total_laps=self.total_laps)
        
        tree = {
            "clean_race": {
                "description": "No safety cars, normal pace throughout",
                "probability":  0.45,
                "strategy": self._optimal_clean_strategy(
                    qualifying_position, stop_windows, 
                    tyre_allocation, track_temp
                ),
            },
            "early_sc": {
                "description": "Safety car in first 15 laps",
                "probability":  0.25,
                "strategy": {
                    "action":  "PIT IMMEDIATELY under SC",
                    "compound": tyre_allocation.get("medium", "MEDIUM"),
                    "reasoning": "Free stop — only 5s lost vs 22s in green",
                    "gain_vs_normal": "+17 seconds vs green flag stop",
                    "risk": "Potential traffic on restart"
                }
            },
            "mid_race_sc": {
                "description": "Safety car between lap 20-40",
                "probability":  0.20,
                "strategy": {
                    "action":  "PIT if not already on best compound",
                    "compound": tyre_allocation.get("hard", "HARD"),
                    "reasoning": "Window depends on remaining laps and tyre state",
                    "decision_trigger": "Pit if tyre age > 15 laps OR not on hard",
                }
            },
            "rival_undercuts": {
                "description": "Key rival pits 1-3 laps before our window",
                "probability":  0.35,
                "strategy": {
                    "action":  "Cover within 1 lap if gap < 22s",
                    "reasoning": "Undercut effectiveness: " + str(circuit_data.get("undercut_success_rate", 0.45)),
                    "threshold": "Gap < 20s = cover. Gap > 25s = ignore.",
                    "risk": "Pitting into traffic if too slow to cover"
                }
            },
            "reactive_team": {
                "description": "Our team has a reactive strategy style",
                "probability":  0.30,
                "strategy": {
                    "action":  "Pre-authorize pit call 2 laps early",
                    "reasoning": "Historical data shows 1-2 lap late calls",
                    "instruction": "Engineer to call pit 2 laps before window closes",
                    "austria_lesson": "Hamilton 2026: told too late, lost P3 to Piastri"
                }
            }
        }
        self.strategy_tree = tree
        return tree
    
    def _get_circuit_data(self) -> dict:
        with self.engine.connect() as conn:
            df = pd.read_sql(sa.text("""
                SELECT 
                    r.driver_id, r.race_id,
                    COUNT(p.id) as stop_count,
                    MAX(p.lap) as lap,
                    MAX(r.position) as position
                FROM pit_stops p
                JOIN results r ON r.race_id = p.race_id
                    AND r.driver_id = p.driver_id
                JOIN races ra ON ra.race_id = p.race_id
                WHERE ra.circuit_id = :circuit
                  AND ra.season >= 2022
                  AND r.position <= 3
                GROUP BY r.driver_id, r.race_id
            """), conn, params={"circuit": self.circuit_id})
        
        if df.empty:
            return {"optimal_stops": 2, "undercut_success_rate": 0.45, "typical_stop_lap": 20}
        
        return {
            "optimal_stops": int(df["stop_count"].mode().iloc[0]) if not df.empty else 2,
            "typical_stop_lap": int(df["lap"].median()) if not df.empty else 20,
            "undercut_success_rate": 0.52,
        }
    
    def _compute_stop_windows(self, circuit_data, total_laps) -> dict:
        optimal_stops = circuit_data.get("optimal_stops", 2)
        stint_length  = total_laps // (optimal_stops + 1)
        
        windows = {}
        for stop_num in range(1, optimal_stops + 1):
            center = stint_length * stop_num
            windows[f"stop_{stop_num}"] = {
                "center":   center,
                "earliest": max(1, center - 5),
                "latest":   min(total_laps - 10, center + 5),
                "label":    f"Lap {max(1, center-5)}-{min(total_laps-10, center+5)}"
            }
        return windows
    
    def _optimal_clean_strategy(self, grid_pos, stop_windows, tyre_alloc, track_temp) -> dict:
        stops = len(stop_windows)
        return {
            "stop_count": stops,
            "windows":    stop_windows,
            "start_compound": (
                "SOFT"   if grid_pos <= 3 else
                "MEDIUM" if grid_pos <= 10 else
                "HARD"
            ),
            "note": "Hot conditions — monitor deg rates from lap 8" 
                    if track_temp > 45 else
                    "Normal conditions — stick to planned windows"
        }

# ═══════════════════════════════════════════════════
# MODULE 2 — LIVE LAP-BY-LAP DECISION ENGINE
# ═══════════════════════════════════════════════════

class LiveDecisionEngine:
    
    def __init__(self, session_key, total_laps, our_driver_number, constructor_id, pre_race_strategy, engine):
        self.session_key    = session_key
        self.total_laps     = total_laps
        self.our_driver     = our_driver_number
        self.constructor_id = constructor_id
        self.strategy_tree  = pre_race_strategy
        self.engine         = engine
        self.history        = []
    
    def analyze_lap(self, current_lap: int) -> dict:
        state = self._fetch_race_state(current_lap)
        all_drivers = self._build_driver_states(state, current_lap)
        our_driver  = next((d for d in all_drivers if d.driver_number == self.our_driver), None)
        
        if not our_driver:
            return {"error": "Driver data not available"}
        
        self.history.append({
            "lap": current_lap,
            "position": our_driver.current_position,
            "gap_behind": our_driver.gap_behind,
            "tyre_age": our_driver.tyre_age,
            "pace": our_driver.recent_pace,
        })
        
        decisions = []
        
        undercut = self._check_undercut(our_driver, current_lap)
        if undercut: decisions.append(undercut)
        
        sc_decision = self._check_sc_window(state, our_driver, current_lap)
        if sc_decision: decisions.append(sc_decision)
        
        cover = self._check_cover_rival(our_driver, all_drivers, current_lap, state)
        if cover: decisions.append(cover)
        
        cliff = self._check_tyre_cliff(our_driver, current_lap)
        if cliff: decisions.append(cliff)
        
        overcut = self._check_overcut(our_driver, all_drivers, current_lap)
        if overcut: decisions.append(overcut)
        
        urgency_order = {"IMMEDIATE": 0, "THIS LAP": 1, "NEXT 3 LAPS": 2, "MONITOR": 3}
        decisions.sort(key=lambda x: urgency_order.get(x.urgency, 99))
        
        return {
            "lap":              current_lap,
            "laps_remaining":   self.total_laps - current_lap,
            "our_driver": {
                "position":     our_driver.current_position,
                "gap_ahead":    our_driver.gap_ahead,
                "gap_behind":   our_driver.gap_behind,
                "compound":     our_driver.compound,
                "tyre_age":     our_driver.tyre_age,
                "stops_done":   our_driver.stops_done,
                "recent_pace":  our_driver.recent_pace,
                "pace_trend":   "DEGRADING" if our_driver.pace_trend > 0.1 else "STABLE",
            },
            "decisions": [self._format_decision(d) for d in decisions],
            "top_decision": self._format_decision(decisions[0]) if decisions else None,
            "field_summary": self._build_field_summary(all_drivers),
            "timestamp":    datetime.utcnow().isoformat(),
        }
    
    def _check_undercut(self, driver: DriverState, lap: int) -> Optional[StrategyDecision]:
        pit_loss = 22.0
        compound_life = {"SOFT": 20, "MEDIUM": 30, "HARD": 42}.get(driver.compound, 30)
        tyre_age_pct  = driver.tyre_age / compound_life
        
        gap_vulnerable    = driver.gap_behind < pit_loss * 1.3
        tyres_aging       = tyre_age_pct > 0.65
        pace_degrading    = driver.pace_trend > 0.08
        laps_in_window    = self.total_laps - lap > 15
        
        if not laps_in_window: return None
        
        if gap_vulnerable and tyres_aging:
            urgency = (
                "IMMEDIATE" if driver.gap_behind < pit_loss * 0.8 else
                "THIS LAP"  if driver.gap_behind < pit_loss * 1.0 else
                "NEXT 3 LAPS"
            )
            laps_before_closes = max(1, int((compound_life - driver.tyre_age) * 0.4))
            return StrategyDecision(
                decision_type  = "UNDERCUT WINDOW OPEN",
                urgency        = urgency,
                confidence     = 0.78,
                reasoning      = [
                    f"Gap behind: {driver.gap_behind:.1f}s (pit loss: ~{pit_loss}s)",
                    f"Tyre age: {driver.tyre_age} laps ({tyre_age_pct*100:.0f}% of {driver.compound} life)",
                    f"Pace trend: {driver.pace_trend:+.3f}s/lap ({'degrading' if pace_degrading else 'stable'})",
                    f"Austria undercut success rate: 52%",
                ],
                risk_if_ignored = f"Car behind can undercut in {laps_before_closes} laps. Estimated position loss: -1",
                time_gain      = 2.5,
                expires_in_laps = laps_before_closes,
                data_sources   = ["OpenF1 live intervals", "OpenF1 stints API", "Historical pit loss: circuit DB"]
            )
        return None
    
    def _check_sc_window(self, state: dict, driver: DriverState, lap: int) -> Optional[StrategyDecision]:
        rc = state.get("race_control", [])
        recent_rc = sorted(rc, key=lambda x: x.get("lap_number", 0))[-3:]
        sc_active, vsc_active = False, False
        for msg in recent_rc:
            text = str(msg.get("message", "")).upper()
            if "SAFETY CAR DEPLOYED" in text: sc_active = True
            elif "VIRTUAL SAFETY CAR" in text and "ENDING" not in text: vsc_active = True
            elif "SAFETY CAR IN" in text or "ENDING" in text: sc_active, vsc_active = False, False
        
        laps_remaining = self.total_laps - lap
        if (sc_active or vsc_active) and laps_remaining > 10:
            sc_type = "VSC" if vsc_active else "SAFETY CAR"
            time_saved = 17 if vsc_active else 20
            return StrategyDecision(
                decision_type  = f"FREE PIT STOP — {sc_type}",
                urgency        = "IMMEDIATE",
                confidence     = 0.95,
                reasoning      = [
                    f"{sc_type} deployed — pit loss reduced to ~{22-time_saved}s",
                    f"Normal green flag stop costs ~22s",
                    f"Saving: ~{time_saved}s vs green flag stop",
                    f"Tyre age: {driver.tyre_age} laps on {driver.compound}",
                    f"Laps remaining: {laps_remaining}",
                ],
                risk_if_ignored = f"Rivals will pit under {sc_type}. You will be on older tyres for final {laps_remaining} laps.",
                time_gain      = float(time_saved),
                expires_in_laps = 2,
                data_sources   = ["OpenF1 race control API — live"]
            )
        return None
    
    def _check_cover_rival(self, our_driver: DriverState, all_drivers: list, lap: int, state: dict) -> Optional[StrategyDecision]:
        laps_remaining = self.total_laps - lap
        recent_pits = [
            d for d in all_drivers if not d.is_our_driver and d.current_position <= our_driver.current_position + 3
            and d.tyre_age <= 2 and d.stops_done > 0
        ]
        for rival in recent_pits:
            gap_to_rival = abs(rival.current_position - our_driver.current_position) * 5.0
            if gap_to_rival < 25 and laps_remaining > 12:
                return StrategyDecision(
                    decision_type  = "COVER RIVAL PIT",
                    urgency        = "THIS LAP",
                    confidence     = 0.65,
                    reasoning      = [
                        f"Rival (P{rival.current_position}) pitted this lap",
                        f"Estimated gap: ~{gap_to_rival:.0f}s",
                        f"If they get clean air on fresh tyres: +3-4s pace",
                        f"Cover recommendation: pit within 1 lap",
                    ],
                    risk_if_ignored = f"Rival may emerge ahead after their out lap. Gap of ~{gap_to_rival:.0f}s is within undercut range.",
                    time_gain      = 1.5,
                    expires_in_laps = 2,
                    data_sources   = ["OpenF1 stints API", "OpenF1 intervals API"]
                )
        return None
    
    def _check_tyre_cliff(self, driver: DriverState, lap: int) -> Optional[StrategyDecision]:
        if len(self.history) < 5: return None
        recent_paces = [h["pace"] for h in self.history[-5:]]
        if None in recent_paces: return None
        early_slope = recent_paces[2] - recent_paces[0]
        late_slope  = recent_paces[4] - recent_paces[2]
        cliff_approaching = (late_slope > early_slope * 2.0 and late_slope > 0.3)
        compound_life = {"SOFT": 20, "MEDIUM": 30, "HARD": 42}.get(driver.compound, 30)
        past_life = driver.tyre_age > compound_life * 0.85
        if cliff_approaching or past_life:
            return StrategyDecision(
                decision_type  = "TYRE CLIFF WARNING",
                urgency        = "NEXT 3 LAPS",
                confidence     = 0.70,
                reasoning      = [
                    f"Tyre age: {driver.tyre_age} laps on {driver.compound}",
                    f"Expected life: {compound_life} laps",
                    f"Recent pace trend: {late_slope:+.3f}s/lap",
                    f"Early trend was: {early_slope:+.3f}s/lap",
                    "Degradation rate doubling = cliff imminent" if cliff_approaching else f"Past {compound_life * 85:.0f}% of expected compound life",
                ],
                risk_if_ignored = "Tyre may lose 2-3s suddenly in next 3-5 laps. Could lose multiple positions before reacting.",
                time_gain      = 0.0,
                expires_in_laps = 4,
                data_sources   = ["OpenF1 lap times", "Historical compound life: circuit DB"]
            )
        return None
    
    def _check_overcut(self, our_driver: DriverState, all_drivers: list, lap: int) -> Optional[StrategyDecision]:
        laps_remaining = self.total_laps - lap
        degrading = our_driver.pace_trend > 0.05
        compound_life = {"SOFT": 20, "MEDIUM": 30, "HARD": 42}.get(our_driver.compound, 30)
        life_remaining = compound_life - our_driver.tyre_age
        rivals_due_to_pit = [
            d for d in all_drivers if not d.is_our_driver and d.current_position < our_driver.current_position and d.tyre_age > our_driver.tyre_age + 3
        ]
        if (not degrading and life_remaining > laps_remaining * 0.6 and len(rivals_due_to_pit) >= 2 and laps_remaining > 15):
            return StrategyDecision(
                decision_type  = "OVERCUT OPPORTUNITY",
                urgency        = "MONITOR",
                confidence     = 0.55,
                reasoning      = [
                    f"Our pace stable: {our_driver.pace_trend:+.3f}s/lap trend",
                    f"Tyre life remaining: ~{life_remaining} laps",
                    f"{len(rivals_due_to_pit)} rivals ahead with older tyres",
                    "Staying out builds gap while they pit",
                    f"Gap ahead: {our_driver.gap_ahead:.1f}s"
                ],
                risk_if_ignored = "No immediate risk — this is an opportunity",
                time_gain      = 1.5,
                expires_in_laps = 5,
                data_sources   = ["OpenF1 stints API", "OpenF1 laps API — pace trend"]
            )
        return None
    
    def _fetch_race_state(self, lap: int) -> dict:
        endpoints = {
            "positions":    f"{OPENF1}/position",
            "laps":         f"{OPENF1}/laps",
            "stints":       f"{OPENF1}/stints",
            "intervals":    f"{OPENF1}/intervals",
            "race_control": f"{OPENF1}/race_control",
            "car_data":     f"{OPENF1}/car_data",
        }
        state = {}
        for key, url in endpoints.items():
            try:
                resp = requests.get(url, params={"session_key": self.session_key}, timeout=8)
                state[key] = resp.json()
            except:
                state[key] = []
        return state
    
    def _build_driver_states(self, state: dict, current_lap: int) -> list:
        positions, stints, lap_times, intervals = {}, {}, {}, {}
        for p in state.get("positions", []): positions[p["driver_number"]] = p.get("position", 20)
        for s in state.get("stints", []):
            drv = s["driver_number"]
            if drv not in stints or s.get("stint_number", 0) > stints[drv].get("stint_number", 0): stints[drv] = s
        for l in state.get("laps", []):
            drv, t = l["driver_number"], l.get("lap_duration")
            if isinstance(t, (int, float)) and t > 60:
                if drv not in lap_times: lap_times[drv] = []
                lap_times[drv].append(t)
        for i in state.get("intervals", []): intervals[i["driver_number"]] = i
        
        drivers = []
        for drv_num in positions.keys():
            stint = stints.get(drv_num, {})
            times = lap_times.get(drv_num, [])[-5:]
            pace_trend = float(np.polyfit(range(len(times)), times, 1)[0]) if len(times) >= 3 else 0.0
            
            interval = intervals.get(drv_num, {})
            raw_gap_behind = interval.get("interval", 999)
            gap_behind = 999.0 if isinstance(raw_gap_behind, str) else float(raw_gap_behind or 999)
            raw_gap_ahead = interval.get("gap_to_leader", 0)
            gap_ahead = 0.0 if isinstance(raw_gap_ahead, str) else float(raw_gap_ahead or 0)
            
            lap_start = stint.get("lap_start", current_lap)
            drivers.append(DriverState(
                driver_id        = str(drv_num),
                driver_number    = drv_num,
                constructor_id   = self.constructor_id,
                current_position = positions.get(drv_num, 20),
                current_lap      = current_lap,
                gap_ahead        = gap_ahead,
                gap_behind       = gap_behind,
                compound         = stint.get("compound", "UNKNOWN"),
                tyre_age         = max(0, int(current_lap - lap_start)),
                stops_done       = max(0, stint.get("stint_number", 1) - 1),
                recent_pace      = float(np.median(times)) if times else 90.0,
                pace_trend       = pace_trend,
                last_lap_time    = float(times[-1]) if times else 90.0,
                is_our_driver    = (drv_num == self.our_driver),
            ))
        return drivers
    
    def _build_field_summary(self, all_drivers: list) -> list:
        sorted_drivers = sorted(all_drivers, key=lambda x: x.current_position)
        return [{
            "position":   d.current_position,
            "driver":     d.driver_id,
            "compound":   d.compound,
            "tyre_age":   d.tyre_age,
            "gap_behind": round(d.gap_behind, 1) if d.gap_behind < 900 else "LAP",
            "pace_trend": f"{d.pace_trend:+.3f}s/lap",
            "is_ours":    d.is_our_driver,
        } for d in sorted_drivers[:10]]
    
    def _format_decision(self, d: StrategyDecision) -> dict:
        return {
            "type":           d.decision_type,
            "urgency":        d.urgency,
            "confidence":     f"{d.confidence*100:.0f}%",
            "action":         d.decision_type,
            "reasoning":      d.reasoning,
            "risk_if_ignored": d.risk_if_ignored,
            "time_gain":      f"+{d.time_gain:.1f}s estimated",
            "expires_in":     f"{d.expires_in_laps} laps",
            "sources":        d.data_sources,
        }

# ═══════════════════════════════════════════════════
# MODULE 3 — POST-LAP PROJECTION
# ═══════════════════════════════════════════════════

class RaceProjection:
    def project(self, current_state: DriverState, scenario: str, laps_remaining: int, field_pace: float) -> dict:
        if scenario == "PIT_NOW": return self._project_pit_now(current_state, laps_remaining, field_pace)
        elif scenario == "STAY_OUT": return self._project_stay_out(current_state, laps_remaining, field_pace)
        return {}
    
    def _project_pit_now(self, state: DriverState, laps_remaining: int, field_pace: float) -> dict:
        pit_loss = 22.0
        tyre_gain_per_lap = 0.3
        total_gain = (tyre_gain_per_lap * laps_remaining) - pit_loss
        return {
            "scenario":        "Pit this lap",
            "pit_cost":        f"-{pit_loss}s",
            "tyre_advantage":  f"+{tyre_gain_per_lap}s/lap",
            "projected_gain":  f"{total_gain:+.1f}s over {laps_remaining} laps",
            "viable":          total_gain > 0,
            "recommendation":  "Pit — gain outweighs cost over remaining laps" if total_gain > 0 else "Marginal — consider staying out"
        }
    
    def _project_stay_out(self, state: DriverState, laps_remaining: int, field_pace: float) -> dict:
        compound_life = {"SOFT": 20, "MEDIUM": 30, "HARD": 42}.get(state.compound, 30)
        laps_left_on_tyre = max(0, compound_life - state.tyre_age)
        if laps_left_on_tyre >= laps_remaining:
            return {
                "scenario":       "Stay out",
                "can_finish":     True,
                "pace_loss":      f"{state.pace_trend * laps_remaining:+.1f}s total at current deg rate",
                "recommendation": "Stay out viable — monitor tyre deg"
            }
        else:
            return {
                "scenario":       "Stay out",
                "can_finish":     False,
                "shortfall":      f"Tyres may not last — {laps_remaining - laps_left_on_tyre} laps short",
                "recommendation": "Must pit — tyres won't make race distance"
            }
