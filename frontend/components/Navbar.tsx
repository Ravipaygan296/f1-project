'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Overview', icon: '◉' },
  { href: '/compare/drivers', label: 'Driver vs Driver', icon: '⇄' },
  { href: '/compare/teams', label: 'Teams', icon: '⚑' },
  { href: '/compare/tyres', label: 'Tyres', icon: '◎' },
  { href: '/compare/tracks', label: 'Tracks', icon: '◈' },
  { href: '/standings', label: 'Standings', icon: '▲' },
  { href: '/prediction', label: 'Prediction', icon: '⧫' },
  { href: '/live', label: 'Live Data', icon: '●' },
  { href: '/live-prediction', label: 'Live Predict', icon: '🎯' },
  { href: '/chat', label: 'AI Analyst', icon: '⬡' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSeason = searchParams.get('season') || '2026'

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('season', e.target.value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-[70px]
                        bg-asphalt-deep/80 backdrop-blur-2xl
                        border-b border-white/[0.04] shadow-hud">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 shrink-0 group">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-circuit-cyan/20 to-transparent border border-circuit-cyan/30 shadow-glow-cyan group-hover:border-circuit-cyan transition-colors">
          <svg className="w-6 h-6" viewBox="0 0 80 40" fill="none">
            <path d="M5 35 L15 5 L25 5 L20 20 L30 20 L25 35Z" fill="#00E5FF"/>
            <path d="M32 35 L42 5 L52 5 L42 35Z" fill="#F3F4F6"/>
          </svg>
        </div>
        <div className="flex flex-col leading-none justify-center">
          <span className="text-[14px] font-hud font-bold tracking-[0.2em] text-timing-white uppercase">TELEMETRY<span className="text-circuit-cyan">ROOM</span></span>
          <span className="text-[9px] font-mono font-bold tracking-[0.3em] text-timing-muted mt-1 uppercase">F1 Analytics Engine</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex items-center gap-1 p-1 bg-graphite/40 backdrop-blur-xl rounded-xl border border-white/[0.04] shadow-inner">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={`${item.href}?season=${currentSeason}`}
            className={`nav-pill ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="text-sm leading-none">{item.icon}</span>
            <span className="hidden lg:inline">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Season selector */}
      <div className="shrink-0">
        <select 
          className="select-field min-w-[100px]" 
          value={currentSeason}
          onChange={handleSeasonChange}
        >
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
          <option value="2021">2021</option>
          <option value="2020">2020</option>
          <option value="2019">2019</option>
          <option value="2018">2018</option>
        </select>
      </div>
    </header>
  )
}
