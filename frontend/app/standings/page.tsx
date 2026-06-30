'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getDriverStandings, getConstructorStandings } from '@/lib/api'
import DriverAvatar from '@/components/DriverAvatar'

export default function StandingsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <StandingsContent />
    </Suspense>
  )
}

function StandingsContent() {
  const searchParams = useSearchParams()
  const season = parseInt(searchParams.get('season') || '2026', 10)
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers')
  const [driverStandings, setDriverStandings] = useState<any[]>([])
  const [constructorStandings, setConstructorStandings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [ds, cs] = await Promise.all([
        getDriverStandings(season).catch(() => ({ standings: [] })),
        getConstructorStandings(season).catch(() => ({ standings: [] })),
      ])
      setDriverStandings(ds.standings || [])
      setConstructorStandings(cs.standings || [])
      setLoading(false)
    }
    load()
  }, [season])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-timing-muted animate-pulse">Loading standings...</div>
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">Championship <span className="text-circuit-green">Standings</span></h1>
        <p className="text-timing-muted text-sm mt-1">Full driver and constructor championship tables</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-0.5 bg-white/[0.03] rounded-lg border border-white/[0.04] w-fit">
        <button
          className={`nav-pill ${tab === 'drivers' ? 'active' : ''}`}
          onClick={() => setTab('drivers')}
        >Drivers</button>
        <button
          className={`nav-pill ${tab === 'constructors' ? 'active' : ''}`}
          onClick={() => setTab('constructors')}
        >Constructors</button>
      </div>

      {/* Drivers Table */}
      {tab === 'drivers' && (
        <div className="card animate-fade-in">
          <div className="card-body overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Wins</th>
                  <th>Podiums</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {driverStandings.map((s: any) => (
                  <tr key={s.driver_id}>
                    <td className="font-mono font-bold">{s.position}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <DriverAvatar code={s.code} teamColor={s.color || '#6B7280'} size={26} />
                        <span className="font-semibold text-timing-white">{s.name}</span>
                      </div>
                    </td>
                    <td style={{ color: s.color }}>{s.team}</td>
                    <td className="font-mono font-bold text-circuit-green">{s.points}</td>
                    <td className="font-mono">{s.wins}</td>
                    <td className="font-mono">{s.podiums}</td>
                    <td className="font-mono" style={{ color: s.gap_to_leader === 0 ? '#00C389' : '#6B7280' }}>
                      {s.gap_to_leader === 0 ? 'Leader' : s.gap_to_leader}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Constructors Table */}
      {tab === 'constructors' && (
        <div className="card animate-fade-in">
          <div className="card-body overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Wins</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {constructorStandings.map((s: any) => (
                  <tr key={s.constructor_id}>
                    <td className="font-mono font-bold">{s.position}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <DriverAvatar
                          code={s.name?.substring(0, 3)?.toUpperCase()}
                          teamColor={s.color_hex || '#6B7280'}
                          size={26}
                        />
                        <span className="font-semibold" style={{ color: s.color_hex }}>{s.name}</span>
                      </div>
                    </td>
                    <td className="font-mono font-bold text-circuit-green">{s.total_points}</td>
                    <td className="font-mono">{s.wins}</td>
                    <td className="font-mono" style={{ color: s.gap_to_leader === 0 ? '#00C389' : '#6B7280' }}>
                      {s.gap_to_leader === 0 ? 'Leader' : s.gap_to_leader}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
