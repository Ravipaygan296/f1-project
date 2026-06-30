/* ============================================
   F1 TELEMETRY ROOM — Configuration
   Team colors, driver mappings, constants
   ============================================ */

const F1Config = {
    // API base URLs
    JOLPICA_BASE: 'https://api.jolpi.ca/ergast/f1',
    OPENF1_BASE: 'https://api.openf1.org/v1',

    // Current season
    currentSeason: 2025,

    // F1 Team Colors (2024-2025 season)
    teamColors: {
        'red_bull':       '#3671C6',
        'ferrari':        '#E80020',
        'mclaren':        '#FF8700',
        'mercedes':       '#27F4D2',
        'aston_martin':   '#229971',
        'alpine':         '#FF87BC',
        'williams':       '#64C4FF',
        'rb':             '#6692FF',
        'haas':           '#B6BABD',
        'sauber':         '#52E252',
        'kick_sauber':    '#52E252',
        'alphatauri':     '#6692FF',
        'alfa':           '#C92D4B',
        'racing_point':   '#F596C8',
        'renault':        '#FFF500',
        'toro_rosso':     '#4689C8',
        'force_india':    '#F596C8',
    },

    // Constructor name normalization
    constructorMap: {
        'Red Bull': 'red_bull',
        'red_bull': 'red_bull',
        'Ferrari': 'ferrari',
        'ferrari': 'ferrari',
        'McLaren': 'mclaren',
        'mclaren': 'mclaren',
        'Mercedes': 'mercedes',
        'mercedes': 'mercedes',
        'Aston Martin': 'aston_martin',
        'aston_martin': 'aston_martin',
        'Alpine F1 Team': 'alpine',
        'Alpine': 'alpine',
        'alpine': 'alpine',
        'Williams': 'williams',
        'williams': 'williams',
        'RB F1 Team': 'rb',
        'AlphaTauri': 'alphatauri',
        'rb': 'rb',
        'Haas F1 Team': 'haas',
        'Haas': 'haas',
        'haas': 'haas',
        'Kick Sauber': 'sauber',
        'Sauber': 'sauber',
        'sauber': 'sauber',
        'Alfa Romeo': 'alfa',
        'Racing Point': 'racing_point',
        'Renault': 'renault',
        'Toro Rosso': 'toro_rosso',
        'Force India': 'force_india',
    },

    // Tyre compound colors
    tyreColors: {
        'SOFT': '#EF4444',
        'MEDIUM': '#F59E0B',
        'HARD': '#F1F5F9',
        'INTERMEDIATE': '#22C55E',
        'WET': '#3B82F6',
        'S': '#EF4444',
        'M': '#F59E0B',
        'H': '#F1F5F9',
        'I': '#22C55E',
        'W': '#3B82F6',
    },

    // Points system
    pointsSystem: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],

    getTeamColor(constructorName) {
        if (!constructorName) return '#6B7280';
        const key = this.constructorMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '_');
        return this.teamColors[key] || '#6B7280';
    },

    getDriverCode(driver) {
        if (!driver) return '???';
        if (driver.code) return driver.code;
        const last = driver.familyName || driver.last_name || '';
        return last.substring(0, 3).toUpperCase();
    },

    getTyreColor(compound) {
        if (!compound) return '#6B7280';
        return this.tyreColors[compound.toUpperCase()] || '#6B7280';
    }
};
