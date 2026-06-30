"use client";
import { useState, useEffect, useRef } from "react";

export default function RaceEngineerPage() {
  const [briefing, setBriefing] = useState<any>(null);
  const wsRef = useRef<WebSocket>();

  useEffect(() => {
    // We mock the session key to 9158 for testing purposes, but this would typically come from router or context.
    const ws = new WebSocket(
      `ws://localhost:8000/api/engineer/live/9158`
    );
    ws.onmessage = (e) => setBriefing(JSON.parse(e.data));
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  if (!briefing) return (
    <div className="font-mono text-[#00C389] p-8 animate-pulse">
      Connecting to race engineer system...
    </div>
  );

  const topDecision = briefing.top_decision;

  return (
    <div className="bg-[#15171C] min-h-screen p-4 font-mono">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">
            RACE ENGINEER — LAP {briefing.lap}
          </h1>
          <p className="text-sm text-gray-400">
            {briefing.laps_remaining} laps remaining
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[#00C389]">
            P{briefing.our_driver?.position}
          </div>
          <div className="text-xs text-gray-400">Our position</div>
        </div>
      </div>

      {/* TOP DECISION — the most important thing right now */}
      {topDecision && (
        <div className={`rounded-lg p-4 mb-4 border-2 ${
          topDecision.urgency === "IMMEDIATE"    ? "border-red-500 bg-red-500/10" :
          topDecision.urgency === "THIS LAP"     ? "border-[#FF8A1E] bg-[#FF8A1E]/10" :
          topDecision.urgency === "NEXT 3 LAPS"  ? "border-yellow-400 bg-yellow-400/10" :
          "border-[#00C389] bg-[#00C389]/10"
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <div className={`text-lg font-bold ${
                topDecision.urgency === "IMMEDIATE" ? "text-red-400" :
                topDecision.urgency === "THIS LAP"  ? "text-[#FF8A1E]" :
                "text-yellow-400"
              }`}>
                {topDecision.urgency === "IMMEDIATE" && "🚨 "}
                {topDecision.urgency === "THIS LAP"  && "⚠️ "}
                {topDecision.type}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Confidence: {topDecision.confidence} · 
                Expires: {topDecision.expires_in}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-[#00C389]">
                {topDecision.time_gain}
              </div>
              <div className="text-xs text-gray-400">estimated gain</div>
            </div>
          </div>

          {/* Reasoning */}
          <div className="mt-3 space-y-1">
            {topDecision.reasoning.map((r: string, i: number) => (
              <div key={i} className="text-xs text-gray-300">
                • {r}
              </div>
            ))}
          </div>

          {/* Risk */}
          <div className="mt-2 text-xs text-red-400">
            If ignored: {topDecision.risk_if_ignored}
          </div>
        </div>
      )}

      {/* Driver status */}
      <div className="bg-[#1F2228] rounded-lg p-4 mb-4 
                      grid grid-cols-4 gap-4">
        {[
          ["Position", `P${briefing.our_driver?.position}`],
          ["Gap behind", `${briefing.our_driver?.gap_behind}s`],
          ["Tyre", `${briefing.our_driver?.compound} ${briefing.our_driver?.tyre_age}L`],
          ["Pace trend", briefing.our_driver?.pace_trend],
        ].map(([label, value]) => (
          <div key={label} className="text-center">
            <div className="text-xs text-gray-400">{label}</div>
            <div className="text-sm font-bold text-white mt-1">
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Field summary */}
      <div className="bg-[#1F2228] rounded-lg overflow-hidden">
        <div className="px-4 py-2 text-xs text-gray-400 uppercase tracking-wider 
                        border-b border-[#15171C]">
          Field — Top 10
        </div>
        {briefing.field_summary?.map((d: any) => (
          <div key={d.position}
               className={`flex items-center gap-3 px-4 py-2 text-sm
                          border-b border-[#15171C] ${
                            d.is_ours ? "bg-[#00C389]/10" : ""
                          }`}>
            <span className="text-gray-400 w-6">P{d.position}</span>
            <span className={`font-bold w-12 ${d.is_ours ? "text-[#00C389]" : "text-white"}`}>
              {d.driver} {d.is_ours && "◄"}
            </span>
            <span className={`w-16 text-xs ${
              d.compound === "SOFT"   ? "text-red-400"    :
              d.compound === "MEDIUM" ? "text-yellow-400" :
              "text-gray-300"
            }`}>
              {d.compound?.[0]} {d.tyre_age}L
            </span>
            <span className="text-xs text-gray-400 w-16">
              {d.gap_behind}s gap
            </span>
            <span className={`text-xs ml-auto ${
              d.pace_trend?.startsWith("+") ? "text-red-400" : "text-[#00C389]"
            }`}>
              {d.pace_trend}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
