/* ============================================
   F1 TELEMETRY ROOM — Overview View
   ============================================ */

const OverviewView = {
    async load(season) {
        document.getElementById('overview-season').textContent = season;

        // Fetch all data in parallel
        const [schedule, driverStandings, constructorStandings, allResults] = await Promise.all([
            F1API.getSeasonSchedule(season),
            F1API.getDriverStandings(season),
            F1API.getConstructorStandings(season),
            F1API.getAllRaceResults(season),
        ]);

        this.renderLastRace(allResults);
        this.renderStats(allResults, driverStandings);
        this.renderDriverStandings(driverStandings);
        this.renderConstructorStandings(constructorStandings);
        this.renderRaceList(schedule, allResults);
    },

    renderLastRace(races) {
        const completedRaces = races.filter(r => r.Results && r.Results.length > 0);
        if (completedRaces.length === 0) {
            document.getElementById('last-race-name').textContent = 'No race data yet';
            return;
        }
        const lastRace = completedRaces[completedRaces.length - 1];
        document.getElementById('last-race-name').textContent = lastRace.raceName;
        document.getElementById('last-race-date').textContent =
            `Round ${lastRace.round} · ${F1Utils.formatDate(lastRace.date)} · ${lastRace.Circuit?.circuitName || ''}`;

        const podium = document.getElementById('podium-display');
        podium.innerHTML = '';
        const top3 = lastRace.Results.slice(0, 3);

        top3.forEach((result, i) => {
            const driver = result.Driver;
            const constructor = result.Constructor;
            const code = F1Config.getDriverCode(driver);
            const color = F1Config.getTeamColor(constructor?.constructorId);
            const place = document.createElement('div');
            place.className = `podium-place p${i + 1}`;

            const avatar = F1Utils.createAvatar(code, color, i === 0 ? 80 : 64);
            avatar.className = 'podium-avatar';
            if (i === 0) avatar.style.borderColor = '#FFD700';
            else if (i === 1) avatar.style.borderColor = '#C0C0C0';
            else avatar.style.borderColor = '#CD7F32';
            avatar.style.border = `3px solid ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32'}`;

            place.innerHTML = `
                <div class="podium-name">${driver.givenName} ${driver.familyName}</div>
                <div class="podium-team" style="color:${color}">${constructor?.name || ''}</div>
                <div class="podium-position">${F1Utils.ordinal(i + 1)}</div>
                <div class="podium-bar"></div>
            `;
            place.insertBefore(avatar, place.firstChild);
            podium.appendChild(place);
        });
    },

    renderStats(races, standings) {
        const completed = races.filter(r => r.Results && r.Results.length > 0);
        document.getElementById('stat-races-completed').textContent = completed.length;

        // Total laps
        let totalLaps = 0;
        completed.forEach(race => {
            race.Results.forEach(r => { totalLaps += parseInt(r.laps || 0); });
        });
        document.getElementById('stat-total-laps').textContent = F1Utils.formatNumber(totalLaps);

        // Different winners
        const winners = new Set();
        completed.forEach(race => {
            if (race.Results[0]) winners.add(race.Results[0].Driver.driverId);
        });
        document.getElementById('stat-different-winners').textContent = winners.size;

        // Closest finish
        let closestGap = Infinity;
        completed.forEach(race => {
            if (race.Results.length >= 2) {
                const t = race.Results[1]?.Time?.time;
                if (t) {
                    const secs = F1Utils.lapTimeToSeconds(t.replace('+', ''));
                    if (secs && secs < closestGap) closestGap = secs;
                }
            }
        });
        document.getElementById('stat-closest-finish').textContent =
            closestGap < Infinity ? closestGap.toFixed(3) : '—';
    },

    renderDriverStandings(standings) {
        const container = document.getElementById('driver-standings-bars');
        container.innerHTML = '';
        container.className = 'standings-bars stagger-in';
        if (!standings || standings.length === 0) { container.innerHTML = '<p class="text-muted">No standings data available</p>'; return; }
        const maxPts = parseFloat(standings[0]?.points || 1);

        standings.slice(0, 10).forEach((s, i) => {
            const driver = s.Driver;
            const constructor = s.Constructors?.[0];
            const code = F1Config.getDriverCode(driver);
            const color = F1Config.getTeamColor(constructor?.constructorId);
            const pts = parseFloat(s.points);
            const pct = (pts / maxPts * 100).toFixed(1);

            const row = document.createElement('div');
            row.className = 'standing-row';
            row.innerHTML = `
                <span class="standing-pos">${s.position}</span>
                <div class="standing-info">
                    <div class="standing-name">${driver.givenName} ${driver.familyName}</div>
                    <div class="standing-team-name" style="color:${color}">${constructor?.name || ''}</div>
                </div>
                <div class="standing-bar-container">
                    <div class="standing-bar" style="width:${pct}%;background:${color};">
                        <span class="standing-points">${pts}</span>
                    </div>
                </div>
            `;
            const avatar = F1Utils.createAvatar(code, color, 32);
            avatar.className = 'standing-avatar';
            row.insertBefore(avatar, row.children[1]);
            container.appendChild(row);
        });
    },

    renderConstructorStandings(standings) {
        const container = document.getElementById('constructor-standings-bars');
        container.innerHTML = '';
        container.className = 'standings-bars stagger-in';
        if (!standings || standings.length === 0) { container.innerHTML = '<p class="text-muted">No standings data available</p>'; return; }
        const maxPts = parseFloat(standings[0]?.points || 1);

        standings.forEach((s) => {
            const constructor = s.Constructor;
            const color = F1Config.getTeamColor(constructor?.constructorId);
            const pts = parseFloat(s.points);
            const pct = (pts / maxPts * 100).toFixed(1);

            const row = document.createElement('div');
            row.className = 'standing-row';

            const avatar = F1Utils.createAvatar(constructor?.name?.substring(0, 3)?.toUpperCase() || '???', color, 32);

            row.innerHTML = `
                <span class="standing-pos">${s.position}</span>
                <div class="standing-info">
                    <div class="standing-name">${constructor?.name || ''}</div>
                </div>
                <div class="standing-bar-container">
                    <div class="standing-bar" style="width:${pct}%;background:${color};">
                        <span class="standing-points">${pts}</span>
                    </div>
                </div>
            `;
            row.insertBefore(avatar, row.children[1]);
            container.appendChild(row);
        });
    },

    renderRaceList(schedule, allResults) {
        const container = document.getElementById('race-list');
        container.innerHTML = '';

        const resultsByRound = {};
        allResults.forEach(r => {
            if (r.Results && r.Results.length > 0) resultsByRound[r.round] = r;
        });

        schedule.forEach(race => {
            const result = resultsByRound[race.round];
            const item = document.createElement('div');
            item.className = 'race-item';

            let winnerHTML = '';
            if (result && result.Results[0]) {
                const w = result.Results[0];
                const code = F1Config.getDriverCode(w.Driver);
                const color = F1Config.getTeamColor(w.Constructor?.constructorId);
                winnerHTML = `
                    <div class="race-winner">
                        <div class="race-winner-avatar" style="background:${color};color:#0D0F13;">${code}</div>
                        <span class="race-winner-name">${w.Driver.familyName}</span>
                    </div>
                `;
            } else {
                winnerHTML = `<span class="race-winner-name text-muted">Upcoming</span>`;
            }

            item.innerHTML = `
                <span class="race-round">R${race.round}</span>
                <div class="race-info">
                    <div class="race-name">${race.raceName}</div>
                    <div class="race-date">${F1Utils.formatDate(race.date)}</div>
                </div>
                ${winnerHTML}
            `;
            container.appendChild(item);
        });
    },
};
