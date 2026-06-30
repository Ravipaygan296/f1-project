export default function F1CarTopDown({ color, className = '' }: { color: string, className?: string }) {
  const gradId = color.replace('#', '')

  return (
    <svg viewBox="0 0 100 240" className={`overflow-visible ${className}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Metallic Base Gradient for the Chassis */}
        <linearGradient id={`chassis-${gradId}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="15%" stopColor={color} stopOpacity="0.8" />
          <stop offset="35%" stopColor={color} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="65%" stopColor={color} />
          <stop offset="85%" stopColor={color} stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>

        {/* Dark Carbon Fiber Gradient */}
        <linearGradient id="carbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#111" />
          <stop offset="50%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#111" />
        </linearGradient>

        {/* Tyre Gradient (Rounded edges simulation) */}
        <linearGradient id="tyre" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#050505" />
          <stop offset="20%" stopColor="#1a1a1a" />
          <stop offset="50%" stopColor="#222" />
          <stop offset="80%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>

        {/* Nose Cone Gradient */}
        <linearGradient id={`nose-${gradId}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>

      {/* --- CAR BODY --- */}
      
      {/* Front Wing Base (Carbon) */}
      <path d="M 10 15 C 30 5, 70 5, 90 15 L 88 25 L 12 25 Z" fill="url(#carbon)" />
      {/* Front Wing Accents */}
      <rect x="15" y="12" width="70" height="4" rx="2" fill={`url(#chassis-${gradId})`} />
      <rect x="12" y="18" width="76" height="3" rx="1" fill={`url(#chassis-${gradId})`} />
      <path d="M 10 10 L 14 30 L 8 30 Z" fill={color} />
      <path d="M 90 10 L 86 30 L 92 30 Z" fill={color} />

      {/* Front Suspension Arms */}
      <path d="M 45 40 L 10 52 M 55 40 L 90 52" stroke="#222" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 42 45 L 10 65 M 58 45 L 90 65" stroke="#111" strokeWidth="1.5" strokeLinecap="round" />

      {/* Front Wheels (Slicks) */}
      <rect x="2" y="42" width="15" height="42" rx="4" fill="url(#tyre)" />
      <rect x="83" y="42" width="15" height="42" rx="4" fill="url(#tyre)" />
      {/* Front Wheel Hubs */}
      <ellipse cx="9.5" cy="63" rx="3" ry="8" fill="#111" />
      <ellipse cx="90.5" cy="63" rx="3" ry="8" fill="#111" />

      {/* Floor / Undertray (Carbon Base) */}
      <path d="M 35 80 L 25 120 L 25 170 L 75 170 L 75 120 L 65 80 Z" fill="url(#carbon)" />

      {/* Main Chassis / Sidepods (3D Metallic) */}
      <path d="M 42 20 L 58 20 L 60 70 C 85 90, 80 150, 68 175 L 32 175 C 20 150, 15 90, 40 70 Z" fill={`url(#chassis-${gradId})`} />

      {/* Sidepod Air Intakes */}
      <ellipse cx="28" cy="95" rx="4" ry="10" fill="#000" transform="rotate(-15 28 95)" />
      <ellipse cx="72" cy="95" rx="4" ry="10" fill="#000" transform="rotate(15 72 95)" />

      {/* Nose Cone (Raised 3D look) */}
      <path d="M 46 15 L 54 15 L 56 60 L 44 60 Z" fill={`url(#nose-${gradId})`} />
      {/* Nose Camera Pods */}
      <rect x="42" y="35" width="16" height="1.5" fill="#111" />

      {/* Cockpit Hole */}
      <ellipse cx="50" cy="115" rx="10" ry="15" fill="#050505" />
      {/* Driver Helmet (White with colored top) */}
      <circle cx="50" cy="112" r="5" fill="#fff" />
      <circle cx="50" cy="112" r="3" fill={color} />
      {/* Steering Wheel Area */}
      <rect x="46" y="103" width="8" height="2" fill="#333" rx="1" />

      {/* HALO (Titanium look) */}
      <path d="M 40 115 C 40 100, 60 100, 60 115" fill="none" stroke="#222" strokeWidth="2.5" />
      <path d="M 49 100 L 49 90 M 51 100 L 51 90" stroke="#222" strokeWidth="1" />
      <path d="M 37 115 L 43 125 L 57 125 L 63 115" fill="none" stroke="#222" strokeWidth="2.5" />

      {/* Engine Cover & Shark Fin (Metallic) */}
      <path d="M 44 130 L 56 130 L 52 195 L 48 195 Z" fill={`url(#nose-${gradId})`} />
      {/* Airbox */}
      <ellipse cx="50" cy="132" rx="4" ry="6" fill="#000" />
      <path d="M 47 130 L 53 130 L 52 145 L 48 145 Z" fill="#222" />

      {/* Rear Suspension Arms */}
      <path d="M 45 175 L 12 182 M 55 175 L 88 182" stroke="#222" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 46 182 L 15 190 M 54 182 L 85 190" stroke="#111" strokeWidth="1.5" strokeLinecap="round" />

      {/* Rear Wheels (Slicks) */}
      <rect x="0" y="160" width="18" height="46" rx="4" fill="url(#tyre)" />
      <rect x="82" y="160" width="18" height="46" rx="4" fill="url(#tyre)" />

      {/* Exhaust & Rear Diffuser */}
      <rect x="35" y="195" width="30" height="20" fill="url(#carbon)" />
      {/* Exhaust Pipe */}
      <ellipse cx="50" cy="198" rx="4" ry="3" fill="#111" stroke="#444" strokeWidth="1" />
      {/* Diffuser Strakes */}
      <line x1="40" y1="195" x2="40" y2="215" stroke="#111" strokeWidth="2" />
      <line x1="45" y1="195" x2="45" y2="215" stroke="#111" strokeWidth="2" />
      <line x1="55" y1="195" x2="55" y2="215" stroke="#111" strokeWidth="2" />
      <line x1="60" y1="195" x2="60" y2="215" stroke="#111" strokeWidth="2" />

      {/* Rear Wing Base (Carbon) */}
      <rect x="20" y="212" width="60" height="15" rx="1" fill="url(#carbon)" />
      {/* Rear Wing Upper Flap (Metallic Colored) */}
      <rect x="22" y="210" width="56" height="8" rx="2" fill={`url(#chassis-${gradId})`} />
      <rect x="25" y="214" width="50" height="4" fill="#111" />
      
      {/* Rear Wing Endplates */}
      <rect x="18" y="200" width="4" height="25" fill={color} />
      <rect x="78" y="200" width="4" height="25" fill={color} />

      {/* Dynamic Reflections (Gloss layer overlay) */}
      <path d="M 38 75 C 25 95, 25 150, 32 170 C 35 120, 45 85, 38 75 Z" fill="rgba(255,255,255,0.05)" />
      <path d="M 62 75 C 75 95, 75 150, 68 170 C 65 120, 55 85, 62 75 Z" fill="rgba(255,255,255,0.05)" />
    </svg>
  )
}
