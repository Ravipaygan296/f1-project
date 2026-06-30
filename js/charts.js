/* ============================================
   F1 TELEMETRY ROOM — Chart Helpers
   Chart.js configuration and theming
   ============================================ */

const F1Charts = {
    instances: {},

    // Global Chart.js defaults
    init() {
        Chart.defaults.color = '#9BA1B0';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
        Chart.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";
        Chart.defaults.font.size = 11;
        Chart.defaults.plugins.legend.labels.usePointStyle = true;
        Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
        Chart.defaults.plugins.legend.labels.padding = 16;
        Chart.defaults.plugins.tooltip.backgroundColor = '#1F2228';
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.1)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.titleFont = { family: "'Space Grotesk'", weight: '600', size: 13 };
        Chart.defaults.plugins.tooltip.bodyFont = { family: "'JetBrains Mono'", size: 11 };
    },

    // Destroy existing chart before creating new one
    destroy(id) {
        if (this.instances[id]) {
            this.instances[id].destroy();
            delete this.instances[id];
        }
    },

    // Create a line chart for points progression
    createLineChart(canvasId, labels, datasets) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        this.instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
                },
                plugins: { legend: { position: 'top' } },
                elements: {
                    line: { tension: 0.3, borderWidth: 2 },
                    point: { radius: 4, hoverRadius: 6, borderWidth: 2 }
                }
            }
        });
        return this.instances[canvasId];
    },

    // Create a bar chart
    createBarChart(canvasId, labels, datasets, opts = {}) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        const invertY = opts.invertY || false;
        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: opts.horizontal ? 'y' : 'x',
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        reverse: invertY,
                        beginAtZero: !invertY,
                    }
                },
                plugins: { legend: { display: datasets.length > 1 } }
            }
        });
        return this.instances[canvasId];
    },

    // Create a grouped bar chart for positions (inverted y for position = lower is better)
    createPositionChart(canvasId, labels, datasets) {
        return this.createBarChart(canvasId, labels, datasets, { invertY: true });
    },
};
