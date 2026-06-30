/* ============================================
   F1 TELEMETRY ROOM — Tyre Analysis View
   ============================================ */

const TyreAnalysisView = {
    allResults: [],

    async init(season) {
        this.allResults = await F1API.getAllRaceResults(season);
        this.populateRaceDropdown(season);
    },

    populateRaceDropdown(season) {
        const sel = document.getElementById('tyre-race-select');
        sel.innerHTML = '<option value="">Select a race...</option>';
        const completed = this.allResults.filter(r => r.Results && r.Results.length > 0);
        completed.forEach(race => {
            const opt = document.createElement('option');
            opt.value = race.round;
            opt.textContent = `R${race.round} — ${race.raceName}`;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => this.loadRace(season, sel.value));
    },

    async loadRace(season, round) {
        const resultsDiv = document.getElementById('tyre-results');
        if (!round) { resultsDiv.style.display = 'none'; return; }
        resultsDiv.style.display = 'block';

        // Try OpenF1 stints first (available 2023+)
        let stints = null;
        let pitStops = null;

        if (season >= 2023) {
            const sessions = await F1API.getOpenF1Sessions(season);
            if (sessions) {
                const raceSessions = sessions.filter(s => s.session_type === 'Race');
                // Find matching session by round (approximate — match by schedule order)
                const raceSession = raceSessions[parseInt(round) - 1];
                if (raceSession) {
                    stints = await F1API.getOpenF1Stints(raceSession.session_key);
                }
            }
        }

        // Also get Jolpica pit stops
        pitStops = await F1API.getPitStops(season, round);
        const raceResult = this.allResults.find(r => r.round === round);

        if (stints && stints.length > 0) {
            this.renderOpenF1Strategy(stints, raceResult);
        } else {
            this.renderBasicStrategy(pitStops, raceResult);
        }

        this.renderPitStopTable(pitStops, raceResult);
    },

    renderOpenF1Strategy(stints, raceResult) {
        const container = document.getElementById('strategy-timeline');
        container.innerHTML = '';

        // Group stints by driver
        const byDriver = {};
        stints.forEach(s => {
            if (!byDriver[s.driver_number]) byDriver[s.driver_number] = [];
            byDriver[s.driver_number].push(s);
        });

        // Get max lap count
        let maxLap = 0;
        Object.values(byDriver).forEach(driverStints => {
            driverStints.forEach(s => {
                if (s.lap_end && s.lap_end > maxLap) maxLap = s.lap_end;
            });
        });
        if (maxLap === 0) maxLap = 60;

        // Map driver numbers to codes using race results
        const driverMap = {};
        if (raceResult && raceResult.Results) {
            raceResult.Results.forEach(r => {
                driverMap[r.number] = {
                    code: F1Config.getDriverCode(r.Driver),
                    team: r.Constructor?.constructorId,
                    pos: parseInt(r.position),
                };
            });
        }

        // Sort by finishing position
        const driverNums = Object.keys(byDriver).sort((a, b) => {
            const posA = driverMap[a]?.pos || 99;
            const posB = driverMap[b]?.pos || 99;
            return posA - posB;
        });

        driverNums.slice(0, 20).forEach(num => {
            const driverStints = byDriver[num].sort((a, b) => (a.lap_start || 0) - (b.lap_start || 0));
            const info = driverMap[num] || { code: num, team: '' };
            const teamColor = F1Config.getTeamColor(info.team);

            const row = document.createElement('div');
            row.className = 'stint-row';

            const driverLabel = document.createElement('span');
            driverLabel.className = 'stint-driver';
            driverLabel.style.color = teamColor;
            driverLabel.textContent = info.code || num;
            row.appendChild(driverLabel);

            const barContainer = document.createElement('div');
            barContainer.className = 'stint-bar-container';

            driverStints.forEach(stint => {
                const start = stint.lap_start || 1;
                const end = stint.lap_end || maxLap;
                const width = ((end - start + 1) / maxLap * 100);
                const left = ((start - 1) / maxLap * 100);
                const compound = stint.compound || 'UNKNOWN';
                const color = F1Config.getTyreColor(compound);

                const seg = document.createElement('div');
                seg.className = 'stint-segment';
                seg.style.width = `${width}%`;
                seg.style.background = color;
                seg.style.color = compound === 'HARD' ? '#15171C' : '#0D0F13';
                seg.textContent = `${compound.charAt(0)}`;
                seg.title = `${compound} · Laps ${start}-${end} (${end - start + 1} laps)`;
                barContainer.appendChild(seg);
            });

            row.appendChild(barContainer);
            container.appendChild(row);
        });
    },

    renderBasicStrategy(pitStops, raceResult) {
        const container = document.getElementById('strategy-timeline');
        container.innerHTML = '';

        if (!raceResult || !raceResult.Results) {
            container.innerHTML = '<p class="text-muted">No detailed tyre data available for this race. OpenF1 stint data is available from 2023 onwards.</p>';
            return;
        }

        if (!pitStops || pitStops.length === 0) {
            container.innerHTML = '<p class="text-muted">No pit stop data available for this race.</p>';
            return;
        }

        // Basic visualization from pit stop laps
        const maxLap = Math.max(...raceResult.Results.map(r => parseInt(r.laps || 50)));
        const byDriver = {};
        pitStops.forEach(p => {
            if (!byDriver[p.driverId]) byDriver[p.driverId] = [];
            byDriver[p.driverId].push(parseInt(p.lap));
        });

        const driverMap = {};
        raceResult.Results.forEach(r => {
            driverMap[r.Driver.driverId] = {
                code: F1Config.getDriverCode(r.Driver),
                team: r.Constructor?.constructorId,
                pos: parseInt(r.position),
                laps: parseInt(r.laps || maxLap),
            };
        });

        // Sort by position
        const sortedDrivers = Object.keys(byDriver).sort((a, b) => {
            return (driverMap[a]?.pos || 99) - (driverMap[b]?.pos || 99);
        });

        sortedDrivers.forEach(driverId => {
            const stops = byDriver[driverId].sort((a, b) => a - b);
            const info = driverMap[driverId] || { code: driverId.substring(0, 3).toUpperCase(), team: '', laps: maxLap };
            const teamColor = F1Config.getTeamColor(info.team);

            const row = document.createElement('div');
            row.className = 'stint-row';

            const label = document.createElement('span');
            label.className = 'stint-driver';
            label.style.color = teamColor;
            label.textContent = info.code;
            row.appendChild(label);

            const barContainer = document.createElement('div');
            barContainer.className = 'stint-bar-container';

            // Create stint segments between pit stops
            const boundaries = [1, ...stops, info.laps + 1];
            const stintColors = ['#6B7280', '#9BA1B0', '#4B5563', '#6B7280'];
            for (let i = 0; i < boundaries.length - 1; i++) {
                const start = boundaries[i];
                const end = boundaries[i + 1] - 1;
                const width = ((end - start + 1) / maxLap * 100);
                const seg = document.createElement('div');
                seg.className = 'stint-segment';
                seg.style.width = `${width}%`;
                seg.style.background = stintColors[i % stintColors.length];
                seg.textContent = `S${i + 1}`;
                seg.title = `Stint ${i + 1} · Laps ${start}-${end}`;
                barContainer.appendChild(seg);
            }
            row.appendChild(barContainer);
            container.appendChild(row);
        });
    },

    renderPitStopTable(pitStops, raceResult) {
        const tbody = document.getElementById('pitstop-table-body');
        tbody.innerHTML = '';

        if (!pitStops || pitStops.length === 0 || !raceResult) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No pit stop data</td></tr>';
            return;
        }

        const driverMap = {};
        if (raceResult.Results) {
            raceResult.Results.forEach(r => {
                driverMap[r.Driver.driverId] = {
                    code: F1Config.getDriverCode(r.Driver),
                    name: `${r.Driver.givenName} ${r.Driver.familyName}`,
                    team: r.Constructor?.constructorId,
                };
            });
        }

        // Group by driver
        const byDriver = {};
        pitStops.forEach(p => {
            if (!byDriver[p.driverId]) byDriver[p.driverId] = [];
            byDriver[p.driverId].push(p);
        });

        Object.entries(byDriver).forEach(([driverId, stops]) => {
            const info = driverMap[driverId] || { code: '???', name: driverId };
            const color = F1Config.getTeamColor(info.team);
            const durations = stops.map(s => F1Utils.lapTimeToSeconds(s.duration)).filter(d => d && d < 60);
            const totalTime = durations.reduce((a, b) => a + b, 0);
            const fastest = durations.length ? Math.min(...durations) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="color:${color};font-weight:600;">${info.code}</span> ${info.name || ''}</td>
                <td class="mono-cell">${stops.length}</td>
                <td class="mono-cell">${totalTime ? totalTime.toFixed(2) + 's' : '—'}</td>
                <td class="mono-cell">${fastest ? fastest.toFixed(2) + 's' : '—'}</td>
                <td class="mono-cell text-muted">${stops.map(s => 'L' + s.lap).join(', ')}</td>
            `;
            tbody.appendChild(tr);
        });
    },
};
