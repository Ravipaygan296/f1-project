/* ============================================
   F1 TELEMETRY ROOM — Track Analysis View
   ============================================ */

const TrackAnalysisView = {
    circuits: [],
    allResults: [],

    async init(season) {
        const schedule = await F1API.getSeasonSchedule(season);
        this.allResults = await F1API.getAllRaceResults(season);

        this.circuits = schedule.map(r => ({
            id: r.Circuit.circuitId,
            name: r.Circuit.circuitName,
            locality: r.Circuit.Location?.locality || '',
            country: r.Circuit.Location?.country || '',
            raceName: r.raceName,
            round: r.round,
        }));

        this.populateDropdown();
    },

    populateDropdown() {
        const sel = document.getElementById('track-select');
        sel.innerHTML = '<option value="">Select a circuit...</option>';
        // Deduplicate circuits
        const seen = new Set();
        this.circuits.forEach(c => {
            if (seen.has(c.id)) return;
            seen.add(c.id);
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} — ${c.country}`;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => this.loadTrack(sel.value));
    },

    async loadTrack(circuitId) {
        const resultsDiv = document.getElementById('track-results');
        if (!circuitId) { resultsDiv.style.display = 'none'; return; }
        resultsDiv.style.display = 'block';

        const circuit = this.circuits.find(c => c.id === circuitId);
        document.getElementById('track-name').textContent = circuit?.name || circuitId;
        document.getElementById('track-info').textContent =
            `${circuit?.locality || ''}, ${circuit?.country || ''}`;

        // Get historical winners at this circuit
        const histResults = await F1API.getCircuitResults(circuitId, 15);

        this.renderTrackStats(histResults, circuit);
        this.renderHistoricalWinners(histResults);
        this.renderTeamDominance(histResults);
    },

    renderTrackStats(results, circuit) {
        const grid = document.getElementById('track-stats-grid');
        grid.innerHTML = '';

        const totalRaces = results.length;
        const winners = new Set();
        const teams = new Set();
        results.forEach(r => {
            if (r.Results?.[0]) {
                winners.add(r.Results[0].Driver.driverId);
                teams.add(r.Results[0].Constructor?.constructorId);
            }
        });

        const stats = [
            { value: totalRaces, label: 'Races in Dataset' },
            { value: winners.size, label: 'Different Winners' },
            { value: teams.size, label: 'Winning Teams' },
        ];

        stats.forEach(s => {
            const el = document.createElement('div');
            el.className = 'track-stat';
            el.innerHTML = `
                <span class="track-stat-value">${s.value}</span>
                <span class="track-stat-label">${s.label}</span>
            `;
            grid.appendChild(el);
        });
    },

    renderHistoricalWinners(results) {
        const container = document.getElementById('historical-winners');
        container.innerHTML = '';

        if (!results || results.length === 0) {
            container.innerHTML = '<p class="text-muted">No historical data available</p>';
            return;
        }

        // Show most recent first
        [...results].reverse().forEach(race => {
            if (!race.Results?.[0]) return;
            const winner = race.Results[0];
            const color = F1Config.getTeamColor(winner.Constructor?.constructorId);
            const code = F1Config.getDriverCode(winner.Driver);

            const row = document.createElement('div');
            row.className = 'winner-row';
            row.innerHTML = `
                <span class="winner-year">${race.season}</span>
                <div style="display:flex;align-items:center;gap:8px;flex:1;">
                    <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9px;font-weight:700;color:#0D0F13;">${code}</div>
                    <div class="winner-info">
                        <div class="winner-name">${winner.Driver.givenName} ${winner.Driver.familyName}</div>
                        <div class="winner-team" style="color:${color}">${winner.Constructor?.name || ''}</div>
                    </div>
                </div>
            `;
            container.appendChild(row);
        });
    },

    renderTeamDominance(results) {
        const teamWins = {};
        results.forEach(r => {
            if (!r.Results?.[0]) return;
            const team = r.Results[0].Constructor;
            if (!team) return;
            if (!teamWins[team.constructorId]) teamWins[team.constructorId] = { name: team.name, count: 0 };
            teamWins[team.constructorId].count++;
        });

        const sorted = Object.entries(teamWins).sort((a, b) => b[1].count - a[1].count);
        const labels = sorted.map(([, v]) => v.name);
        const data = sorted.map(([, v]) => v.count);
        const colors = sorted.map(([k]) => F1Config.getTeamColor(k));

        F1Charts.createBarChart('track-team-chart', labels, [{
            label: 'Wins',
            data: data,
            backgroundColor: colors.map(c => F1Utils.withAlpha(c, 0.7)),
            borderColor: colors,
            borderWidth: 1,
        }]);
    },
};
