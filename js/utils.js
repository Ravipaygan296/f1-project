/* ============================================
   F1 TELEMETRY ROOM — Utilities
   ============================================ */

const F1Utils = {
    // Create a driver avatar element
    createAvatar(code, teamColor, size = 32) {
        const el = document.createElement('div');
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:${Math.max(9, size * 0.28)}px;font-weight:700;color:#0D0F13;background:${teamColor};flex-shrink:0;`;
        el.textContent = code || '???';
        return el;
    },

    // Format lap time string (e.g. "1:23.456") to seconds
    lapTimeToSeconds(timeStr) {
        if (!timeStr) return null;
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(timeStr);
    },

    // Seconds to lap time format
    secondsToLapTime(secs) {
        if (secs == null || isNaN(secs)) return '—';
        const mins = Math.floor(secs / 60);
        const s = (secs % 60).toFixed(3);
        return mins > 0 ? `${mins}:${s.padStart(6, '0')}` : s;
    },

    // Format number with commas
    formatNumber(n) {
        if (n == null) return '—';
        return n.toLocaleString();
    },

    // Get ordinal suffix
    ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },

    // Date formatting
    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    // Darken a hex color
    darken(hex, amount = 0.3) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, Math.round(((num >> 16) & 0xFF) * (1 - amount)));
        const g = Math.max(0, Math.round(((num >> 8) & 0xFF) * (1 - amount)));
        const b = Math.max(0, Math.round((num & 0xFF) * (1 - amount)));
        return `rgb(${r},${g},${b})`;
    },

    // Transparent version of color
    withAlpha(hex, alpha) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = (num >> 16) & 0xFF;
        const g = (num >> 8) & 0xFF;
        const b = num & 0xFF;
        return `rgba(${r},${g},${b},${alpha})`;
    },

    // Debounce
    debounce(fn, ms = 300) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },

    // Simple stat calculations
    mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    stddev(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = this.mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
    },

    median(arr) {
        if (!arr || arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },
};
