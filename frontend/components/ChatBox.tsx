'use client'

import { useState, useRef, useEffect } from 'react'
import { askAnalyst } from '@/lib/api'

interface Message {
  role: 'user' | 'system'
  content: string
  sql?: string
  data?: any[]
}

interface ChatBoxProps {
  initialQuestion?: string
  placeholder?: string
  embedded?: boolean
}

export default function ChatBox({
  initialQuestion = '',
  placeholder = 'Ask the AI Analyst about F1 data...',
  embedded = false,
}: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'F1 AI Analyst loaded. Ask me questions about lap times, strategy, standings, or historical winners.',
    },
  ])
  const [input, setInput] = useState(initialQuestion)
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')

    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    try {
      const res = await askAnalyst(q)
      if (res.error && !res.answer) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `⚠️ ${res.error}`,
          sql: res.sql || undefined,
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'system',
          content: res.answer || 'No insights returned.',
          sql: res.sql || undefined,
          data: res.data,
        }])
      }
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${e.message}. Is the backend running?`,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex flex-col bg-graphite border border-white/[0.06] rounded-xl overflow-hidden ${
      embedded ? 'h-[400px]' : 'h-full'
    }`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0
              ${msg.role === 'user' ? 'bg-drs-purple/15 text-drs-purple' : 'bg-circuit-green/15 text-circuit-green'}`}
            >
              {msg.role === 'user' ? '◆' : '⬡'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-timing-dim whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>

              {/* Underlying SQL */}
              {msg.sql && (
                <details className="mt-2">
                  <summary className="text-[10px] text-timing-muted cursor-pointer hover:text-timing-dim">
                    View SQL
                  </summary>
                  <pre className="mt-1 p-2 bg-asphalt-deep rounded text-[10px] font-mono text-timing-dim overflow-x-auto">
                    {msg.sql}
                  </pre>
                </details>
              )}

              {/* Data Table */}
              {msg.data && msg.data.length > 0 && (
                <details className="mt-2" open>
                  <summary className="text-[10px] text-timing-muted cursor-pointer hover:text-timing-dim">
                    View raw results ({msg.data.length} rows)
                  </summary>
                  <div className="mt-1 overflow-x-auto max-h-[150px]">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          {Object.keys(msg.data[0]).map(k => (
                            <th key={k} className="text-left py-1 px-2 text-timing-muted font-semibold uppercase">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.slice(0, 10).map((row, ri) => (
                          <tr key={ri} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                            {Object.values(row).map((v: any, ci) => (
                              <td key={ci} className="py-1 px-2 font-mono text-timing-dim">
                                {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5 items-center text-xs text-timing-muted animate-pulse">
            <span className="w-7 h-7 rounded-full bg-circuit-green/15 text-circuit-green flex items-center justify-center">⬡</span>
            Analyzing data...
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-1.5 p-3 border-t border-white/[0.06] bg-asphalt">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-graphite border border-white/[0.08] rounded-lg
                     text-timing-white text-xs outline-none focus:border-circuit-green transition-colors"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-3 bg-circuit-green text-asphalt-deep rounded-lg text-xs font-bold
                     hover:bg-[#00d697] transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
