/**
 * Tyre Icon — FIA compound color dot
 */

import { TYRE_COLORS } from '@/lib/api'

interface TyreIconProps {
  compound: string
  size?: number
  showLabel?: boolean
}

export default function TyreIcon({ compound, size = 14, showLabel = false }: TyreIconProps) {
  const color = TYRE_COLORS[compound?.toUpperCase()] || '#6B7280'
  const needsBorder = compound?.toUpperCase() === 'HARD'

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="rounded-full inline-block shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          border: needsBorder ? '1px solid #6B7280' : 'none',
        }}
      />
      {showLabel && (
        <span className="text-xs text-timing-dim capitalize">
          {compound?.toLowerCase()}
        </span>
      )}
    </span>
  )
}
