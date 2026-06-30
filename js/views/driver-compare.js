/* ============================================
   F1 TELEMETRY ROOM — Driver Compare View
   ============================================ */

const DriverCompareView = {
    drivers: [],
    allResults: [],

    async init(season) {
        // Load driver standings to populate dropdowns
        const standings = await F1API.getDriverStandings(season);
        this.allResults = await F1API.getAllRaceResults(season);
        this.drivers = standings.map(s => ({
            id: s.Driver.driverId,
            code: F1Config.getDriverCode(s.Driver),
            name: `${s.Driver.givenName} ${s.Driver.familyName}`,
            team: s.Constructors?.[0]?.name || '',
            teamId: s.Constructors?.[0]?.constructorId || '',
            points: parseFloat(s.points),
        }));

        this.populateDropdowns();
        this.populateRaceDropdown();
    },

    populateDropdowns() {
        const selA = document.getElementById('driver-a-select');
        const selB = document.getElementById('driver-b-select');
        [selA, selB].forEach(sel => {
            sel.innerHTML = '<option value="">Select driver...</option>';
            this.drivers.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = `${d.code} — ${d.name}`;
                sel.appendChild(opt);
            });
        });

        selA.addEventListener('change', () => { this.updatePreview('a'); this.compare(); });
        selB.addEventListener('change', () => { this.updatePreview('b'); this.compare(); });
    },

    populateRaceDropdown() {
        const sel = document.getElementById('compare-race-select');
        sel.innerHTML = '<option value="season">Full Season</option>';
        this.allResults.forEach(race => {
            if (race.Results && race.Results.length > 0) {
                const opt = document.createElement('option');
                opt.value = race.round;
                opt.textContent = `R${race.round} — ${race.raceName}`;
                sel.appendChild(opt);
            }
        });
        sel.addEventListener('change', () => this.compare());
    },

    updatePreview(side) {
        const sel = document.getElementById(`driver-${side}-select`);
        const preview = document.getElementById(`driver-${side}-preview`);
        const driver = this.drivers.find(d => d.id === sel.value);
        if (!driver) { preview.innerHTML = ''; return; }

        const color = F1Config.getTeamColor(driver.teamId);
        preview.innerHTML = '';
        const avatar = F1Utils.createAvatar(driver.code, color, 48);
        avatar.className = 'preview-avatar';
        preview.appendChild(avatar);
        const info = document.createElement('div');
        info.className = 'preview-info';
        info.innerHTML = `<span class="preview-name">${driver.name}</span><span class="preview-team" style="color:${color}">${driver.team}</span>`;
        preview.appendChild(info);
    },

    compare() {
        const idA = document.getElementById('driver-a-select').value;
        const idB = document.getElementById('driver-b-select').value;
        const resultsDiv = document.getElementById('driver-compare-results');

        if (!idA || !idB) { resultsDiv.style.display = 'none'; return; }
        resultsDiv.style.display = 'block';

        const dA = this.drivers.find(d => d.id === idA);
        const dB = this.drivers.find(d => d.id === idB);
        const colorA = F1Config.getTeamColor(dA.teamId);
        const colorB = F1Config.getTeamColor(dB.teamId);

        // Collect race-by-race data
        const raceLabels = [];
        const ptsA = [], ptsB = [];
        const qualiA = [], qualiB = [];
        const finishA = [], finishB = [];
        let cumA = 0, cumB = 0;
        let winsA = 0, winsB = 0;
        let podiumsA = 0, podiumsB = 0;
        let qualiWinsA = 0, qualiWinsB = 0;
        let betterFinishA = 0, betterFinishB = 0;

        this.allResults.forEach(race => {
            if (!race.Results || race.Results.length === 0) return;
            const resA = race.Results.find(r => r.Driver.driverId === idA);
            const resB = race.Results.find(r => r.Driver.driverId === idB);
            if (!resA && !resB) return;

            raceLabels.push(race.raceName.replace(' Grand Prix', ''));

            const ptA = resA ? parseFloat(resA.points || 0) : 0;
            const ptB = resB ? parseFloat(resB.points || 0) : 0;
            cumA += ptA; cumB += ptB;
            ptsA.push(cumA); ptsB.push(cumB);

            const posA = resA ? parseInt(resA.position) : 99;
            const posB = resB ? parseInt(resB.position) : 99;
            finishA.push(posA <= 20 ? posA : null);
            finishB.push(posB <= 20 ? posB : null);

            const gridA = resA ? parseInt(resA.grid || 99) : 99;
            const gridB = resB ? parseInt(resB.grid || 99) : 99;
            qualiA.push(gridA <= 20 ? gridA : null);
            qualiB.push(gridB <= 20 ? gridB : null);

            if (posA === 1) winsA++;
            if (posB === 1) winsB++;
            if (posA <= 3) podiumsA++;
            if (posB <= 3) podiumsB++;
            if (gridA < gridB) qualiWinsA++;
            else if (gridB < gridA) qualiWinsB++;
            if (posA < posB) betterFinishA++;
            else if (posB < posA) betterFinishB++;
        });

        // H2H Grid
        this.renderH2H(dA, dB, colorA, colorB, {
            wins: [winsA, winsB],
            podiums: [podiumsA, podiumsB],
            points: [cumA, cumB],
            qualiH2H: [qualiWinsA, qualiWinsB],
            raceH2H: [betterFinishA, betterFinishB],
        });

        // Points Progression Chart
        F1Charts.createLineChart('points-progression-chart', raceLabels, [
            { label: dA.code, data: ptsA, borderColor: colorA, backgroundColor: F1Utils.withAlpha(colorA, 0.1), fill: true },
            { label: dB.code, data: ptsB, borderColor: colorB, backgroundColor: F1Utils.withAlpha(colorB, 0.1), fill: true },
        ]);

        // Qualifying Chart
        F1Charts.createPositionChart('quali-comparison-chart', raceLabels, [
            { label: dA.code, data: qualiA, backgroundColor: F1Utils.withAlpha(colorA, 0.7), borderColor: colorA, borderWidth: 1 },
            { label: dB.code, data: qualiB, backgroundColor: F1Utils.withAlpha(colorB, 0.7), borderColor: colorB, borderWidth: 1 },
        ]);

        // Race Position Chart
        F1Charts.createPositionChart('race-position-chart', raceLabels, [
            { label: dA.code, data: finishA, backgroundColor: F1Utils.withAlpha(colorA, 0.7), borderColor: colorA, borderWidth: 1 },
            { label: dB.code, data: finishB, backgroundColor: F1Utils.withAlpha(colorB, 0.7), borderColor: colorB, borderWidth: 1 },
        ]);
    },

    renderH2H(dA, dB, colorA, colorB, stats) {
        const grid = document.getElementById('h2h-grid');
        grid.innerHTML = '';
        const items = [
            { label: 'Wins', vals: stats.wins },
            { label: 'Podiums', vals: stats.podiums },
            { label: 'Total Points', vals: stats.points },
            { label: 'Qualifying H2H', vals: stats.qualiH2H },
            { label: 'Race H2H', vals: stats.raceH2H },
        ];

        items.forEach(item => {
            const total = item.vals[0] + item.vals[1];
            const pctA = total > 0 ? (item.vals[0] / total * 100) : 50;
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
};
