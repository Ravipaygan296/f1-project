'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getDriverStandings, getConstructorStandings, getSeasonSchedule, getLiveStatus } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading overview...</div>}>
      <OverviewContent />
    </Suspense>
  )
}

function OverviewContent() {
  const searchParams = useSearchParams()
  const season = parseInt(searchParams.get('season') || '2026', 10)
  const [driverStandings, setDriverStandings] = useState<any[]>([])
  const [constructorStandings, setConstructorStandings] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([])
  const [liveStatus, setLiveStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [ds, cs, sch, live] = await Promise.all([
          getDriverStandings(season).catch(() => ({ standings: [] })),
          getConstructorStandings(season).catch(() => ({ standings: [] })),
          getSeasonSchedule(season).catch(() => ({ races: [] })),
          getLiveStatus().catch(() => null),
        ])
        setDriverStandings(ds.standings || [])
        setConstructorStandings(cs.standings || [])
        setSchedule(sch.races || [])
        setLiveStatus(live)
      } catch (e) {
        console.error('Failed to load overview:', e)
      }
      setLoading(false)
    }
    loadData()
  }, [season])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-timing-muted text-sm animate-pulse">Loading dashboard...</div>
      </div>
    )
  }

  const completedRaces = schedule.filter(r => r.completed)
  const lastRace = completedRaces[completedRaces.length - 1]
  const upcomingRaces = schedule.filter(r => !r.completed)

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">
          Season <span className="text-circuit-green">{season}</span> Overview
        </h1>
        <p className="text-timing-muted text-sm mt-1">Championship standings, recent results, and key statistics</p>
      </div>

      {/* Live / Next Race Banner */}
      {liveStatus && (
        <div className="card border-l-[3px] border-l-circuit-green">
          <div className="card-body">
            {liveStatus.is_live ? (
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-flag-red animate-pulse" />
                <span className="font-mono text-xs font-bold text-flag-red tracking-wider">LIVE</span>
                <span className="text-timing-white font-semibold">
                  {liveStatus.session?.meeting_name} — {liveStatus.session?.session_name}
                </span>
              </div>
            ) : liveStatus.next_race ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="badge badge-green mr-2">NEXT RACE</span>
                  <span className="text-timing-white font-semibold">{liveStatus.next_race.name}</span>
                  <span className="text-timing-muted text-sm ml-2">
                    {liveStatus.next_race.circuit} · {liveStatus.next_race.country}
                  </span>
                </div>
                <div className="font-mono text-circuit-green font-bold">
                  {liveStatus.next_race.days_until === 0 ? 'TODAY' :
                   liveStatus.next_race.days_until === 1 ? 'TOMORROW' :
                   `${liveStatus.next_race.days_until} DAYS`}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Top 3 Drivers Premium Cards */}
      {driverStandings.length >= 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[
            { s: driverStandings[0], title: 'Championship Leader', img: 'https://media.formula1.com/d_driver_fallback_image.png', size: 'lg' },
            { s: driverStandings[1], title: '2nd Place', img: 'https://media.formula1.com/d_driver_fallback_image.png', size: 'md' },
            { s: driverStandings[2], title: '3rd Place', img: 'https://media.formula1.com/d_driver_fallback_image.png', size: 'md' },
          ].map((driver, i) => {
            const { s, title, img, size } = driver
            const isLeader = i === 0
            
            return (
              <div 
                key={s.driver_id} 
                className={`card relative overflow-hidden group ${isLeader ? 'lg:col-span-1 h-56' : 'h-56'}`}
                style={{ 
                  background: `linear-gradient(135deg, ${s.color || '#161920'}40 0%, #0A0C10 100%)`,
                  borderTopColor: s.color || '#333842'
                }}
              >
                {/* Background Car Image / Glow */}
                <div 
                  className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-screen"
                  style={{ backgroundImage: `url('https://media.formula1.com/d_team_car_fallback_image.png')` }}
                />
                
                {/* Driver Portrait Image */}
                <div className="absolute right-[-20px] bottom-0 h-full w-[60%] z-0 pointer-events-none transition-transform duration-700 group-hover:scale-105">
                  <img src={img} alt={s.name} className="w-full h-full object-cover object-bottom drop-shadow-2xl opacity-90" />
                  {/* Fade out bottom of image for blending */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0C10] via-transparent to-transparent" />
                </div>

                {/* Content Overlay */}
                <div className="absolute inset-0 p-6 flex flex-col justify-between z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-white/80 uppercase tracking-widest backdrop-blur-md">
                        {title}
                      </span>
                    </div>
                    <div className={`font-hud font-black text-timing-white uppercase leading-none ${isLeader ? 'text-4xl' : 'text-3xl'}`}>
                      {s.name.split(' ')[0]}<br/>
                      <span style={{ color: s.color || '#00E5FF' }}>{s.name.split(' ')[1]}</span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-timing-dim mb-1">{s.team}</div>
                      <div className="text-2xl font-mono font-bold text-timing-white">{s.points} <span className="text-[11px] text-timing-muted">PTS</span></div>
                    </div>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 backdrop-blur border border-white/10 text-timing-white font-mono text-sm font-bold shadow-hud">
                      {s.position}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Global Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: completedRaces.length, label: 'Races Completed' },
          { value: new Set(completedRaces.map(r => r.winner?.code).filter(Boolean)).size, label: 'Different Winners' },
          { value: driverStandings[0]?.points || 0, label: 'Leader Points' },
          { value: upcomingRaces.length, label: 'Races Remaining' },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col justify-center items-center p-4 bg-hud-gradient border border-white/[0.04] rounded-xl shadow-inner">
             <div className="font-mono text-2xl font-bold text-circuit-cyan drop-shadow-glow-cyan">{stat.value}</div>
             <div className="text-[9px] font-mono font-bold text-timing-muted uppercase tracking-[0.2em] mt-2">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Driver Standings */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Driver Championship</h2>
        </div>
        <div className="card-body space-y-2">
          {driverStandings.slice(0, 10).map((s: any) => {
            const maxPts = driverStandings[0]?.points || 1
            const pct = (s.points / maxPts) * 100
            return (
              <div key={s.driver_id} className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-timing-muted w-6 text-right">
                  {s.position}
                </span>
                <DriverAvatar code={s.code} teamColor={s.color || '#6B7280'} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-timing-white truncate">{s.name}</div>
                  <div className="text-[11px]" style={{ color: s.color }}>{s.team}</div>
                </div>
                <div className="flex-[2] h-6 bg-white/[0.03] rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end px-2 transition-all duration-1000"
                    style={{ width: `${pct}%`, backgroundColor: s.color || '#6B7280' }}
                  >
                    <span className="font-mono text-[11px] font-bold text-asphalt-deep">{s.points}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Constructor Standings */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Constructor Championship</h2>
        </div>
        <div className="card-body space-y-2">
          {constructorStandings.map((s: any) => {
            const maxPts = constructorStandings[0]?.total_points || 1
            const pct = (s.total_points / maxPts) * 100
            return (
              <div key={s.constructor_id} className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-timing-muted w-6 text-right">
                  {s.position}
                </span>
                <DriverAvatar code={s.name?.substring(0, 3)?.toUpperCase()} teamColor={s.color_hex || '#6B7280'} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: s.color_hex }}>{s.name}</div>
                </div>
                <div className="flex-[2] h-6 bg-white/[0.03] rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end px-2 transition-all duration-1000"
                    style={{ width: `${pct}%`, backgroundColor: s.color_hex || '#6B7280' }}
                  >
                    <span className="font-mono text-[11px] font-bold text-asphalt-deep">{s.total_points}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Race Calendar */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Race Calendar &amp; Results</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {schedule.map((race: any) => (
              <div key={race.round}
                className="flex items-center gap-3 p-3 bg-asphalt border border-white/[0.04] rounded-lg hover:border-white/10 transition-all">
                <span className="font-mono text-[11px] font-bold text-timing-muted w-7 text-center">
                  R{race.round}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-timing-white truncate">{race.name}</div>
                  <div className="text-[11px] text-timing-muted">{race.race_date}</div>
                </div>
                {race.winner ? (
                  <div className="flex items-center gap-1.5">
                    <DriverAvatar code={race.winner.code} teamColor={race.winner.color_hex || '#6B7280'} size={22} />
                    <span className="text-[11px] text-timing-dim">{race.winner.surname}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-timing-muted">Upcoming</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
