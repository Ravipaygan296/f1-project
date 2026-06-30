"use client";

import { useState, useEffect } from "react";
import LivePrediction from "@/components/LivePrediction";
import { getLiveStatus, getAccuracyChart } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Accuracy progression data (static reference)
const ACCURACY_PHASES = [
  { phase: "Pre-race", lap: 0, accuracy: 88, color: "#FF8A1E" },
  { phase: "Lap 1", lap: 1, accuracy: 89, color: "#FF8A1E" },
  { phase: "Pit window", lap: 18, accuracy: 91, color: "#FFD700" },
  { phase: "Most pitted", lap: 30, accuracy: 94, color: "#00C389" },
  { phase: "Strategies done", lap: 45, accuracy: 96, color: "#00C389" },
  { phase: "Final stint", lap: 60, accuracy: 99, color: "#00C389" },
];

export default function LivePredictionPage() {
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualKey, setManualKey] = useState("");
  const [showArchitecture, setShowArchitecture] = useState(false);

  useEffect(() => {
    async function detectSession() {
      try {
        const status = await getLiveStatus();
        if (status?.is_live && status?.session?.session_key) {
          setSessionKey(status.session.session_key);
          setSessionInfo(status.session);
        }
      } catch (e) {
        console.error("Failed to detect live session:", e);
      }
      setLoading(false);
    }
    detectSession();
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-3 h-3 bg-[#00C389] rounded-full animate-ping" />
          Detecting live session...
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div className="border-b border-white/[0.06] pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              <span className="text-[#00C389]">Live</span>{" "}
              <span className="text-white">Prediction</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              12-layer prediction engine · updates every lap
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowArchitecture(!showArchitecture)}
              className="px-4 py-2 bg-[#1A1D23] text-gray-400 text-xs font-bold rounded-lg border border-[#2A2D35] hover:border-[#3A3D45] hover:text-white transition-all"
            >
              {showArchitecture ? "Hide" : "Show"} Architecture
            </button>
            {sessionKey && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00C389] animate-pulse" />
                <span className="text-[#00C389] text-xs font-bold">LIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Session info */}
        {sessionInfo && (
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span className="px-2 py-1 bg-[#00C389]/10 text-[#00C389] rounded font-bold">
              {sessionInfo.session_name}
            </span>
            <span>{sessionInfo.meeting_name}</span>
            <span>·</span>
            <span>{sessionInfo.circuit_short_name}</span>
          </div>
        )}
      </div>

      {/* ─── ARCHITECTURE PANEL ─────────────────────────────────────────── */}
      {showArchitecture && (
        <div className="bg-gradient-to-b from-[#1A1D23] to-[#15171C] rounded-xl p-6 border border-[#2A2D35] space-y-4">
          <h3 className="text-sm font-bold text-white tracking-wider uppercase">
            12-Layer Prediction Architecture
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                layers: "L1 + L2",
                name: "Season Context",
                desc: "Championship leader has maximum team priority. Points gap drives risk-taking.",
                color: "#3671C6",
              },
              {
                layers: "L3 + L4",
                name: "Car Traits",
                desc: "Thermal sensitivity & qualifying-to-race delta. Catches 'qualifying specials'.",
                color: "#E80020",
              },
              {
                layers: "L5 + L6",
                name: "Circuit DNA",
                desc: "Recency-weighted track history + circuit type matching (downforce vs power).",
                color: "#FF8700",
              },
              {
                layers: "L7 + L8",
                name: "Practice Sessions",
                desc: "FP2 long-run pace = teams' own race sims. Sector strengths reveal true speed.",
                color: "#27F4D2",
              },
              {
                layers: "L9 + L10",
                name: "Qualifying",
                desc: "Single biggest accuracy jump. Grid position + gap to pole. 0.3s gap changes everything.",
                color: "#FFD700",
              },
              {
                layers: "L11 + L12",
                name: "Live Intelligence",
                desc: "Technical issues from news + race-week events (penalties, crashes, weather).",
                color: "#FF87BC",
              },
            ].map((layer) => (
              <div
                key={layer.layers}
                className="flex items-start gap-3 p-3 rounded-lg bg-[#15171C]/80 border border-[#2A2D35]/50"
              >
                <div
                  className="shrink-0 w-1 self-stretch rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${layer.color}20`,
                        color: layer.color,
                      }}
                    >
                      {layer.layers}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {layer.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {layer.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Accuracy progression chart */}
          <div className="mt-4 pt-4 border-t border-[#2A2D35]/50">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Accuracy Progression During Race
            </h4>
            <div className="flex items-end gap-1.5 h-32">
              {ACCURACY_PHASES.map((phase, i) => (
                <div
                  key={phase.phase}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-mono font-bold" style={{ color: phase.color }}>
                    {phase.accuracy}%
                  </span>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{
                      height: `${(phase.accuracy - 85) * 6}px`,
                      background: `linear-gradient(to top, ${phase.color}40, ${phase.color})`,
                    }}
                  />
                  <span className="text-[9px] text-gray-600 text-center leading-tight">
                    {phase.phase}
                  </span>
                </div>
              ))}

              {/* Safety car spike */}
              <div className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono font-bold text-red-400">
                  −8%
                </span>
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: "18px",
                    background: "linear-gradient(to top, #FF555540, #FF5555)",
                  }}
                />
                <span className="text-[9px] text-red-400/60 text-center leading-tight">
                  SC
                </span>
              </div>
            </div>

            <p className="text-[10px] text-gray-600 mt-2 text-center italic">
              The remaining 9% is genuinely random — safety cars, lap 1
              incidents, mechanical DNFs
            </p>
          </div>
        </div>
      )}

      {/* ─── LIVE PREDICTION PANEL ────────────────────────────────────── */}
      {sessionKey ? (
        <LivePrediction
          sessionKey={sessionKey}
          totalLaps={71}
          apiBase={API_BASE}
        />
      ) : (
        <div className="space-y-4">
          {/* No live session — manual entry */}
          <div className="bg-[#1A1D23] rounded-xl p-6 border border-[#2A2D35] text-center">
            <div className="text-4xl mb-4">🏁</div>
            <h3 className="text-lg font-bold text-white mb-2">
              No Live Session Detected
            </h3>
            <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
              Live predictions activate automatically when a race session
              is running. You can also enter a session key manually to
              review past sessions.
            </p>

            <div className="flex items-center justify-center gap-3 max-w-xs mx-auto">
              <input
                type="number"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                placeholder="Session key (e.g. 9635)"
                className="flex-1 px-4 py-2.5 bg-[#15171C] border border-[#2A2D35] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00C389]/50"
              />
              <button
                onClick={() => {
                  if (manualKey) {
                    setSessionKey(parseInt(manualKey));
                  }
                }}
                disabled={!manualKey}
                className="px-5 py-2.5 bg-[#00C389] text-black font-bold text-sm rounded-lg disabled:opacity-30 hover:bg-[#00D99A] transition-colors"
              >
                Connect
              </button>
            </div>
          </div>

          {/* How it works (shown when no session) */}
          <div className="bg-[#1A1D23] rounded-xl p-6 border border-[#2A2D35]">
            <h3 className="text-sm font-bold text-white mb-4">
              How Live Prediction Works
            </h3>
            <div className="space-y-3">
              {[
                {
                  icon: "🏎️",
                  title: "Lap 1 done",
                  desc: "Lap 1 chaos resolved — who crashed, gained, lost",
                  acc: "88% → 89%",
                },
                {
                  icon: "🔧",
                  title: "Laps 15-20",
                  desc: "Undercut window opens — pit stop predictions start",
                  acc: "89% → 91%",
                },
                {
                  icon: "📊",
                  title: "Laps 25-35",
                  desc: "Most drivers pitted — real race order emerging",
                  acc: "91% → 94%",
                },
                {
                  icon: "🎯",
                  title: "Laps 40+",
                  desc: "All strategies played — gaps are real, not pit artifacts",
                  acc: "94% → 96%",
                },
                {
                  icon: "🏁",
                  title: "Laps 55+",
                  desc: "Only mechanical failure or safety car changes result",
                  acc: "96% → 99%",
                },
                {
                  icon: "⚠️",
                  title: "Safety Car",
                  desc: "Uncertainty jumps back — everyone close again",
                  acc: "−5% to −8%",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[#15171C]/60"
                >
                  <span className="text-lg shrink-0">{item.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono text-[#00C389] font-bold">
                        {item.acc}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
