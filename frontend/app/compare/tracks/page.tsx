'use client'

import { useState, useEffect } from 'react'
import { getCircuits, getTrackAnalysis } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'
import TrackOutline from '@/components/TrackOutline'

export default function TrackAnalysisPage() {
  const [circuits, setCircuits] = useState<any[]>([])
  const [selectedCircuit, setSelectedCircuit] = useState('')
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getCircuits().then(d => setCircuits(d.circuits || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedCircuit) { setAnalysis(null); return }
    setLoading(true)
    getTrackAnalysis(selectedCircuit)
      .then(d => setAnalysis(d))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [selectedCircuit])

  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">Track <span className="text-circuit-green">Analysis</span></h1>
        <p className="text-timing-muted text-sm mt-1">Circuit history, strategy patterns, and team dominance</p>
      </div>

      <div>
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-timing-muted mb-2">Select Circuit</label>
        <select className="select-field max-w-md" value={selectedCircuit} onChange={e => setSelectedCircuit(e.target.value)}>
          <option value="">Select a circuit...</option>
          {circuits.map(c => <option key={c.circuit_id} value={c.circuit_id}>{c.name} — {c.country}</option>)}
        </select>
      </div>

      {loading && <div className="text-center text-timing-muted animate-pulse py-8">Loading track data...</div>}

      {analysis && (
        <div className="space-y-6 animate-fade-in">
          {/* Premium Track HUD Card */}
          <div className="card relative overflow-hidden min-h-[400px] flex items-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-asphalt/50 via-[#0A0C10] to-[#0A0C10]">
            
            {/* Massive Glowing Track Map Background */}
            <div className="absolute inset-0 flex items-center justify-center opacity-20 blur-xl pointer-events-none">
               <TrackOutline circuitId={selectedCircuit} width={600} height={600} />
            </div>

            {/* Sharp Track Map Foreground */}
            <div className="absolute right-10 top-1/2 -translate-y-1/2 drop-shadow-glow-cyan pointer-events-none opacity-80">
               <TrackOutline circuitId={selectedCircuit} width={350} height={350} />
            </div>

            <div className="relative z-10 p-12 max-w-xl">
              <div className="badge badge-cyan mb-4">CIRCUIT TELEMETRY</div>
              <h2 className="text-5xl font-hud font-black text-timing-white uppercase tracking-wider mb-2 drop-shadow-lg">
                {analysis.circuit?.name}
              </h2>
              <p className="text-circuit-cyan font-mono tracking-[0.2em] uppercase text-sm font-bold mb-8">
                {analysis.circuit?.locality} · {analysis.circuit?.country}
              </p>
              
              <div className="grid grid-cols-2 gap-8">
                {analysis.circuit?.lat && (
                  <div>
                    <div className="text-[10px] font-mono text-timing-muted tracking-widest uppercase mb-1">GPS LATITUDE</div>
                    <div className="font-mono text-xl text-timing-white font-bold">{analysis.circuit?.lat}°</div>
                  </div>
                )}
                {analysis.circuit?.lng && (
                  <div>
                    <div className="text-[10px] font-mono text-timing-muted tracking-widest uppercase mb-1">GPS LONGITUDE</div>
                    <div className="font-mono text-xl text-timing-white font-bold">{analysis.circuit?.lng}°</div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-mono text-timing-muted tracking-widest uppercase mb-1">TRACK DIRECTION</div>
                  <div className="font-mono text-xl text-timing-white font-bold">CLOCKWISE</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-timing-muted tracking-widest uppercase mb-1">DRS ZONES</div>
                  <div className="font-mono text-xl text-timing-white font-bold">2</div>
                </div>
              </div>
            </div>
          </div>

          {/* Team Dominance */}
          {analysis.team_dominance?.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Team Dominance (Win Count)</h2></div>
              <div className="card-body space-y-2">
                {analysis.team_dominance.map((t: any) => {
                  const maxWins = analysis.team_dominance[0]?.wins || 1
                  const pct = (t.wins / maxWins) * 100
                  return (
                    <div key={t.constructor_id} className="flex items-center gap-3">
                      <div className="w-24 text-sm font-semibold truncate" style={{ color: t.color_hex || '#9BA1B0' }}>
                        {t.name}
                      </div>
                      <div className="flex-1 h-7 bg-white/[0.03] rounded overflow-hidden">
                        <div
                          className="h-full rounded flex items-center justify-end px-2 transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: t.color_hex || '#6B7280' }}
                        >
                          <span className="font-mono text-[11px] font-bold text-asphalt-deep">{t.wins}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Historical Winners */}
          {analysis.winners?.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Historical Race Winners</h2></div>
              <div className="card-body overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Winner</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.winners.map((w: any) => (
                      <tr key={w.season}>
                        <td className="font-mono font-bold">{w.season}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <DriverAvatar code={w.code} teamColor={w.color_hex || '#6B7280'} size={24} />
                            <span className="text-timing-white font-medium">{w.forename} {w.surname}</span>
                          </div>
                        </td>
                        <td style={{ color: w.color_hex }}>{w.team_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pit Stop Patterns */}
          {analysis.pit_window?.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Typical Pit Windows at This Track</h2></div>
              <div className="card-body">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {analysis.pit_window.map((pw: any) => (
                    <div key={pw.stop_number} className="bg-asphalt border border-white/[0.04] rounded-lg p-4 text-center">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-timing-muted">
                        Stop {pw.stop_number}
                      </div>
                      <div className="font-mono text-2xl font-bold text-circuit-green mt-2">
                        Lap {pw.median_lap}
                      </div>
                      <div className="text-[11px] text-timing-muted mt-1">
                        Window: L{pw.q25_lap} – L{pw.q75_lap}
                      </div>
                      <div className="text-[11px] text-timing-muted">
                        ({pw.total_stops} data points)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stop Count Distribution */}
          {analysis.stop_distribution?.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Stop Strategy Distribution</h2></div>
              <div className="card-body">
                <div className="flex gap-4 flex-wrap">
                  {analysis.stop_distribution.map((sd: any) => (
                    <div key={sd.num_stops} className="bg-asphalt border border-white/[0.04] rounded-lg p-4 text-center min-w-[120px]">
                      <div className="font-mono text-3xl font-bold text-timing-white">{sd.num_stops}</div>
                      <div className="text-[11px] text-timing-muted">stop{sd.num_stops > 1 ? 's' : ''}</div>
                      <div className="font-mono text-lg text-circuit-green mt-1">{sd.percentage}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
