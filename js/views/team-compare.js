/* ============================================
   F1 TELEMETRY ROOM — Team Compare View
   ============================================ */

const TeamCompareView = {
    teams: [],
    allResults: [],

    async init(season) {
        const standings = await F1API.getConstructorStandings(season);
        this.allResults = await F1API.getAllRaceResults(season);
        this.teams = standings.map(s => ({
            id: s.Constructor.constructorId,
            name: s.Constructor.name,
            points: parseFloat(s.points),
        }));
        this.populateDropdowns();
    },

    populateDropdowns() {
        const selA = document.getElementById('team-a-select');
        const selB = document.getElementById('team-b-select');
        [selA, selB].forEach(sel => {
            sel.innerHTML = '<option value="">Select team...</option>';
            this.teams.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                sel.appendChild(opt);
            });
        });
        selA.addEventListener('change', () => this.compare());
        selB.addEventListener('change', () => this.compare());
    },

    compare() {
        const idA = document.getElementById('team-a-select').value;
        const idB = document.getElementById('team-b-select').value;
        const resultsDiv = document.getElementById('team-compare-results');
        if (!idA || !idB) { resultsDiv.style.display = 'none'; return; }
        resultsDiv.style.display = 'block';

        const tA = this.teams.find(t => t.id === idA);
        const tB = this.teams.find(t => t.id === idB);
        const colorA = F1Config.getTeamColor(idA);
        const colorB = F1Config.getTeamColor(idB);

        const labels = [];
        const cumA = [], cumB = [];
        let runA = 0, runB = 0;
        let winsA = 0, winsB = 0;
        let podiumsA = 0, podiumsB = 0;
        let ptsA = 0, ptsB = 0;

        this.allResults.forEach(race => {
            if (!race.Results || race.Results.length === 0) return;
            labels.push(race.raceName.replace(' Grand Prix', ''));

            let rptA = 0, rptB = 0;
            race.Results.forEach(r => {
                const cid = r.Constructor?.constructorId;
                const pts = parseFloat(r.points || 0);
                const pos = parseInt(r.position);
                if (cid === idA) { rptA += pts; if (pos === 1) winsA++; if (pos <= 3) podiumsA++; }
                if (cid === idB) { rptB += pts; if (pos === 1) winsB++; if (pos <= 3) podiumsB++; }
            });
            runA += rptA; runB += rptB;
            ptsA = runA; ptsB = runB;
            cumA.push(runA); cumB.push(runB);
        });

        // Points chart
        F1Charts.createLineChart('team-points-chart', labels, [
            { label: tA.name, data: cumA, borderColor: colorA, backgroundColor: F1Utils.withAlpha(colorA, 0.1), fill: true },
            { label: tB.name, data: cumB, borderColor: colorB, backgroundColor: F1Utils.withAlpha(colorB, 0.1), fill: true },
        ]);

        // Pit stop comparison (use Jolpica data)
        this.loadPitStops(idA, idB, tA, tB, colorA, colorB);

        // H2H
        const grid = document.getElementById('team-h2h-grid');
        grid.innerHTML = '';
        const items = [
            { label: 'Wins', vals: [winsA, winsB] },
            { label: 'Podiums', vals: [podiumsA, podiumsB] },
            { label: 'Total Points', vals: [ptsA, ptsB] },
        ];
        items.forEach(item => {
            const total = item.vals[0] + item.vals[1] || 1;
            const pctA = (item.vals[0] / total * 100);
            const el = document.createElement('div');
            el.className = 'h2h-item';
            el.innerHTML = `
                <div class="h2h-label">${item.label}</div>
                <div class="h2h-values">
                    <span class="h2h-val" style="color:${colorA}">${item.vals[0]}</span>
                    <div class="h2h-bar">
                        <div class="h2h-bar-a" style="width:${pctA}%;background:${colorA};"></div>
                        <div class="h2h-bar-b" style="width:${100 - pctA}%;background:${colorB};"></div>
                    </div>
                    <span class="h2h-val" style="color:${colorB}">${item.vals[1]}</span>
                </div>
            `;
            grid.appendChild(el);
        });
    },

    async loadPitStops(idA, idB, tA, tB, colorA, colorB) {
        const container = document.getElementById('pitstop-comparison');
        container.innerHTML = '<p class="text-muted">Loading pit stop data...</p>';

        // Load pit stops from last few completed races
        const completed = this.allResults.filter(r => r.Results && r.Results.length > 0);
        const recentRaces = completed.slice(-5);
        const season = F1Config.currentSeason;

        let pitsA = [], pitsB = [];
        for (const race of recentRaces) {
            const pitData = await F1API.getPitStops(season, race.round);
            if (!pitData) continue;
            // Find drivers for each team
            const driversA = new Set(), driversB = new Set();
            race.Results.forEach(r => {
                if (r.Constructor?.constructorId === idA) driversA.add(r.Driver.driverId);
                if (r.Constructor?.constructorId === idB) driversB.add(r.Driver.driverId);
            });
            pitData.forEach(p => {
                const dur = F1Utils.lapTimeToSeconds(p.duration);
                if (dur && dur < 60) { // filter out slow stops (red flags etc)
                    if (driversA.has(p.driverId)) pitsA.push(dur);
                    if (driversB.has(p.driverId)) pitsB.push(dur);
                }
            });
        }

        container.innerHTML = '';
        const avgA = pitsA.length ? F1Utils.mean(pitsA) : 0;
        const avgB = pitsB.length ? F1Utils.mean(pitsB) : 0;
        const fastA = pitsA.length ? Math.min(...pitsA) : 0;
        const fastB = pitsB.length ? Math.min(...pitsB) : 0;

        const data = [
            { team: tA.name, color: colorA, avg: avgA, fast: fastA, count: pitsA.length },
            { team: tB.name, color: colorB, avg: avgB, fast: fastB, count: pitsB.length },
        ];

        data.forEach(d => {
            const card = document.createElement('div');
            card.className = 'pit-card';
            card.style.borderLeft = `3px solid ${d.color}`;
            card.innerHTML = `
                <div class="pit-card-title" style="color:${d.color}">${d.team}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);">
                    <div>
                        <div class="pit-value">${d.avg ? d.avg.toFixed(2) : '—'}<span class="pit-unit">s avg</span></div>
                    </div>
                    <div>
                        <div class="pit-value">${d.fast ? d.fast.toFixed(2) : '—'}<span class="pit-unit">s best</span></div>
                    </div>
                </div>
                <div class="text-muted" style="margin-top:var(--space-sm);font-size:var(--text-xs);">${d.count} stops (last 5 races)</div>
            `;
            container.appendChild(card);
        });
    },
};
