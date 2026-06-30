'use client'

import { useState, useEffect, useRef } from 'react'
import { getLiveStatus, getLivePositions, getLiveStrategy } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'
import TyreIcon from '@/components/TyreIcon'

export default function LivePage() {
  const [status, setStatus] = useState<any>(null)
  const [positions, setPositions] = useState<any>(null)
  const [strategy, setStrategy] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const intervalRef = useRef<any>(null)

  async function fetchAll() {
    try {
      const [s, p, st] = await Promise.all([
        getLiveStatus().catch(() => null),
        getLivePositions().catch(() => null),
        getLiveStrategy().catch(() => null),
      ])
      setStatus(s)
      setPositions(p)
      setStrategy(st)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (e) {
      console.error('Live fetch error:', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    // Poll every 10 seconds during live sessions
    intervalRef.current = setInterval(fetchAll, 10000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const isLive = status?.is_live

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-timing-muted animate-pulse">Checking live session...</div>
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-timing-white">
            {isLive ? (
              <span className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-flag-red animate-pulse" />
                <span className="text-flag-red">LIVE</span>
              </span>
            ) : (
              <>Live <span className="text-circuit-green">Session</span></>
            )}
          </h1>
          <p className="text-timing-muted text-sm mt-1">
            {isLive
              ? `${status.session?.meeting_name} — ${status.session?.session_name}`
              : 'No session currently running'
            }
          </p>
        </div>
        {lastUpdate && (
          <div className="text-[11px] font-mono text-timing-muted">
            Updated: {lastUpdate}
          </div>
        )}
      </div>

      {/* No live session — show upcoming race */}
      {!isLive && status?.next_race && (
        <div className="card border-l-[3px] border-l-flag-amber">
          <div className="card-body">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <span className="badge badge-amber mr-2">UPCOMING</span>
                <span className="text-xl font-bold text-timing-white">{status.next_race.name}</span>
                <div className="text-timing-muted text-sm mt-1">
                  {status.next_race.circuit} · {status.next_race.country} · {status.next_race.date}
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-4xl font-bold text-flag-amber">
                  {status.next_race.days_until}
                </div>
                <div className="text-[11px] text-timing-muted uppercase tracking-wider">
                  {status.next_race.days_until === 1 ? 'day to go' : 'days to go'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Positions */}
      {positions?.positions?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Running Order</h2>
            <span className="text-[11px] text-timing-muted">{positions.session}</span>
          </div>
          <div className="card-body space-y-1">
            {positions.positions.map((p: any) => (
              <div
                key={p.driver_number}
                className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <span className="font-mono text-[11px] font-bold text-timing-muted w-6 text-right">
                  P{p.position}
                </span>
                <DriverAvatar code={p.driver_code} teamColor={p.team_color || '#6B7280'} size={28} />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-timing-white">{p.driver_name}</span>
                  <span className="text-[11px] ml-2" style={{ color: p.team_color }}>{p.team}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Strategy / Insights */}
      {strategy?.insights?.length > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title">Strategy Insights</h2></div>
          <div className="card-body space-y-3">
            {strategy.insights.map((insight: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 px-3 bg-asphalt rounded-lg border border-white/[0.04]">
                <span className={`text-lg mt-0.5 ${
                  insight.type === 'weather' ? 'text-drs-purple' :
                  insight.type === 'tyre_age' ? 'text-flag-amber' :
                  'text-circuit-green'
                }`}>
                  {insight.type === 'weather' ? '☁' : insight.type === 'tyre_age' ? '◎' : '⚑'}
                </span>
                <p className="text-sm text-timing-dim">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Stints */}
      {strategy?.stints?.length > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title">Current Tyre Stints</h2></div>
          <div className="card-body overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Stint</th>
                  <th>Compound</th>
                  <th>Laps</th>
                  <th>Tyre Age</th>
                </tr>
              </thead>
              <tbody>
                {[...strategy.stints]
                  .sort((a: any, b: any) => (b.stint_number || 0) - (a.stint_number || 0))
                  .filter((s: any, i: number, arr: any[]) =>
                    arr.findIndex(x => x.driver_number === s.driver_number) === i
                  )
                  .map((s: any) => (
                    <tr key={s.driver_number}>
                      <td className="font-mono font-semibold text-timing-white">{s.driver_code}</td>
                      <td className="font-mono">{s.stint_number}</td>
                      <td><TyreIcon compound={s.compound} showLabel /></td>
                      <td className="font-mono">L{s.lap_start} – {s.lap_end || '…'}</td>
                      <td className="font-mono" style={{ color: (s.tyre_age || 0) > 20 ? '#FF8A1E' : '#00C389' }}>
                        {s.tyre_age || '—'} laps
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No data state */}
      {!isLive && !positions?.positions?.length && !status?.next_race && (
        <div className="card">
          <div className="card-body text-center py-12">
            <div className="text-4xl mb-4">🏁</div>
            <p className="text-timing-muted">No live session data available and no upcoming races found.</p>
            <p className="text-timing-muted text-sm mt-2">
              Live data appears automatically when an F1 session is running (Practice, Qualifying, or Race).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
