'use client'

import ChatBox from '@/components/ChatBox'

export default function ChatPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="border-b border-white/[0.06] pb-6">
        <h1 className="text-3xl font-bold text-timing-white">
          AI Data <span className="text-circuit-green">Analyst</span>
        </h1>
        <p className="text-timing-muted text-sm mt-1">
          Ask questions about F1 data in plain English — grounded in real database queries
        </p>
      </div>

      <div style={{ height: 'calc(100vh - 240px)' }}>
        <ChatBox placeholder="Ask about F1 standings, lap times, degradation rates, or historical race stats..." />
      </div>
    </div>
  )
}

