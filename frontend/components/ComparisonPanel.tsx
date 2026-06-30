'use client'

interface ComparisonItem {
  label: string
  valA: string | number
  valB: string | number
  colorA: string
  colorB: string
  better?: 'higher' | 'lower' | 'none'
}

interface ComparisonPanelProps {
  title: string
  items: ComparisonItem[]
}

export default function ComparisonPanel({ title, items }: ComparisonPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title text-sm font-semibold tracking-wider text-timing-white uppercase">
          {title}
        </h3>
      </div>
      <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, index) => {
          const numA = typeof item.valA === 'number' ? item.valA : parseFloat(String(item.valA))
          const numB = typeof item.valB === 'number' ? item.valB : parseFloat(String(item.valB))
          const isNum = !isNaN(numA) && !isNaN(numB)

          let isABetter = false
          let isBBetter = false

          if (isNum && item.better && item.better !== 'none') {
            if (item.better === 'higher') {
              isABetter = numA > numB
              isBBetter = numB > numA
            } else if (item.better === 'lower') {
              isABetter = numA < numB
              isBBetter = numB < numA
            }
          }

          return (
            <div
              key={index}
              className="bg-asphalt border border-white/[0.04] p-4 rounded-lg flex items-center justify-between"
            >
              {/* Value A */}
              <div className="text-left">
                <div
                  className={`font-mono text-2xl font-bold transition-all ${
                    isABetter ? 'scale-105' : 'opacity-70'
                  }`}
                  style={{ color: item.colorA }}
                >
                  {item.valA}
                </div>
                {isABetter && <span className="text-[9px] font-mono text-circuit-green">▲ ADVANTAGE</span>}
              </div>

              {/* Label */}
              <div className="text-center flex-1 px-4">
                <div className="text-[11px] font-semibold text-timing-muted uppercase tracking-wider">
                  {item.label}
                </div>
              </div>

              {/* Value B */}
              <div className="text-right">
                <div
                  className={`font-mono text-2xl font-bold transition-all ${
                    isBBetter ? 'scale-105' : 'opacity-70'
                  }`}
                  style={{ color: item.colorB }}
                >
                  {item.valB}
                </div>
                {isBBetter && <span className="text-[9px] font-mono text-circuit-green">▲ ADVANTAGE</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
