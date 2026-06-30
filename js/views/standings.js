/* ============================================
   F1 TELEMETRY ROOM — Standings View
   ============================================ */

const StandingsView = {
    async load(season) {
        const [driverStandings, constructorStandings, allResults] = await Promise.all([
            F1API.getDriverStandings(season),
            F1API.getConstructorStandings(season),
            F1API.getAllRaceResults(season),
        ]);

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        this.renderDriverTable(driverStandings, allResults);
        this.renderConstructorTable(constructorStandings, allResults);
    },

    renderDriverTable(standings, allResults) {
        const tbody = document.getElementById('drivers-standings-body');
        tbody.innerHTML = '';
        if (!standings || standings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-muted">No data</td></tr>';
            return;
        }

        const leaderPts = parseFloat(standings[0]?.points || 0);

        // Count wins and podiums per driver
        const winsMap = {}, podiumsMap = {};
        allResults.forEach(race => {
            if (!race.Results) return;
            race.Results.forEach(r => {
                const id = r.Driver.driverId;
                const pos = parseInt(r.position);
                if (pos === 1) winsMap[id] = (winsMap[id] || 0) + 1;
                if (pos <= 3) podiumsMap[id] = (podiumsMap[id] || 0) + 1;
            });
        });

        standings.forEach(s => {
            const driver = s.Driver;
            const constructor = s.Constructors?.[0];
            const color = F1Config.getTeamColor(constructor?.constructorId);
            const code = F1Config.getDriverCode(driver);
            const pts = parseFloat(s.points);
            const gap = pts - leaderPts;
            const wins = winsMap[driver.driverId] || 0;
            const podiums = podiumsMap[driver.driverId] || 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mono-cell" style="font-weight:700;">${s.position}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9px;font-weight:700;color:#0D0F13;flex-shrink:0;">${code}</div>
                        <span style="font-weight:600;color:var(--timing-white);">${driver.givenName} ${driver.familyName}</span>
                    </div>
                </td>
                <td style="color:${color}">${constructor?.name || ''}</td>
                <td class="mono-cell" style="font-weight:700;color:var(--circuit-green);">${pts}</td>
                <td class="mono-cell">${wins}</td>
                <td class="mono-cell">${podiums}</td>
                <td class="mono-cell" style="color:${gap === 0 ? 'var(--circuit-green)' : 'var(--timing-muted)'};">${gap === 0 ? 'Leader' : gap.toFixed(0)}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderConstructorTable(standings, allResults) {
        const tbody = document.getElementById('constructors-standings-body');
        tbody.innerHTML = '';
        if (!standings || standings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No data</td></tr>';
            return;
        }

        const leaderPts = parseFloat(standings[0]?.points || 0);

        // Count wins per constructor
        const winsMap = {};
        allResults.forEach(race => {
            if (!race.Results?.[0]) return;
            const cid = race.Results[0].Constructor?.constructorId;
            if (cid) winsMap[cid] = (winsMap[cid] || 0) + 1;
        });

        standings.forEach(s => {
            const constructor = s.Constructor;
            const color = F1Config.getTeamColor(constructor?.constructorId);
            const pts = parseFloat(s.points);
            const gap = pts - leaderPts;
            const wins = winsMap[constructor?.constructorId] || 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mono-cell" style="font-weight:700;">${s.position}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9px;font-weight:700;color:#0D0F13;flex-shrink:0;">${constructor?.name?.substring(0, 3)?.toUpperCase()}</div>
                        <span style="font-weight:600;color:${color};">${constructor?.name || ''}</span>
                    </div>
                </td>
                <td class="mono-cell" style="font-weight:700;color:var(--circuit-green);">${pts}</td>
                <td class="mono-cell">${wins}</td>
                <td class="mono-cell" style="color:${gap === 0 ? 'var(--circuit-green)' : 'var(--timing-muted)'};">${gap === 0 ? 'Leader' : gap.toFixed(0)}</td>
            `;
            tbody.appendChild(tr);
        });
    },
};
