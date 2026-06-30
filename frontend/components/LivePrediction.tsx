"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface DriverPrediction {
  driver_number?: number;
  driver_id: string;
  code: string;
  name: string;
  team: string;
  color: string;
  grid: number;
  live_probability: number;
  pre_race_probability: number;
  live_delta: number;
  current_position: number;
  gap_to_leader: number;
  tyre_compound: string;
  tyre_age: number;
  stops_done: number;
  laps_remaining: number;
  current_lap: number;
  is_retired: boolean;
  gap_closeable: boolean;
}

interface AccuracyEstimate {
  estimated_accuracy: number;
  confidence_label: string;
  confidence_color: string;
  notes: string[];
  race_phase: string;
}

interface RaceEvent {
  lap: number;
  message: string;
  flag: string;
  category: string;
}

interface LivePredictionData {
  lap: number;
  total_laps: number;
  laps_remaining: number;
  race_progress_pct: number;
  accuracy_estimate: AccuracyEstimate;
  predictions: DriverPrediction[];
  retired_drivers: string[];
  safety_car_active: boolean;
  vsc_active: boolean;
  race_events: RaceEvent[];
  weather?: {
    air_temp: number;
    track_temp: number;
    humidity: number;
    rainfall: boolean;
  };
  updated_at: string;
}

// ─── TYRE COLORS ──────────────────────────────────────────────────────────────

