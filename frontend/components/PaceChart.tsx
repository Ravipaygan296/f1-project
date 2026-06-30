'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface PaceChartProps {
  data: any[]
  drivers: { id: string; code: string; color: string }[]
}

export default function PaceChart({ data, drivers }: PaceChartProps) {
  // Format seconds into MM:SS.mmm format for display
  function formatLapTime(seconds: number) {
    if (!seconds) return '—'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 1000)
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  // Pre-process data by grouping by lap_number and pivoting driver lap times
  const lapsMap: Record<number, any> = {}
  data.forEach(row => {
    const lapNum = row.lap_number
    if (!lapsMap[lapNum]) {
      lapsMap[lapNum] = { lap_number: lapNum }
    }
    const drv = drivers.find(d => d.id === row.driver_id)
    if (drv) {
      lapsMap[lapNum][drv.code] = parseFloat(row.lap_time_seconds)
    }
  })

  const processedData = Object.values(lapsMap).sort((a, b) => a.lap_number - b.lap_number)

  // Determine min/max for Y axis bounds to focus on the racing pace
  const allTimes = processedData.flatMap(d =>
    drivers.map(drv => d[drv.code]).filter((t): t is number => typeof t === 'number' && t > 0)
  )
  const minTime = allTimes.length > 0 ? Math.min(...allTimes) - 0.5 : 0
  const maxTime = allTimes.length > 0 ? Math.max(...allTimes) + 0.5 : 100

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={processedData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2E37" vertical={false} />
          <XAxis
            dataKey="lap_number"
            stroke="#9BA1B0"
            fontSize={11}
            tickLine={false}
            label={{ value: 'Lap Number', position: 'insideBottom', offset: -5, fill: '#9BA1B0', fontSize: 11 }}
          />
          <YAxis
            stroke="#9BA1B0"
            fontSize={11}
            tickLine={false}
            domain={[minTime, maxTime]}
            tickFormatter={(tick) => `${Math.floor(tick / 60)}:${Math.floor(tick % 60).toString().padStart(2, '0')}`}
            label={{ value: 'Lap Time', angle: -90, position: 'insideLeft', fill: '#9BA1B0', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2228', borderColor: '#3A3F4B', borderRadius: 8 }}
            labelStyle={{ color: '#E8E9ED', fontFamily: 'monospace', fontWeight: 'bold' }}
            itemStyle={{ color: '#9BA1B0', fontSize: 12 }}
            formatter={(value: any, name: any) => [formatLapTime(value), name]}
            labelFormatter={(label) => `Lap ${label}`}
          />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingBottom: 15 }}
          />
          {drivers.map(drv => (
            <Line
              key={drv.code}
              type="monotone"
              dataKey={drv.code}
              name={drv.code}
              stroke={drv.color}
              strokeWidth={2}
              dot={{ r: 2, strokeWidth: 1 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
