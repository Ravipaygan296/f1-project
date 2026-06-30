/**
 * Driver Avatar — initials on team color background
 * No photos needed: real F1 timing towers use this exact system.
 */

interface DriverAvatarProps {
  code: string
  teamColor: string
  size?: number
  className?: string
}

export default function DriverAvatar({ code, teamColor, size = 32, className = '' }: DriverAvatarProps) {
  const fontSize = Math.max(9, size * 0.28)

  return (
    <div
      className={`rounded-full flex items-center justify-center font-mono font-bold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: teamColor,
        fontSize,
        color: '#0D0F13',
      }}
    >
      {code || '???'}
    </div>
  )
}
