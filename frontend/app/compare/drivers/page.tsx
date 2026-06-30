'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getDrivers, compareDriversSeason, compareDrivers, getSeasonSchedule } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'
import PaceChart from '@/components/PaceChart'

export default function DriverComparePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <DriverCompareContent />
    </Suspense>
  )
}

function DriverCompareContent() {
  const searchParams = useSearchParams()
  const season = parseInt(searchParams.get('season') || '2026', 10)
  const [drivers, setDrivers] = useState<any[]>([])
  const [driverA, setDriverA] = useState('')
  const [driverB, setDriverB] = useState('')
  const [comparison, setComparison] = useState<any>(null)
  const [races, setRaces] = useState<any[]>([])
  const [selectedRace, setSelectedRace] = useState('')
  const [raceComparison, setRaceComparison] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadingRace, setLoadingRace] = useState(false)

  useEffect(() => {
    getDrivers(season)
      .then(data => setDrivers(data.drivers || []))
      .catch(() => {})

    getSeasonSchedule(season)
      .then(data => setRaces((data.races || []).filter(r => r.completed)))
      .catch(() => {})
  }, [season])

  useEffect(() => {
    if (!driverA || !driverB) { setComparison(null); setRaceComparison(null); return }
    setLoading(true)
    compareDriversSeason(season, [driverA, driverB])
      .then(data => setComparison(data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [driverA, driverB, season])

  useEffect(() => {
    if (!driverA || !driverB || !selectedRace) { setRaceComparison(null); return }
    setLoadingRace(true)
    compareDrivers(parseInt(selectedRace), [driverA, driverB])
      .then(data => setRaceComparison(data))
      .catch(e => console.error(e))
      .finally(() => setLoadingRace(false))
  }, [driverA, driverB, selectedRace])

  const infoA = comparison?.summaries?.[driverA]
  const infoB = comparison?.summaries?.[driverB]
  const colorA = infoA?.color || '#6B7280'
  const colorB = infoB?.color || '#6B7280'

  function H2HBar({ label, valA, valB }: { label: string; valA: number; valB: number }) {
    const total = valA + valB || 1
    const pctA = (valA / total) * 100
    return (
      <div className="bg-asphalt border border-white/[0.04] rounded-lg p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-timing-muted mb-3">{label}</div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-2xl font-bold" style={{ color: colorA }}>{valA}</span>
          <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctA}%`, backgroundColor: colorA }} />
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${100 - pctA}%`, backgroundColor: colorB }} />
          </div>
          <span className="font-mono text-2xl font-bold" style={{ color: colorB }}>{valB}</span>
        </div>
      </div>
    )
  }

  // Format seconds into MM:SS.mmm format for display
  function formatSeconds(seconds: number) {
    if (!seconds) return '—'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 1000)
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">Driver vs <span className="text-circuit-green">Driver</span></h1>
        <p className="text-timing-muted text-sm mt-1">Head-to-head performance comparison</p>
      </div>

      {/* Selectors */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold tracking-wider uppercase text-timing-muted mb-2">Driver A</label>
          <select className="select-field w-full" value={driverA} onChange={e => setDriverA(e.target.value)}>
            <option value="">Select driver...</option>
            {drivers.map(d => (
              <option key={d.driver_id} value={d.driver_id}>{d.code} — {d.forename} {d.surname}</option>
            ))}
          </select>
          {infoA && (
            <div className="flex items-center gap-3 mt-3">
              <DriverAvatar code={drivers.find(d => d.driver_id === driverA)?.code || '???'} teamColor={colorA} size={44} />
              <div>
                <div className="text-sm font-semibold text-timing-white">{drivers.find(d => d.driver_id === driverA)?.forename} {drivers.find(d => d.driver_id === driverA)?.surname}</div>
                <div className="text-[11px]" style={{ color: colorA }}>{infoA.team}</div>
              </div>
            </div>
          )}
        </div>

        <div className="font-mono text-xl font-bold text-flag-amber px-4" style={{ textShadow: '0 0 20px rgba(255,138,30,0.3)' }}>
          VS
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold tracking-wider uppercase text-timing-muted mb-2">Driver B</label>
          <select className="select-field w-full" value={driverB} onChange={e => setDriverB(e.target.value)}>
            <option value="">Select driver...</option>
            {drivers.map(d => (
              <option key={d.driver_id} value={d.driver_id}>{d.code} — {d.forename} {d.surname}</option>
            ))}
          </select>
          {infoB && (
            <div className="flex items-center gap-3 mt-3">
              <DriverAvatar code={drivers.find(d => d.driver_id === driverB)?.code || '???'} teamColor={colorB} size={44} />
              <div>
                <div className="text-sm font-semibold text-timing-white">{drivers.find(d => d.driver_id === driverB)?.forename} {drivers.find(d => d.driver_id === driverB)?.surname}</div>
                <div className="text-[11px]" style={{ color: colorB }}>{infoB.team}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && <div className="text-center text-timing-muted animate-pulse py-8">Loading comparison...</div>}

      {/* Error or Missing Data State */}
      {comparison?.error && !loading && driverA && driverB && (
        <div className="card relative overflow-hidden flex items-center justify-center min-h-[300px] border border-flag-amber/30 bg-flag-amber/5 mt-6">
          <div className="z-10 flex flex-col items-center text-center">
            <div className="badge badge-amber mb-4">NO DATA FOUND</div>
            <h3 className="text-2xl font-hud font-black text-timing-white uppercase tracking-wider">
              Awaiting Race Results
            </h3>
            <p className="text-timing-muted text-sm mt-2 font-mono uppercase tracking-widest max-w-md">
              There are no completed race results for these drivers in the {season} season yet. Check back after the first race.
            </p>
          </div>
        </div>
      )}

      {/* Initial State / Prompt */}
      {!comparison && !loading && (!driverA || !driverB) && (
         <div className="card relative overflow-hidden flex items-center justify-center min-h-[400px] border border-circuit-cyan/30 bg-circuit-cyan/5 mt-6 shadow-glow-cyan">
           <div className="z-10 flex flex-col items-center">
             <div className="w-16 h-16 rounded-full border-2 border-circuit-cyan border-t-transparent animate-spin mb-6" />
             <div className="badge badge-cyan mb-3">SYSTEM STANDBY</div>
             <h3 className="text-3xl font-hud font-black text-timing-white uppercase tracking-[0.2em]">
               Awaiting Drivers
             </h3>
             <p className="text-circuit-cyan font-mono text-xs mt-3 uppercase tracking-[0.3em] text-center">
               Select two drivers from the dropdowns above to initialize head-to-head telemetry.
             </p>
           </div>
         </div>
      )}

      {/* Data Render */}
      {comparison && !comparison.error && infoA && infoB && (
        <div className="space-y-6 animate-fade-in mt-6">
          {/* H2H Stats */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Season Head to Head</h2></div>
            <div className="card-body grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <H2HBar label="Wins" valA={infoA.wins} valB={infoB.wins} />
              <H2HBar label="Podiums" valA={infoA.podiums} valB={infoB.podiums} />
              <H2HBar label="Total Points" valA={infoA.total_points} valB={infoB.total_points} />
              {comparison.head_to_head && (
                <H2HBar label="Race H2H" valA={comparison.head_to_head[driverA] || 0} valB={comparison.head_to_head[driverB] || 0} />
              )}
              <H2HBar label="Avg Grid" valA={Math.round(20 - infoA.avg_grid)} valB={Math.round(20 - infoB.avg_grid)} />
              <H2HBar label="DNFs" valA={infoA.dnfs} valB={infoB.dnfs} />
            </div>
          </div>

          {/* Race-Specific Detailed Telemetry */}
          <div className="card">
            <div className="card-header flex items-center justify-between flex-wrap gap-4">
              <h2 className="card-title">Race Telemetry &amp; Lap Times</h2>
              <select
                className="select-field text-xs min-w-[180px]"
                value={selectedRace}
                onChange={e => setSelectedRace(e.target.value)}
              >
                <option value="">Select race for telemetry...</option>
                {races.map(r => (
                  <option key={r.race_id} value={r.race_id}>R{r.round} — {r.name}</option>
                ))}
              </select>
            </div>
            <div className="card-body">
              {loadingRace && <div className="text-center text-timing-muted animate-pulse py-8">Loading race telemetry...</div>}
              
              {raceComparison && !loadingRace && (
                <div className="space-y-6">
                  {/* Pace and Consistency Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Driver A Stats */}
                    <div className="bg-asphalt border border-white/[0.04] p-4 rounded-lg" style={{ borderLeft: `3px solid ${colorA}` }}>
                      <span className="text-xs font-bold font-mono tracking-wider" style={{ color: colorA }}>
                        {drivers.find(d => d.driver_id === driverA)?.code} PACE &amp; CONSISTENCY
                      </span>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <div className="text-[10px] text-timing-muted uppercase">Median Pace</div>
                          <div className="text-lg font-mono font-semibold text-timing-white">
                            {formatSeconds(raceComparison.pace?.find((p: any) => p.driver_id === driverA)?.median_pace)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-timing-muted uppercase">Lap Consistency (IQR)</div>
                          <div className="text-lg font-mono font-semibold text-timing-white">
                            {raceComparison.consistency?.find((p: any) => p.driver_id === driverA)?.lap_time_iqr?.toFixed(3)}s
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Driver B Stats */}
                    <div className="bg-asphalt border border-white/[0.04] p-4 rounded-lg" style={{ borderLeft: `3px solid ${colorB}` }}>
                      <span className="text-xs font-bold font-mono tracking-wider" style={{ color: colorB }}>
                        {drivers.find(d => d.driver_id === driverB)?.code} PACE &amp; CONSISTENCY
                      </span>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <div className="text-[10px] text-timing-muted uppercase">Median Pace</div>
                          <div className="text-lg font-mono font-semibold text-timing-white">
                            {formatSeconds(raceComparison.pace?.find((p: any) => p.driver_id === driverB)?.median_pace)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-timing-muted uppercase">Lap Consistency (IQR)</div>
                          <div className="text-lg font-mono font-semibold text-timing-white">
                            {raceComparison.consistency?.find((p: any) => p.driver_id === driverB)?.lap_time_iqr?.toFixed(3)}s
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recharts Pace Chart */}
                  {raceComparison.lap_by_lap?.length > 0 && (
                    <div className="bg-asphalt border border-white/[0.04] p-4 rounded-lg">
                      <div className="text-xs font-semibold uppercase tracking-wider text-timing-muted mb-4">Lap Time Progression</div>
                      <PaceChart
                        data={raceComparison.lap_by_lap}
                        drivers={[
                          { id: driverA, code: drivers.find(d => d.driver_id === driverA)?.code || 'A', color: colorA },
                          { id: driverB, code: drivers.find(d => d.driver_id === driverB)?.code || 'B', color: colorB }
                        ]}
                      />
                    </div>
                  )}
                </div>
              )}

              {!selectedRace && (
                <div className="text-center text-timing-muted py-8 text-sm">
                  Select a completed grand prix from the dropdown to visualize lap-by-lap telemetry comparison.
                </div>
              )}
            </div>
          </div>

          {/* Race by race results table */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Season Race Results</h2></div>
            <div className="card-body overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Race</th>
                    <th style={{ color: colorA }}>Grid A</th>
                    <th style={{ color: colorA }}>Finish A</th>
                    <th style={{ color: colorA }}>Pts A</th>
                    <th style={{ color: colorB }}>Grid B</th>
                    <th style={{ color: colorB }}>Finish B</th>
                    <th style={{ color: colorB }}>Pts B</th>
                  </tr>
                </thead>
                <tbody>
                  {infoA.races?.map((rA: any) => {
                    const rB = infoB.races?.find((r: any) => r.round === rA.round)
                    return (
                      <tr key={rA.round}>
                        <td className="font-mono">R{rA.round}</td>
                        <td className="text-timing-white font-medium">{rA.race_name?.replace(' Grand Prix', '')}</td>
                        <td className="font-mono" style={{ color: colorA }}>{rA.grid ?? '—'}</td>
                        <td className="font-mono font-bold" style={{ color: colorA }}>{rA.position ?? 'DNF'}</td>
                        <td className="font-mono" style={{ color: colorA }}>{rA.points}</td>
                        <td className="font-mono" style={{ color: colorB }}>{rB?.grid ?? '—'}</td>
                        <td className="font-mono font-bold" style={{ color: colorB }}>{rB?.position ?? 'DNF'}</td>
                        <td className="font-mono" style={{ color: colorB }}>{rB?.points ?? 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

