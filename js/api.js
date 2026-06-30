/* ============================================
   F1 TELEMETRY ROOM — API Layer
   Jolpica (historical) + OpenF1 (telemetry)
   ============================================ */

const F1API = {
    cache: new Map(),

    async fetch(url, cacheKey) {
        if (cacheKey && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (cacheKey) this.cache.set(cacheKey, data);
            return data;
        } catch (err) {
            console.error(`API Error [${url}]:`, err);
            return null;
        }
    },

    // ========== JOLPICA (Historical) ==========

    async getSeasonSchedule(year) {
        const url = `${F1Config.JOLPICA_BASE}/${year}.json?limit=30`;
        const data = await this.fetch(url, `schedule_${year}`);
        return data?.MRData?.RaceTable?.Races || [];
    },

    async getRaceResults(year, round) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/${round}/results.json`;
        const data = await this.fetch(url, `results_${year}_${round}`);
        return data?.MRData?.RaceTable?.Races?.[0] || null;
    },

    async getQualifyingResults(year, round) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/${round}/qualifying.json`;
        const data = await this.fetch(url, `quali_${year}_${round}`);
        return data?.MRData?.RaceTable?.Races?.[0] || null;
    },

    async getDriverStandings(year) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/driverStandings.json`;
        const data = await this.fetch(url, `driverStandings_${year}`);
        return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
    },

    async getConstructorStandings(year) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/constructorStandings.json`;
        const data = await this.fetch(url, `constructorStandings_${year}`);
        return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
    },

    async getAllRaceResults(year) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/results.json?limit=500`;
        const data = await this.fetch(url, `allResults_${year}`);
        return data?.MRData?.RaceTable?.Races || [];
    },

    async getPitStops(year, round) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/${round}/pitstops.json?limit=100`;
        const data = await this.fetch(url, `pitstops_${year}_${round}`);
        return data?.MRData?.RaceTable?.Races?.[0]?.PitStops || [];
    },

    async getLapTimes(year, round) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/${round}/laps.json?limit=2000`;
        const data = await this.fetch(url, `laps_${year}_${round}`);
        return data?.MRData?.RaceTable?.Races?.[0]?.Laps || [];
    },

    async getDriverSeasonResults(year, driverId) {
        const url = `${F1Config.JOLPICA_BASE}/${year}/drivers/${driverId}/results.json?limit=30`;
        const data = await this.fetch(url, `driverResults_${year}_${driverId}`);
        return data?.MRData?.RaceTable?.Races || [];
    },

    async getCircuitResults(circuitId, limit = 10) {
        const url = `${F1Config.JOLPICA_BASE}/circuits/${circuitId}/results/1.json?limit=${limit}`;
        const data = await this.fetch(url, `circuitWinners_${circuitId}`);
        return data?.MRData?.RaceTable?.Races || [];
    },

    // ========== OPENF1 (Telemetry / Live) ==========

    async getOpenF1Sessions(year) {
        const url = `${F1Config.OPENF1_BASE}/sessions?year=${year}`;
        return await this.fetch(url, `of1_sessions_${year}`);
    },

    async getOpenF1Drivers(sessionKey) {
        const url = `${F1Config.OPENF1_BASE}/drivers?session_key=${sessionKey}`;
        return await this.fetch(url, `of1_drivers_${sessionKey}`);
    },

    async getOpenF1Laps(sessionKey, driverNumber) {
        let url = `${F1Config.OPENF1_BASE}/laps?session_key=${sessionKey}`;
        if (driverNumber) url += `&driver_number=${driverNumber}`;
        return await this.fetch(url, `of1_laps_${sessionKey}_${driverNumber || 'all'}`);
    },

    async getOpenF1Stints(sessionKey) {
        const url = `${F1Config.OPENF1_BASE}/stints?session_key=${sessionKey}`;
        return await this.fetch(url, `of1_stints_${sessionKey}`);
    },

    async getOpenF1PitStops(sessionKey) {
        const url = `${F1Config.OPENF1_BASE}/pit?session_key=${sessionKey}`;
        return await this.fetch(url, `of1_pit_${sessionKey}`);
    },

    async getOpenF1Position(sessionKey) {
        const url = `${F1Config.OPENF1_BASE}/position?session_key=${sessionKey}`;
        return await this.fetch(url, `of1_position_${sessionKey}`);
    },

    async getOpenF1Weather(sessionKey) {
        const url = `${F1Config.OPENF1_BASE}/weather?session_key=${sessionKey}`;
        return await this.fetch(url, `of1_weather_${sessionKey}`);
    },

    async getOpenF1Intervals(sessionKey) {
        const url = `${F1Config.OPENF1_BASE}/intervals?session_key=${sessionKey}`;
        return await this.fetch(url, `of1_intervals_${sessionKey}`);
    },
};
