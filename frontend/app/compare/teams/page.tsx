'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getConstructors, compareTeams } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'
import F1CarTopDown from '@/components/F1CarTopDown'

export default function TeamComparePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <TeamCompareContent />
    </Suspense>
  )
}

function TeamCompareContent() {
  const searchParams = useSearchParams()
  const season = parseInt(searchParams.get('season') || '2026', 10)
  const [teams, setTeams] = useState<any[]>([])
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [comparison, setComparison] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getConstructors(season).then(d => setTeams(d.constructors || [])).catch(() => {})
  }, [season])

  useEffect(() => {
    if (!teamA || !teamB) { setComparison(null); return }
    setLoading(true)
    compareTeams(season, [teamA, teamB])
      .then(d => setComparison(d))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [teamA, teamB, season])

  const infoA = comparison?.summaries?.[teamA]
  const infoB = comparison?.summaries?.[teamB]
  const colorA = infoA?.color || '#6B7280'
  const colorB = infoB?.color || '#6B7280'

  function H2HBar({ label, valA, valB, suffix }: { label: string; valA: number; valB: number; suffix?: string }) {
    const total = valA + valB || 1
    const pctA = (valA / total) * 100
    return (
      <div className="bg-asphalt border border-white/[0.04] rounded-lg p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-timing-muted mb-3">{label}</div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-2xl font-bold" style={{ color: colorA }}>
            {typeof valA === 'number' && !Number.isInteger(valA) ? valA.toFixed(2) : valA}{suffix || ''}
          </span>
          <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
            <div className="h-full transition-all duration-700" style={{ width: `${pctA}%`, backgroundColor: colorA }} />
            <div className="h-full transition-all duration-700" style={{ width: `${100 - pctA}%`, backgroundColor: colorB }} />
          </div>
          <span className="font-mono text-2xl font-bold" style={{ color: colorB }}>
            {typeof valB === 'number' && !Number.isInteger(valB) ? valB.toFixed(2) : valB}{suffix || ''}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">Team <span className="text-circuit-green">Analysis</span></h1>
        <p className="text-timing-muted text-sm mt-1">Constructor performance, strategy patterns, and pit stop efficiency</p>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold tracking-wider uppercase text-timing-muted mb-2">Team A</label>
          <select className="select-field w-full" value={teamA} onChange={e => setTeamA(e.target.value)}>
            <option value="">Select team...</option>
            {teams.map(t => <option key={t.constructor_id} value={t.constructor_id}>{t.name}</option>)}
          </select>
        </div>
        <div className="font-mono text-xl font-bold text-flag-amber px-4" style={{ textShadow: '0 0 20px rgba(255,138,30,0.3)' }}>VS</div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold tracking-wider uppercase text-timing-muted mb-2">Team B</label>
          <select className="select-field w-full" value={teamB} onChange={e => setTeamB(e.target.value)}>
            <option value="">Select team...</option>
            {teams.map(t => <option key={t.constructor_id} value={t.constructor_id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="text-center text-timing-muted animate-pulse py-8">Loading comparison...</div>}

      {comparison && infoA && infoB && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Car Prototypes Versus Layout */}
          <div className="card relative overflow-hidden bg-hud-gradient shadow-hud h-[400px] flex perspective-1000">
            {/* Team A Side */}
            <div className="flex-1 relative border-r border-white/5 flex flex-col items-center justify-center">
              <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 50% 50%, ${colorA} 0%, transparent 60%)` }} />
              <div className="animate-float-3d" style={{ animationDelay: '0s' }}>
                <F1CarTopDown color={colorA} className="w-[180px] h-auto z-10" />
              </div>
              <div className="absolute bottom-6 left-6 z-10">
                <div className="badge badge-cyan mb-2" style={{ borderColor: colorA, color: colorA }}>TEAM A</div>
                <div className="text-3xl font-hud font-black uppercase text-timing-white leading-none drop-shadow-md" style={{ color: colorA }}>
                  {infoA.name}
                </div>
              </div>
            </div>

            {/* VS Badge */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <div className="w-20 h-20 rounded-full bg-[#111419] border-2 border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.9)] flex items-center justify-center font-hud font-black text-3xl text-flag-amber tracking-widest italic opacity-95">
                VS
              </div>
            </div>

            {/* Team B Side */}
            <div className="flex-1 relative flex flex-col items-center justify-center">
              <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 50% 50%, ${colorB} 0%, transparent 60%)` }} />
              <div className="animate-float-3d" style={{ animationDelay: '1.5s' }}>
                <F1CarTopDown color={colorB} className="w-[180px] h-auto z-10" />
              </div>
              <div className="absolute bottom-6 right-6 z-10 text-right">
                <div className="badge badge-cyan mb-2" style={{ borderColor: colorB, color: colorB }}>TEAM B</div>
                <div className="text-3xl font-hud font-black uppercase text-timing-white leading-none drop-shadow-md" style={{ color: colorB }}>
                  {infoB.name}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2 className="card-title">Head to Head</h2></div>
            <div className="card-body grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <H2HBar label="Total Points" valA={infoA.total_points} valB={infoB.total_points} />
              <H2HBar label="Wins" valA={infoA.wins} valB={infoB.wins} />
              <H2HBar label="Podiums" valA={infoA.podiums} valB={infoB.podiums} />
            </div>
          </div>

          {/* Pit Stop Comparison */}
          {(infoA.pit_avg || infoB.pit_avg) && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Pit Stop Performance</h2></div>
              <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { team: infoA, color: colorA, name: infoA.name },
                  { team: infoB, color: colorB, name: infoB.name },
                ].map((t, i) => (
                  <div key={i} className="bg-asphalt border border-white/[0.04] rounded-lg p-5" style={{ borderLeftColor: t.color, borderLeftWidth: 3 }}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: t.color }}>{t.name}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-2xl font-bold text-circuit-green">
                          {t.team.pit_avg?.toFixed(2) || '—'}<span className="text-[11px] text-timing-muted ml-1">s avg</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-2xl font-bold text-circuit-green">
                          {t.team.pit_fastest?.toFixed(2) || '—'}<span className="text-[11px] text-timing-muted ml-1">s best</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-timing-muted text-[11px] mt-2">{t.team.pit_count || 0} stops this season</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drivers */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Driver Lineup</h2></div>
            <div className="card-body grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: colorA }}>{infoA.name}</div>
                <div className="flex gap-2 flex-wrap">
                  {infoA.drivers?.map((code: string) => (
                    <div key={code} className="flex items-center gap-2 bg-asphalt px-3 py-2 rounded-lg border border-white/[0.04]">
                      <DriverAvatar code={code} teamColor={colorA} size={24} />
                      <span className="text-sm font-mono text-timing-white">{code}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: colorB }}>{infoB.name}</div>
                <div className="flex gap-2 flex-wrap">
                  {infoB.drivers?.map((code: string) => (
                    <div key={code} className="flex items-center gap-2 bg-asphalt px-3 py-2 rounded-lg border border-white/[0.04]">
                      <DriverAvatar code={code} teamColor={colorB} size={24} />
                      <span className="text-sm font-mono text-timing-white">{code}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
