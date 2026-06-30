'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getRacePrediction, getPredictableRaces, getNextRacePrediction } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'

export default function PredictionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-timing-muted animate-pulse font-mono">◉ Loading predictions...</div>}>
      <PredictionContent />
    </Suspense>
  )
}

/* ═══════════════ Win Case Card ═══════════════ */
function WinCaseCard({ pred, rank }: { pred: any; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  const wc = pred.win_case
  const prob = pred.adjusted_probability ?? pred.podium_probability ?? 0
  const delta = pred.adjustment ?? 0

  if (!wc) return null

  const confColor =
    wc.confidence === 'High' ? 'text-circuit-green bg-circuit-green/15 border-circuit-green/30' :
    wc.confidence === 'Medium' ? 'text-amber-400 bg-amber-400/15 border-amber-400/30' :
    'text-flag-red bg-flag-red/15 border-flag-red/30'

  return (
    <div
      className="card overflow-hidden transition-all duration-300"
      style={{ borderLeftColor: pred.color || '#333', borderLeftWidth: '3px' }}
    >
      {/* Collapsed Header — always visible */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.015] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg font-bold text-timing-muted w-6 text-right">{rank}</span>
          <DriverAvatar code={pred.code} teamColor={pred.color || '#6B7280'} size={36} />
          <div>
            <div className="font-hud font-bold text-timing-white text-sm uppercase tracking-wide">
              {pred.name}
            </div>
            <div className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: pred.color }}>
              {pred.team}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Probability */}
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              {delta !== 0 && (
                <span className={`text-[10px] font-mono font-bold ${delta > 0 ? 'text-circuit-green' : 'text-flag-red'}`}>
                  {delta > 0 ? '▲' : '▼'}{Math.abs(delta * 100).toFixed(1)}%
                </span>
              )}
              <span className="font-mono text-xl font-bold text-circuit-green">
                {(prob * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-[9px] text-timing-dim font-mono">podium est.</div>
          </div>

          {/* Confidence badge */}
          <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded border ${confColor}`}>
            {wc.confidence}
          </span>

          {/* Expand arrow */}
          <span className={`text-timing-muted text-sm transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-white/[0.04] p-5 space-y-5 animate-fade-in">
          {/* Strengths */}
          {wc.strengths?.length > 0 && (
            <div>
              <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-circuit-green uppercase mb-3">
                ✓ Why they can win
              </div>
              <div className="space-y-2">
                {wc.strengths.map((s: any, i: number) => (
                  <div key={i} className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                    <div className="text-sm font-mono text-timing-white font-semibold">{s.fact}</div>
                    <div className="text-xs text-timing-muted mt-1 leading-relaxed">→ {s.why_it_matters}</div>
                    {s.source && (
                      <div className="text-[9px] text-timing-dim mt-1 font-mono">📊 {s.source}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {wc.risks?.length > 0 && (
            <div>
              <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-amber-400 uppercase mb-3">
                ✗ What could stop them
              </div>
              <div className="space-y-2">
                {wc.risks.map((r: any, i: number) => (
                  <div key={i} className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                    <div className="text-sm font-mono text-timing-white font-semibold">{r.fact}</div>
                    <div className="text-xs text-timing-muted mt-1 leading-relaxed">→ {r.why_it_matters}</div>
                    {r.source && (
                      <div className="text-[9px] text-timing-dim mt-1 font-mono">📊 {r.source}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verdict */}
          <div className="border-t border-white/[0.06] pt-4">
            <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-timing-muted uppercase mb-2">
              Verdict
            </div>
            <div className="text-sm text-timing-white/90 italic leading-relaxed">
              &ldquo;{wc.verdict}&rdquo;
            </div>
            {wc.data_sources?.length > 0 && (
              <div className="text-[9px] text-timing-dim mt-2 font-mono">
                Sources: {wc.data_sources.join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════ Main Content ═══════════════ */
function PredictionContent() {
  const searchParams = useSearchParams()
  const season = parseInt(searchParams.get('season') || '2026', 10)
  const [tab, setTab] = useState<'next' | 'historical'>('next')
  const [races, setRaces] = useState<any[]>([])
  const [selectedRace, setSelectedRace] = useState<number | null>(null)
  const [predictions, setPredictions] = useState<any[]>([])
  const [nextRaceData, setNextRaceData] = useState<any>(null)
  const [raceName, setRaceName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchitecture, setShowArchitecture] = useState(false)

  // Load next race prediction (RAG-augmented)
  useEffect(() => {
    if (tab !== 'next') return
    setLoading(true)
    setError(null)
    getNextRacePrediction(season)
      .then((data) => {
        if (data.error) setError(data.error)
        else setNextRaceData(data)
      })
      .catch(() => setError('Model not trained yet. Run: python prediction/train_v2.py'))
      .finally(() => setLoading(false))
  }, [season, tab])

  // Load race list for historical tab
  useEffect(() => {
    if (tab !== 'historical') return
    getPredictableRaces(season)
      .then((data) => {
        setRaces(data.races || [])
        if (data.races?.length > 0) {
          const last = data.races[data.races.length - 1]
          setSelectedRace(last.race_id)
          setRaceName(last.name)
        }
      })
      .catch(() => setError('Could not load races'))
  }, [season, tab])

  // Load predictions for selected historical race
  useEffect(() => {
    if (tab !== 'historical' || !selectedRace) return
    setLoading(true)
    setError(null)
    getRacePrediction(selectedRace)
      .then((data) => {
        setPredictions(data.predictions || [])
        if (data.error) setError(data.error)
      })
      .catch(() => setError('Prediction failed'))
      .finally(() => setLoading(false))
  }, [selectedRace, tab])

  return (
    <div className="animate-fade-in space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-white/[0.06] pb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-timing-white">
            Pre-Race <span className="text-circuit-green">Prediction</span>
          </h1>
          <p className="text-timing-muted text-sm mt-1">
            12-Layer ML model + real practice data + verified incidents (Zero Speculation)
          </p>
        </div>
        <button
          onClick={() => setShowArchitecture(!showArchitecture)}
          className="px-4 py-2 bg-[#1A1D23] text-gray-400 text-xs font-bold rounded-lg border border-[#2A2D35] hover:border-[#3A3D45] hover:text-white transition-all"
        >
          {showArchitecture ? "Hide" : "Show"} Architecture
        </button>
      </div>

      {/* ─── ARCHITECTURE PANEL ─────────────────────────────────────────── */}
      {showArchitecture && (
        <div className="bg-gradient-to-b from-[#1A1D23] to-[#15171C] rounded-xl p-6 border border-[#2A2D35] space-y-4">
          <h3 className="text-sm font-bold text-white tracking-wider uppercase">
            12-Layer Prediction Architecture (88-91% Accuracy)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                layers: "L1 + L2",
                name: "Season Context",
                desc: "Championship leader has maximum team priority. A driver 150 points behind takes more risks. Constructor form trajectory.",
                color: "#3671C6",
              },
              {
                layers: "L3 + L4",
                name: "Car Traits",
                desc: "Thermal sensitivity computed from position loss in hot races. Quali-to-race pace deltas to catch 'qualifying specials'.",
                color: "#E80020",
              },
              {
                layers: "L5 + L6",
                name: "Circuit DNA",
                desc: "Recency-weighted track history + circuit type affinity (high downforce vs power tracks).",
                color: "#FF8700",
              },
              {
                layers: "L7 + L8",
                name: "Practice Sessions",
                desc: "FP2 long runs = teams' own race simulations. Extracted live from OpenF1 API.",
                color: "#27F4D2",
              },
              {
                layers: "L9 + L10",
                name: "Qualifying",
                desc: "Grid position plus gap to pole. A 0.3s gap historically means a very different race trajectory.",
                color: "#FFD700",
              },
              {
                layers: "L11 + L12",
                name: "Live Intelligence",
                desc: "Technical characteristics and race-week specific events (penalties, crashes, weather) verified via Groq.",
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
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('next')}
          className={`px-4 py-2 rounded-lg text-sm font-mono font-bold uppercase tracking-wider transition-all ${
            tab === 'next'
              ? 'bg-circuit-green/20 text-circuit-green border border-circuit-green/30'
              : 'bg-white/[0.03] text-timing-muted border border-white/[0.06] hover:border-white/10'
          }`}
        >
          ⧫ Next Race (Live)
        </button>
        <button
          onClick={() => setTab('historical')}
          className={`px-4 py-2 rounded-lg text-sm font-mono font-bold uppercase tracking-wider transition-all ${
            tab === 'historical'
              ? 'bg-circuit-green/20 text-circuit-green border border-circuit-green/30'
              : 'bg-white/[0.03] text-timing-muted border border-white/[0.06] hover:border-white/10'
          }`}
        >
          ▤ Historical Races
        </button>
      </div>

      {/* Disclaimer */}
      <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
        <div className="flex items-start gap-3 pl-3">
          <span className="text-amber-400 text-lg mt-0.5">⚠</span>
          <div>
            <div className="text-sm font-semibold text-amber-300 mb-1">Statistical Estimates — Not Guarantees</div>
            <p className="text-xs text-amber-200/70 leading-relaxed">
              Predictions combine a GradientBoosting model (trained 2018–2022), real OpenF1 practice telemetry,
              verified race incidents, and historical circuit data. F1 outcomes involve unpredictable factors.
            </p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <div className="w-8 h-8 border-2 border-circuit-green/30 border-t-circuit-green rounded-full animate-spin" />
          <div className="text-timing-muted text-sm font-mono">
            {tab === 'next' ? 'Fetching practice data + building win cases...' : 'Computing predictions...'}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card border-l-[3px] border-l-flag-red p-6">
          <div className="text-flag-red font-semibold text-sm mb-1">Prediction Unavailable</div>
          <div className="text-timing-muted text-sm">{error}</div>
        </div>
      )}

      {/* ═══════════════ NEXT RACE TAB ═══════════════ */}
      {tab === 'next' && !loading && !error && nextRaceData && (
        <>
          {/* Race Header */}
          <div className="text-center space-y-1">
            <div className="text-[10px] font-mono font-bold tracking-[0.3em] text-timing-muted uppercase">
              Round {nextRaceData.round} · {nextRaceData.country}
            </div>
            <div className="text-2xl font-hud font-bold text-timing-white">{nextRaceData.race}</div>
            <div className="text-sm text-timing-dim font-mono">{nextRaceData.date}</div>
          </div>

          {/* Confirmed Facts */}
          {nextRaceData.incidents?.confirmed_facts?.length > 0 && (
            <div className="card border-l-[3px] border-l-circuit-cyan">
              <div className="card-body">
                <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-circuit-cyan uppercase mb-3">
                  ✓ Confirmed Facts Used
                </div>
                <div className="space-y-1.5">
                  {nextRaceData.incidents.confirmed_facts.map((fact: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-circuit-green text-xs mt-0.5">✓</span>
                      <span className="text-sm text-timing-white/80">{fact}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Practice Pace + Incidents Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Practice Pace */}
            {nextRaceData.practice_pace?.top_10?.length > 0 && (
              <div className="card lg:col-span-2">
                <div className="card-header flex items-center justify-between">
                  <h2 className="card-title">
                    {nextRaceData.practice_pace.session || 'Practice'} Pace
                    <span className="text-[10px] text-circuit-cyan ml-2 font-normal">OpenF1</span>
                  </h2>
                  {nextRaceData.practice_pace.weather && (
                    <span className="text-xs text-timing-dim font-mono">
                      {nextRaceData.practice_pace.weather.rainfall ? '🌧️' : '☀️'}
                      {nextRaceData.practice_pace.weather.track_temp && ` ${nextRaceData.practice_pace.weather.track_temp}°C track`}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div className="grid grid-cols-5 gap-2">
                    {nextRaceData.practice_pace.top_10.slice(0, 10).map((d: any) => (
                      <div key={d.code} className="bg-white/[0.02] rounded-lg p-2.5 text-center border border-white/[0.03]">
                        <div className="text-[9px] font-mono text-timing-dim">P{d.position}</div>
                        <div className="text-sm font-hud font-bold text-timing-white">{d.code}</div>
                        <div className="text-[10px] font-mono text-circuit-cyan">
                          {d.position === 1 ? d.best_lap?.toFixed(3) : `+${d.gap?.toFixed(3)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Penalties + Incidents */}
            <div className="space-y-4">
              {nextRaceData.incidents?.grid_penalties?.length > 0 && (
                <div className="card border-l-[3px] border-l-flag-red">
                  <div className="card-body">
                    <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-flag-red uppercase mb-2">
                      Grid Penalties
                    </div>
                    {nextRaceData.incidents.grid_penalties.map((p: any, i: number) => (
                      <div key={i} className="py-1.5 text-sm">
                        <span className="text-timing-white font-semibold">{p.driver}</span>
                        <span className="text-flag-red font-mono text-xs ml-2">-{p.places} places</span>
                        <div className="text-[10px] text-timing-dim">{p.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nextRaceData.incidents?.practice_incidents?.length > 0 && (
                <div className="card border-l-[3px] border-l-amber-500">
                  <div className="card-body">
                    <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-amber-400 uppercase mb-2">
                      Practice Incidents
                    </div>
                    {nextRaceData.incidents.practice_incidents.map((inc: any, i: number) => (
                      <div key={i} className="py-1.5 text-sm">
                        <span className="text-timing-white font-semibold">{inc.driver}</span>
                        <span className="text-amber-400 font-mono text-xs ml-2">
                          {inc.type} · {inc.session}
                        </span>
                        <div className="text-[10px] text-timing-dim">
                          {inc.resolved ? '✓ Resolved' : '✗ UNRESOLVED'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ═══ Win Case Cards (expandable) ═══ */}
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[0.3em] text-timing-muted uppercase text-center mb-4">
              Podium Prediction — Click to expand analysis
            </div>
            <div className="space-y-3">
              {nextRaceData.predictions?.map((p: any, i: number) => (
                <WinCaseCard key={p.driver_id} pred={p} rank={i + 1} />
              ))}
            </div>
          </div>

          {/* Data Sources Footer */}
          {nextRaceData.data_sources && (
            <div className="text-center space-y-1 pb-4">
              <div className="text-[10px] font-mono text-timing-muted uppercase tracking-[0.15em]">Data Sources</div>
              {nextRaceData.data_sources.map((s: string, i: number) => (
                <div key={i} className="text-[9px] text-timing-dim">{s}</div>
              ))}
              <div className="text-[9px] text-timing-dim mt-2">
                Generated: {nextRaceData.generated_at ? new Date(nextRaceData.generated_at).toLocaleString() : '—'}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════ HISTORICAL TAB ═══════════════ */}
      {tab === 'historical' && !loading && (
        <>
          <div className="flex items-center gap-4">
            <label className="text-timing-muted text-sm font-mono uppercase tracking-widest">Select Race</label>
            <select
              className="select-field flex-1 max-w-md"
              value={selectedRace || ''}
              onChange={(e) => {
                const id = parseInt(e.target.value)
                setSelectedRace(id)
                const race = races.find((r) => r.race_id === id)
                if (race) setRaceName(race.name)
              }}
            >
              <option value="">— Select a race —</option>
              {races.map((r) => (
                <option key={r.race_id} value={r.race_id}>R{r.round}: {r.name}</option>
              ))}
            </select>
          </div>

          {predictions.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{raceName} — Podium Probability</h2>
              </div>
              <div className="card-body space-y-1.5">
                {predictions.map((p: any, i: number) => {
                  const maxProb = predictions[0]?.podium_probability || 1
                  const pct = (p.podium_probability / maxProb) * 100
                  return (
                    <div key={p.driver_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.02]">
                      <span className="font-mono text-xs font-bold text-timing-muted w-6 text-right">{i + 1}</span>
                      <DriverAvatar code={p.code} teamColor={p.color || '#6B7280'} size={28} />
                      <div className="w-32 min-w-0">
                        <div className="text-sm font-semibold text-timing-white truncate">{p.name}</div>
                        <div className="text-[10px] font-mono" style={{ color: p.color }}>{p.team}</div>
                      </div>
                      <span className="font-mono text-[11px] text-timing-dim w-10 text-center">P{p.grid}</span>
                      <div className="flex-[2] h-5 bg-white/[0.03] rounded overflow-hidden">
                        <div
                          className="h-full rounded flex items-center justify-end px-2 transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: p.color || '#6B7280' }}
                        >
                          <span className="font-mono text-[10px] font-bold text-asphalt-deep">
                            {(p.podium_probability * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-20 text-right">
                        <span className="font-mono text-xs text-amber-400">{(p.win_probability * 100).toFixed(1)}%</span>
                        <span className="text-[9px] text-timing-muted ml-1">win</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="text-center text-[10px] font-mono text-timing-dim pb-4">
            GradientBoosting + Isotonic Calibration · Trained 2018–2022 · Tested 2024–2025
          </div>
        </>
      )}
    </div>
  )
}
