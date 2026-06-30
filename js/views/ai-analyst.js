/* ============================================
   F1 TELEMETRY ROOM — AI Analyst View
   Intelligent data analysis using local computation
   ============================================ */

const AIAnalystView = {
    dataCache: {},

    async init(season) {
        // Pre-load data for analysis
        const [standings, constructors, allResults] = await Promise.all([
            F1API.getDriverStandings(season),
            F1API.getConstructorStandings(season),
            F1API.getAllRaceResults(season),
        ]);
        this.dataCache = { standings, constructors, allResults, season };

        // Chat input handling
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send');

        const send = () => {
            const q = input.value.trim();
            if (!q) return;
            input.value = '';
            this.handleQuestion(q);
        };

        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    },

    addMessage(content, type = 'system') {
        const messages = document.getElementById('chat-messages');
        const msg = document.createElement('div');
        msg.className = `chat-message ${type}`;
        msg.innerHTML = `
            <div class="message-avatar ${type === 'user' ? 'user-avatar' : 'system-avatar'}">${type === 'user' ? '◆' : '⬡'}</div>
            <div class="message-content">${content}</div>
        `;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
    },

    handleQuestion(question) {
        this.addMessage(`<p>${this.escapeHtml(question)}</p>`, 'user');
        const q = question.toLowerCase();

        // Pattern matching for common queries
        if (q.includes('standing') || q.includes('championship') || q.includes('leader')) {
            this.answerStandings();
        } else if (q.includes('podium')) {
            this.answerPodiums();
        } else if (q.includes('win') || q.includes('winner') || q.includes('victories')) {
            this.answerWins();
        } else if ((q.includes('compar') || q.includes('vs') || q.includes('versus')) && (q.includes('team') || q.includes('constructor'))) {
            this.answerTeamComparison(q);
        } else if (q.includes('compar') || q.includes('vs') || q.includes('versus')) {
            this.answerDriverComparison(q);
        } else if (q.includes('pit') || q.includes('stop')) {
            this.answerPitStops();
        } else if (q.includes('point') || q.includes('score')) {
            this.answerPoints();
        } else if (q.includes('dnf') || q.includes('retire') || q.includes('did not finish')) {
            this.answerDNFs();
        } else if (q.includes('fastest') || q.includes('best lap') || q.includes('quick')) {
            this.answerFastestDrivers();
        } else if (q.includes('consist') || q.includes('reliable') || q.includes('steady')) {
            this.answerConsistency();
        } else {
            this.answerGeneral(question);
        }
    },

    answerStandings() {
        const { standings, constructors, season } = this.dataCache;
        let html = `<p><strong>${season} Championship Standings:</strong></p>`;

        if (standings && standings.length > 0) {
            html += '<p style="margin-bottom:8px;"><strong>Drivers:</strong></p>';
            standings.slice(0, 5).forEach(s => {
                const color = F1Config.getTeamColor(s.Constructors?.[0]?.constructorId);
                html += `<p style="color:var(--timing-dim);">P${s.position}. <span style="color:${color};font-weight:600;">${s.Driver.givenName} ${s.Driver.familyName}</span> — ${s.points} pts (${s.Constructors?.[0]?.name || ''})</p>`;
            });
            const gap = parseFloat(standings[0].points) - parseFloat(standings[1]?.points || 0);
            html += `<p style="margin-top:8px;">The gap between P1 and P2 is <strong style="color:var(--circuit-green);">${gap} points</strong>.</p>`;
        }

        if (constructors && constructors.length > 0) {
            html += '<p style="margin-top:12px;margin-bottom:8px;"><strong>Constructors:</strong></p>';
            constructors.slice(0, 5).forEach(s => {
                const color = F1Config.getTeamColor(s.Constructor?.constructorId);
                html += `<p style="color:var(--timing-dim);">P${s.position}. <span style="color:${color};font-weight:600;">${s.Constructor?.name}</span> — ${s.points} pts</p>`;
            });
        }
        this.addMessage(html);
    },

    answerPodiums() {
        const { allResults } = this.dataCache;
        const podiumCount = {};
        allResults.forEach(race => {
            if (!race.Results) return;
            race.Results.slice(0, 3).forEach(r => {
                const id = r.Driver.driverId;
                if (!podiumCount[id]) podiumCount[id] = { name: `${r.Driver.givenName} ${r.Driver.familyName}`, team: r.Constructor?.constructorId, count: 0 };
                podiumCount[id].count++;
            });
        });

        const sorted = Object.values(podiumCount).sort((a, b) => b.count - a.count);
        let html = '<p><strong>Podium Count This Season:</strong></p>';
        sorted.slice(0, 10).forEach((d, i) => {
            const color = F1Config.getTeamColor(d.team);
            html += `<p style="color:var(--timing-dim);">${i + 1}. <span style="color:${color};font-weight:600;">${d.name}</span> — ${d.count} podiums</p>`;
        });
        this.addMessage(html);
    },

    answerWins() {
        const { allResults } = this.dataCache;
        const winCount = {};
        allResults.forEach(race => {
            if (!race.Results?.[0]) return;
            const w = race.Results[0];
            const id = w.Driver.driverId;
            if (!winCount[id]) winCount[id] = { name: `${w.Driver.givenName} ${w.Driver.familyName}`, team: w.Constructor?.constructorId, count: 0, races: [] };
            winCount[id].count++;
            winCount[id].races.push(race.raceName);
        });

        const sorted = Object.values(winCount).sort((a, b) => b.count - a.count);
        let html = '<p><strong>Race Wins This Season:</strong></p>';
        sorted.forEach((d) => {
            const color = F1Config.getTeamColor(d.team);
            html += `<p style="color:var(--timing-dim);"><span style="color:${color};font-weight:600;">${d.name}</span> — ${d.count} win${d.count > 1 ? 's' : ''} (${d.races.join(', ')})</p>`;
        });
        this.addMessage(html);
    },

    answerDriverComparison(q) {
        const { standings, allResults } = this.dataCache;
        // Try to find two driver names in the query
        const driverNames = standings.map(s => ({
            id: s.Driver.driverId,
            full: `${s.Driver.givenName} ${s.Driver.familyName}`.toLowerCase(),
            last: s.Driver.familyName.toLowerCase(),
            code: F1Config.getDriverCode(s.Driver).toLowerCase(),
            data: s,
        }));

        const found = [];
        driverNames.forEach(d => {
            if (q.includes(d.last) || q.includes(d.code) || q.includes(d.full)) {
                found.push(d);
            }
        });

        if (found.length < 2) {
            this.addMessage('<p>I found less than 2 drivers in your query. Please mention two driver names or codes to compare (e.g., "Compare Verstappen vs Norris").</p>');
            return;
        }

        const [dA, dB] = found.slice(0, 2);
        const colorA = F1Config.getTeamColor(dA.data.Constructors?.[0]?.constructorId);
        const colorB = F1Config.getTeamColor(dB.data.Constructors?.[0]?.constructorId);

        let winsA = 0, winsB = 0, podA = 0, podB = 0, betterA = 0, betterB = 0;
        allResults.forEach(race => {
            if (!race.Results) return;
            const rA = race.Results.find(r => r.Driver.driverId === dA.id);
            const rB = race.Results.find(r => r.Driver.driverId === dB.id);
            if (!rA || !rB) return;
            const posA = parseInt(rA.position), posB = parseInt(rB.position);
            if (posA === 1) winsA++;
            if (posB === 1) winsB++;
            if (posA <= 3) podA++;
            if (posB <= 3) podB++;
            if (posA < posB) betterA++;
            else if (posB < posA) betterB++;
        });

        let html = `<p><strong>Head-to-Head: <span style="color:${colorA}">${dA.data.Driver.familyName}</span> vs <span style="color:${colorB}">${dB.data.Driver.familyName}</span></strong></p>`;
        html += `<p>Points: <span style="color:${colorA};font-weight:600;">${dA.data.points}</span> vs <span style="color:${colorB};font-weight:600;">${dB.data.points}</span></p>`;
        html += `<p>Wins: <span style="color:${colorA};font-weight:600;">${winsA}</span> vs <span style="color:${colorB};font-weight:600;">${winsB}</span></p>`;
        html += `<p>Podiums: <span style="color:${colorA};font-weight:600;">${podA}</span> vs <span style="color:${colorB};font-weight:600;">${podB}</span></p>`;
        html += `<p>Head-to-Head Finishes: <span style="color:${colorA};font-weight:600;">${betterA}</span> — <span style="color:${colorB};font-weight:600;">${betterB}</span></p>`;

        const diff = parseFloat(dA.data.points) - parseFloat(dB.data.points);
        const leader = diff > 0 ? dA.data.Driver.familyName : dB.data.Driver.familyName;
        html += `<p style="margin-top:8px;"><strong style="color:var(--circuit-green);">${leader}</strong> leads by ${Math.abs(diff)} points in the championship.</p>`;
        this.addMessage(html);
    },

    answerTeamComparison(q) {
        const { constructors, allResults } = this.dataCache;
        const teamNames = constructors.map(s => ({
            id: s.Constructor.constructorId,
            name: s.Constructor.name.toLowerCase(),
            data: s,
        }));

        const found = [];
        teamNames.forEach(t => {
            if (q.includes(t.name) || q.includes(t.id)) found.push(t);
        });

        if (found.length < 2) {
            this.addMessage('<p>Please mention two team names to compare (e.g., "Compare Ferrari vs McLaren").</p>');
            return;
        }

        const [tA, tB] = found.slice(0, 2);
        const colorA = F1Config.getTeamColor(tA.id);
        const colorB = F1Config.getTeamColor(tB.id);

        let winsA = 0, winsB = 0;
        allResults.forEach(race => {
            if (!race.Results?.[0]) return;
            if (race.Results[0].Constructor?.constructorId === tA.id) winsA++;
            if (race.Results[0].Constructor?.constructorId === tB.id) winsB++;
        });

        let html = `<p><strong><span style="color:${colorA}">${tA.data.Constructor.name}</span> vs <span style="color:${colorB}">${tB.data.Constructor.name}</span></strong></p>`;
        html += `<p>Championship Position: P${tA.data.position} vs P${tB.data.position}</p>`;
        html += `<p>Points: <span style="color:${colorA};font-weight:600;">${tA.data.points}</span> vs <span style="color:${colorB};font-weight:600;">${tB.data.points}</span></p>`;
        html += `<p>Wins: <span style="color:${colorA};font-weight:600;">${winsA}</span> vs <span style="color:${colorB};font-weight:600;">${winsB}</span></p>`;
        this.addMessage(html);
    },

    answerPoints() {
        this.answerStandings();
    },

    answerDNFs() {
        const { allResults } = this.dataCache;
        const dnfCount = {};
        allResults.forEach(race => {
            if (!race.Results) return;
            race.Results.forEach(r => {
                const status = r.status || '';
                if (status !== 'Finished' && !status.startsWith('+')) {
                    const id = r.Driver.driverId;
                    if (!dnfCount[id]) dnfCount[id] = { name: `${r.Driver.givenName} ${r.Driver.familyName}`, team: r.Constructor?.constructorId, count: 0, reasons: [] };
                    dnfCount[id].count++;
                    dnfCount[id].reasons.push(`${race.raceName.replace(' Grand Prix', '')}: ${status}`);
                }
            });
        });

        const sorted = Object.values(dnfCount).sort((a, b) => b.count - a.count);
        let html = '<p><strong>Retirements / DNFs This Season:</strong></p>';
        if (sorted.length === 0) {
            html += '<p>No DNFs recorded yet.</p>';
        } else {
            sorted.slice(0, 10).forEach(d => {
                const color = F1Config.getTeamColor(d.team);
                html += `<p><span style="color:${color};font-weight:600;">${d.name}</span> — ${d.count} DNF${d.count > 1 ? 's' : ''}</p>`;
                html += `<p class="message-hint" style="margin-left:12px;font-size:11px;">${d.reasons.join(' · ')}</p>`;
            });
        }
        this.addMessage(html);
    },

    answerFastestDrivers() {
        const { standings } = this.dataCache;
        let html = '<p><strong>Fastest Drivers (by Championship Points — a proxy for overall pace):</strong></p>';
        html += '<p class="message-hint">Note: For detailed lap-time comparisons, use the Driver vs Driver tab where I can compute median pace from actual lap data.</p>';
        standings.slice(0, 10).forEach(s => {
            const color = F1Config.getTeamColor(s.Constructors?.[0]?.constructorId);
            html += `<p>P${s.position}. <span style="color:${color};font-weight:600;">${s.Driver.givenName} ${s.Driver.familyName}</span> — ${s.points} pts</p>`;
        });
        this.addMessage(html);
    },

    answerConsistency() {
        const { allResults, standings } = this.dataCache;
        const driverStats = {};
        allResults.forEach(race => {
            if (!race.Results) return;
            race.Results.forEach(r => {
                const id = r.Driver.driverId;
                if (!driverStats[id]) driverStats[id] = { name: `${r.Driver.givenName} ${r.Driver.familyName}`, team: r.Constructor?.constructorId, positions: [] };
                driverStats[id].positions.push(parseInt(r.position));
            });
        });

        // Calculate standard deviation of positions
        const consistency = Object.values(driverStats).map(d => ({
            ...d,
            avg: F1Utils.mean(d.positions),
            stddev: F1Utils.stddev(d.positions),
            races: d.positions.length,
        })).filter(d => d.races >= 3).sort((a, b) => a.stddev - b.stddev);

        let html = '<p><strong>Most Consistent Drivers (lowest position variance):</strong></p>';
        consistency.slice(0, 10).forEach((d, i) => {
            const color = F1Config.getTeamColor(d.team);
            html += `<p>${i + 1}. <span style="color:${color};font-weight:600;">${d.name}</span> — avg position: ${d.avg.toFixed(1)}, std dev: ${d.stddev.toFixed(2)} (${d.races} races)</p>`;
        });
        html += '<p class="message-hint" style="margin-top:8px;">Lower standard deviation = more consistent. A driver finishing P2, P3, P2 is more consistent than one finishing P1, P10, P1.</p>';
        this.addMessage(html);
    },

    answerGeneral(question) {
        let html = `<p>I can help you analyze F1 data! Try asking about:</p>
        <p>• <strong>"Championship standings"</strong> — current points</p>
        <p>• <strong>"Compare Verstappen vs Norris"</strong> — driver head-to-head</p>
        <p>• <strong>"Compare Ferrari vs McLaren team"</strong> — team comparison</p>
        <p>• <strong>"Who has the most wins?"</strong> — race winners</p>
        <p>• <strong>"Podium count"</strong> — podium statistics</p>
        <p>• <strong>"DNFs this season"</strong> — retirements</p>
        <p>• <strong>"Most consistent drivers"</strong> — finishing consistency</p>
        <p class="message-hint" style="margin-top:8px;">For detailed lap-by-lap and tyre analysis, use the dedicated Tyre Analysis and Driver Compare tabs.</p>`;
        this.addMessage(html);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};
