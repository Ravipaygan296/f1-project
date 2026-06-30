/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        asphalt: { DEFAULT: '#111419', deep: '#0A0C10' },
        graphite: { DEFAULT: '#161920', light: '#1E222A' },
        carbon: '#20242D',
        steel: '#333842',
        'timing-white': '#F3F4F6',
        'timing-dim': '#9BA1B0',
        'timing-muted': '#626B7D',
        'circuit-green': '#00F0B5',
        'circuit-cyan': '#00E5FF',
        'flag-amber': '#FF9900',
        'flag-red': '#FF3333',
        'drs-purple': '#B026FF',
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'monospace'],
        hud: ['Industry', 'Eurostile', 'Space Grotesk', 'sans-serif'],
      },
      boxShadow: {
        'hud': '0 4px 20px -2px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        'hud-hover': '0 8px 30px -4px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
        'glow-cyan': '0 0 15px rgba(0, 229, 255, 0.4)',
        'glow-green': '0 0 15px rgba(0, 240, 181, 0.4)',
      },
      backgroundImage: {
        'hud-gradient': 'linear-gradient(135deg, rgba(22, 25, 32, 0.95) 0%, rgba(10, 12, 16, 0.98) 100%)',
        'neon-teal': 'linear-gradient(135deg, #00E5FF 0%, #00F0B5 100%)',
      }
    },
  },
  plugins: [],
}
