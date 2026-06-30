'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSeasonSchedule, getTyreAnalysis, TYRE_COLORS } from '@/lib/api'
import TyreIcon from '@/components/TyreIcon'

export default function TyreAnalysisPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <TyreAnalysisContent />
    </Suspense>
  )
}

function TyreAnalysisContent() {
  const searchParams = useSearchParams()
  const season = parseInt(searchParams.get('season') || '2026', 10)
  const [races, setRaces] = useState<any[]>([])
  const [selectedRace, setSelectedRace] = useState('')
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getSeasonSchedule(season)
      .then(d => setRaces((d.races || []).filter((r: any) => r.completed)))
      .catch(() => {})
  }, [season])

  useEffect(() => {
    if (!selectedRace) { setAnalysis(null); return }
    setLoading(true)
    getTyreAnalysis(parseInt(selectedRace))
      .then(d => setAnalysis(d))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [selectedRace])

  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">Tyre Strategy <span className="text-circuit-green">Analysis</span></h1>
        <p className="text-timing-muted text-sm mt-1">Compound performance, degradation patterns, and strategy breakdown</p>
      </div>

      <div>
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-timing-muted mb-2">Select Race</label>
        <select className="select-field max-w-md" value={selectedRace} onChange={e => setSelectedRace(e.target.value)}>
          <option value="">Select a race...</option>
          {races.map(r => <option key={r.race_id} value={r.race_id}>R{r.round} — {r.name}</option>)}
        </select>
      </div>

      {/* Compound Legend */}
      <div className="flex gap-6 flex-wrap">
        {Object.entries(TYRE_COLORS).map(([compound, color]) => (
          <TyreIcon key={compound} compound={compound} size={14} showLabel />
        ))}
      </div>

      {loading && <div className="text-center text-timing-muted animate-pulse py-8">Loading tyre data...</div>}

      {analysis && (
        <div className="space-y-6 animate-fade-in">
          {/* Strategy Timeline */}
          {analysis.stints?.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Strategy Timeline</h2></div>
              <div className="card-body space-y-1">
                {(() => {
                  const byDriver: Record<string, any[]> = {}
                  analysis.stints.forEach((s: any) => {
                    const key = s.driver_code || s.driver_id
                    if (!byDriver[key]) byDriver[key] = []
                    byDriver[key].push(s)
                  })
                  const maxLap = Math.max(...analysis.stints.map((s: any) => s.lap_end || 0), 60)

                  return Object.entries(byDriver).map(([code, stints]) => (
                    <div key={code} className="flex items-center gap-3">
                      <span className="font-mono text-[11px] font-semibold w-10 text-right"
                            style={{ color: stints[0]?.team_color || '#9BA1B0' }}>
                        {code}
                      </span>
                      <div className="flex-1 h-6 flex rounded overflow-hidden">
                        {[...stints].sort((a: any, b: any) => (a.lap_start || 0) - (b.lap_start || 0)).map((stint: any, i: number) => {
                          const start = stint.lap_start || 1
                          const end = stint.lap_end || maxLap
                          const width = ((end - start + 1) / maxLap) * 100
                          const color = TYRE_COLORS[stint.compound?.toUpperCase()] || '#6B7280'
                          const isHard = stint.compound?.toUpperCase() === 'HARD'
                          return (
                            <div
                              key={i}
                              className="h-full flex items-center justify-center font-mono text-[9px] font-bold transition-opacity hover:opacity-80"
                              style={{
                                width: `${width}%`,
                                backgroundColor: color,
                                color: isHard ? '#15171C' : '#0D0F13',
                              }}
                              title={`${stint.compound} · Laps ${start}-${end} (${end - start + 1} laps)`}
                            >
                              {stint.compound?.charAt(0)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {/* Tyre Life Analysis HUD Dials */}
          {analysis && (
            <div className="card border-none bg-transparent shadow-none backdrop-blur-none before:hidden">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {Object.keys(TYRE_COLORS).map((compoundName, index: number) => {
                  const t = (analysis.tyre_life || []).find((x: any) => x.compound?.toUpperCase() === compoundName) || {
                    compound: compoundName,
                    avg_life_laps: 0,
                    max_life_laps: 0,
                    usage_count: 0
                  }

                  return (
                    <div key={compoundName || index} className="card relative p-4 flex flex-col items-center justify-center min-h-[220px]">
                      <div className="absolute top-3 left-3 text-[8px] font-mono text-timing-muted tracking-[0.1em] uppercase">TYRE DATA</div>
                      
                      {/* Glowing Circular HUD Element */}
                      <div className="relative w-24 h-24 mt-6 mb-2 flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                           <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" strokeDasharray="4 4" />
                           <circle cx="48" cy="48" r="40" fill="none" stroke={TYRE_COLORS[compoundName]} strokeWidth="1" strokeDasharray={t.avg_life_laps > 0 ? "200" : "0"} strokeDashoffset="50" opacity={t.avg_life_laps > 0 ? "0.5" : "0.1"} />
                           <circle cx="48" cy="48" r="36" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />
                        </svg>
                        
                        {/* Real Photorealistic Tyre Image */}
                        <div className="z-10 flex flex-col items-center justify-center pt-2">
                          <div className="relative w-12 h-12 mb-1">
                            {/* Tyre Image */}
                            <img src="/api/tyre" alt={compoundName} className="w-full h-full object-contain drop-shadow-2xl" />
                            {/* Glowing Color Ring indicating Compound */}
                            <div className="absolute inset-0 rounded-full border-4 mix-blend-screen opacity-90 shadow-[0_0_8px_currentColor]" style={{ borderColor: TYRE_COLORS[compoundName], color: TYRE_COLORS[compoundName] }} />
                          </div>
                          <div className="font-mono text-2xl font-bold text-timing-white leading-none drop-shadow-md">
                            {t.avg_life_laps || 0}
                          </div>
                          <div className="text-[7px] font-mono tracking-widest uppercase text-timing-muted mt-0.5">LAPS</div>
                        </div>
                        
                        {/* Fake Telemetry Pointers */}
                        {t.avg_life_laps > 0 && (
                          <>
                            <div className="absolute right-0 top-1/2 w-1.5 h-0.5 bg-circuit-cyan shadow-glow-cyan" />
                            <div className="absolute left-0 bottom-4 w-1 h-1 rounded-full bg-flag-red shadow-glow-cyan" />
                          </>
                        )}
                      </div>

                      <div className="w-full flex items-center justify-between mt-3 px-1 border-t border-white/[0.05] pt-3">
                        <div className="text-center">
                           <div className="text-[8px] font-mono text-timing-muted tracking-[0.1em] uppercase">MAX</div>
                           <div className="font-mono text-xs font-bold text-circuit-cyan">{t.max_life_laps || 0}</div>
                        </div>
                        <div className="text-center">
                           <div className="text-[8px] font-mono text-timing-muted tracking-[0.1em] uppercase">SETS</div>
                           <div className="font-mono text-xs font-bold text-timing-white">{t.usage_count || 0}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pit Stop Table */}
          {analysis.pit_stops?.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Pit Stop Details</h2></div>
              <div className="card-body overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Stop #</th>
                      <th>Lap</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.pit_stops.map((p: any, i: number) => (
                      <tr key={i}>
                        <td className="font-mono font-semibold text-timing-white">{p.driver_code}</td>
                        <td className="font-mono">{p.stop_number}</td>
                        <td className="font-mono">{p.lap}</td>
                        <td className="font-mono text-circuit-green">{p.duration_seconds?.toFixed(2)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fallback message if data is empty */}
          {!analysis.stints?.length && !analysis.pit_stops?.length && (
            <div className="card relative overflow-hidden flex items-center justify-center min-h-[300px] border border-flag-red/30 bg-flag-red/5">
              <div className="absolute inset-0 bg-[url('https://media.formula1.com/d_team_car_fallback_image.png')] bg-cover opacity-5 mix-blend-screen grayscale" />
              <div className="z-10 text-center">
                <div className="badge badge-red mb-4">NO TELEMETRY SIGNAL</div>
                <h3 className="text-2xl font-hud font-black text-timing-white uppercase tracking-wider">
                  Stint Data Unavailable
                </h3>
                <p className="text-timing-muted text-sm mt-2 font-mono uppercase tracking-widest">
                  OpenF1 Telemetry requires 2023+ season data.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* When NO race is selected */}
      {!analysis && !loading && (
         <div className="card relative overflow-hidden flex items-center justify-center min-h-[400px] border border-circuit-cyan/30 bg-circuit-cyan/5 mt-8 shadow-glow-cyan">
           <div className="absolute inset-0 bg-[url('https://media.formula1.com/d_team_car_fallback_image.png')] bg-cover opacity-10 mix-blend-screen" />
           <div className="z-10 flex flex-col items-center">
             <div className="w-16 h-16 rounded-full border-2 border-circuit-cyan border-t-transparent animate-spin mb-6" />
             <div className="badge badge-cyan mb-3">SYSTEM STANDBY</div>
             <h3 className="text-3xl font-hud font-black text-timing-white uppercase tracking-[0.2em]">
               Awaiting Race Selection
             </h3>
             <p className="text-circuit-cyan font-mono text-xs mt-3 uppercase tracking-[0.3em]">
               Select a race from the dropdown above to initialize tyre telemetry.
             </p>
           </div>
         </div>
      )}
    </div>
  )
}
