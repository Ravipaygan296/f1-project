'use client'

interface TrackOutlineProps {
  circuitId: string
  className?: string
  width?: number
  height?: number
  strokeColor?: string
}

// Stylized track SVG outlines for key tracks (drawn in 100x100 box)
const TRACK_PATHS: Record<string, string> = {
  monaco: 'M 10 50 L 25 35 L 45 40 L 50 30 L 65 30 L 70 45 L 85 40 L 90 65 L 75 75 L 60 65 L 45 75 L 20 70 Z',
  silverstone: 'M 15 20 L 50 15 L 85 30 L 80 50 L 90 70 L 60 85 L 40 60 L 20 75 Z',
  monza: 'M 10 40 H 80 C 95 40, 95 60, 80 60 H 45 L 40 75 H 25 L 20 60 H 10 C 2 60, 2 40, 10 40 Z',
  spa: 'M 15 35 C 30 20, 50 10, 60 25 L 85 30 C 95 40, 80 60, 70 50 L 55 80 L 35 70 L 25 80 Z',
  albert_park: 'M 15 25 L 50 20 L 80 35 L 75 60 L 85 75 L 50 85 L 30 65 L 20 75 Z',
  suzuka: 'M 15 50 C 15 20, 45 20, 50 50 C 55 80, 85 80, 85 50 C 85 20, 55 20, 50 50 C 45 80, 15 80, 15 50 Z', // Figure-8
  hungaroring: 'M 20 20 H 80 V 40 L 65 55 H 80 V 75 H 20 V 50 L 35 35 Z',
};

export default function TrackOutline({
  circuitId,
  className = '',
  width = 120,
  height = 120,
  strokeColor = '#00C389', // circuit-green
}: TrackOutlineProps) {
  const path = TRACK_PATHS[circuitId?.toLowerCase()] || TRACK_PATHS.monaco

  return (
    <div className={`flex items-center justify-center p-2 bg-asphalt rounded-lg border border-white/[0.04] ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 100 100"
        fill="none"
        stroke={strokeColor}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="filter drop-shadow-[0_0_8px_rgba(0,195,137,0.35)]"
      >
        <path d={path} />
        {/* Start/Finish Line Dot */}
        <circle cx="20" cy="50" r="4" fill="#E8E9ED" stroke="#0D0F13" strokeWidth="1" />
      </svg>
    </div>
  )
}