const TYRE_COLORS: Record<string, string> = {
  SOFT: "#FF3333",
  MEDIUM: "#FFD700",
  HARD: "#CCCCCC",
  INTERMEDIATE: "#33CC33",
  WET: "#3399FF",
  UNKNOWN: "#666666",
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function LivePrediction({
  sessionKey,
  totalLaps = 71,
  apiBase = "",
}: {
  sessionKey: number;
  totalLaps?: number;
  apiBase?: string;
}) {
  const [data, setData] = useState<LivePredictionData | null>(null);
  const [lastLap, setLastLap] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBase}/api/live-prediction/lap/${sessionKey}?total_laps=${totalLaps}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || `HTTP ${res.status}`);
        return;
      }

      const json: LivePredictionData = await res.json();
      setError(null);

      // Only update UI if a new lap completed
      if (json.lap > lastLap || lastLap === 0) {
        setData(json);
        setLastLap(json.lap);
      }
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
  }, [sessionKey, totalLaps, lastLap, apiBase]);

  useEffect(() => {
    if (!isPolling) return;

    fetchPredictions(); // immediate first call
    intervalRef.current = setInterval(fetchPredictions, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPolling, fetchPredictions]);

  // ─── LOADING STATE ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-[#1A1D23] rounded-xl p-6 border border-red-500/30">
        <div className="text-red-400 font-bold text-sm mb-2">⚠ Connection Error</div>
        <div className="text-gray-400 text-xs">{error}</div>
        <button
          onClick={fetchPredictions}
          className="mt-3 px-4 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-[#1A1D23] rounded-xl p-8 border border-[#2A2D35] animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#00C389] rounded-full animate-ping" />
          <span className="text-gray-400 font-medium">
            Waiting for race data...
          </span>
        </div>
      </div>
    );
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  const { accuracy_estimate: acc, predictions, race_events } = data;

  return (
    <div className="space-y-4">
      {/* ─── RACE PROGRESS HEADER ─────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#1A1D23] to-[#1F2228] rounded-xl p-5 border border-[#2A2D35]">
        <div className="flex justify-between items-start mb-3">
          {/* Lap counter */}
          <div>
            <div className="font-mono text-2xl font-black tracking-tight">
              <span className="text-[#00C389]">LAP {data.lap}</span>
              <span className="text-gray-600"> / {data.total_laps}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5 font-medium">
              {data.laps_remaining} laps remaining · {acc.race_phase}
            </div>
          </div>

          {/* Accuracy badge */}
          <div className="text-right">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                backgroundColor: `${acc.confidence_color}15`,
                color: acc.confidence_color,
                border: `1px solid ${acc.confidence_color}30`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: acc.confidence_color }}
              />
              {acc.confidence_label} ·{" "}
              {(acc.estimated_accuracy * 100).toFixed(0)}%
            </div>
            {acc.notes.length > 0 && (
              <div className="text-[10px] text-gray-500 mt-1 max-w-[200px]">
                {acc.notes[0]}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-2 bg-[#15171C] rounded-full overflow-hidden">
          <div
            className="absolute h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${data.race_progress_pct}%`,
              background: `linear-gradient(90deg, #00C389, ${acc.confidence_color})`,
            }}
          />
          {/* Pit window marker */}
          <div
            className="absolute top-0 h-full w-px bg-[#FF8A1E]/40"
            style={{ left: "25%" }}
            title="Pit window"
          />
          <div
            className="absolute top-0 h-full w-px bg-[#FF8A1E]/40"
            style={{ left: "50%" }}
            title="Mid-race"
          />
        </div>

        {/* Alert banners */}
        {data.safety_car_active && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#FF8A1E]/10 border border-[#FF8A1E]/30 rounded-lg">
            <span className="text-[#FF8A1E] text-lg animate-pulse">⚠️</span>
            <span className="text-[#FF8A1E] text-xs font-bold tracking-wide">
              SAFETY CAR DEPLOYED — predictions less certain
            </span>
          </div>
        )}
        {data.vsc_active && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <span className="text-yellow-400 text-lg">🟡</span>
            <span className="text-yellow-400 text-xs font-bold tracking-wide">
              VIRTUAL SAFETY CAR — reduced speed
            </span>
          </div>
        )}
        {data.weather?.rainfall && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <span className="text-blue-400 text-lg">🌧️</span>
            <span className="text-blue-400 text-xs font-bold tracking-wide">
              RAIN DETECTED — Track: {data.weather.track_temp}°C
            </span>
          </div>
        )}
      </div>

      {/* ─── PREDICTIONS TABLE ────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {predictions.slice(0, 10).map((p, i) => {
          const isRetired = p.is_retired;
          const isSelected = selectedDriver === p.code;
          const teamColor = p.color
            ? p.color.startsWith("#")
              ? p.color
              : `#${p.color}`
            : "#6B7280";

          return (
            <div
              key={p.driver_id || p.code}
              onClick={() =>
                setSelectedDriver(isSelected ? null : p.code)
              }
              className={`
                relative rounded-xl p-3.5 cursor-pointer
                transition-all duration-300 ease-out
                ${
                  isRetired
                    ? "bg-[#1A1D23]/50 opacity-50"
                    : "bg-gradient-to-r from-[#1A1D23] to-[#1F2228] hover:from-[#1F2228] hover:to-[#252830]"
                }
                border ${
                  isSelected
                    ? "border-[#00C389]/50"
                    : "border-[#2A2D35]/50 hover:border-[#3A3D45]"
                }
              `}
            >
              {/* Team color accent */}
              <div
                className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
                style={{ backgroundColor: teamColor }}
              />

              <div className="flex items-center gap-3 pl-3">
                {/* Position */}
                <div className="font-mono font-black text-gray-500 w-8 text-center text-sm">
                  P{p.current_position}
                </div>

                {/* Driver info */}
                <div className="w-32">
                  <div
                    className="font-bold text-xs uppercase tracking-widest"
                    style={{ color: teamColor }}
                  >
                    {p.code}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {p.gap_to_leader > 0
                      ? p.gap_to_leader >= 90
                        ? "LAPPED"
                        : `+${p.gap_to_leader.toFixed(1)}s`
                      : "LEADER"}
                  </div>
                </div>

                {/* Probability bar */}
                <div className="flex-1 mx-2">
                  <div className="h-2.5 bg-[#15171C] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${Math.min(p.live_probability * 100, 100)}%`,
                        background: isRetired
                          ? "#4A4A4A"
                          : `linear-gradient(90deg, ${teamColor}CC, ${teamColor})`,
                      }}
                    />
                  </div>
                </div>

                {/* Probability + delta */}
                <div className="text-right w-20">
                  <div className="font-mono font-black text-sm" style={{ color: teamColor }}>
                    {isRetired
                      ? "DNF"
                      : `${(p.live_probability * 100).toFixed(0)}%`}
                  </div>
                  {!isRetired && Math.abs(p.live_delta) > 0.02 && (
                    <div
                      className={`text-[10px] font-mono font-bold ${
                        p.live_delta > 0
                          ? "text-[#00C389]"
                          : "text-red-400"
                      }`}
                    >
                      {p.live_delta > 0 ? "▲" : "▼"}
                      {Math.abs(p.live_delta * 100).toFixed(0)}%
                    </div>
                  )}
                </div>

                {/* Tyre */}
                <div className="text-center w-14">
                  <div
                    className="font-bold text-xs"
                    style={{
                      color:
                        TYRE_COLORS[p.tyre_compound] || TYRE_COLORS.UNKNOWN,
                    }}
                  >
                    {p.tyre_compound?.[0] || "?"}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    {p.tyre_age}L · {p.stops_done}S
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isSelected && !isRetired && (
                <div className="mt-3 pl-3 pt-3 border-t border-[#2A2D35]/50 grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-gray-600 mb-0.5">Grid</div>
                    <div className="font-mono font-bold text-gray-300">
                      P{p.grid}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-0.5">Pre-race</div>
                    <div className="font-mono font-bold text-gray-300">
                      {(p.pre_race_probability * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-0.5">Gap closeable</div>
                    <div
                      className={`font-bold ${
                        p.gap_closeable
                          ? "text-[#00C389]"
                          : "text-red-400"
                      }`}
                    >
                      {p.gap_closeable ? "Yes" : "No"}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-0.5">Laps left</div>
                    <div className="font-mono font-bold text-gray-300">
                      {p.laps_remaining}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Retired drivers */}
        {data.retired_drivers.length > 0 && (
          <div className="text-xs text-gray-600 px-4 pt-2">
            <span className="text-red-400/60 font-bold">RETIRED: </span>
            {data.retired_drivers.join(", ")}
          </div>
        )}
      </div>

      {/* ─── RACE EVENTS FEED ─────────────────────────────────────────── */}
      {race_events.length > 0 && (
        <div className="bg-[#1A1D23] rounded-xl p-4 border border-[#2A2D35]">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            Race Control
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {race_events
              .slice(-5)
              .reverse()
              .map((evt, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-[11px]"
                >
                  <span className="text-gray-600 font-mono shrink-0">
                    L{evt.lap || "?"}
                  </span>
                  <span
                    className={`${
                      evt.flag === "RED"
                        ? "text-red-400"
                        : evt.flag === "YELLOW"
                        ? "text-yellow-400"
                        : "text-gray-400"
                    }`}
                  >
                    {evt.message}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ─── FOOTER ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 px-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isPolling ? "bg-[#00C389] animate-pulse" : "bg-gray-600"
            }`}
          />
          <span>
            {isPolling ? "Live · updates every 15s" : "Paused"}
          </span>
          <button
            onClick={() => setIsPolling(!isPolling)}
            className="text-gray-500 hover:text-gray-300 transition-colors underline"
          >
            {isPolling ? "Pause" : "Resume"}
          </button>
        </div>
        <div>
          {data.weather && (
            <span>
              🌡 {data.weather.track_temp}°C ·{" "}
              {data.weather.rainfall ? "🌧 Rain" : "☀️ Dry"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
