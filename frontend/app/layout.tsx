import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'F1 Telemetry Room — Race Analytics Dashboard',
  description: 'Professional F1 data analysis platform — driver, team, tyre & track comparisons with AI-powered chat analyst.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 pb-16">
          {children}
        </main>
        <footer className="border-t border-white/[0.06] px-6 py-4 text-center text-timing-muted text-xs">
          F1 Telemetry Room — Unofficial project, not affiliated with Formula 1 or FIA.
          Data from Jolpica-F1 &amp; OpenF1.
        </footer>
      </body>
    </html>
  )
}
