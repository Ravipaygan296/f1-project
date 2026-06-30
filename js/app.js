/* ============================================
   F1 TELEMETRY ROOM — Core App Controller
   Glues all views, routing, and season selection
   ============================================ */

const App = {
    currentSeason: F1Config.currentSeason,
    currentView: 'overview',

    async init() {
        console.log("Initializing F1 Telemetry Room...");
        
        // Initialize Chart.js default theming
        F1Charts.init();

        // Setup Event Listeners
        this.setupNavigation();
        this.setupSeasonSelector();

        // Hide loading screen, show app
        const loadingBar = document.getElementById('loading-bar');
        const loadingStatus = document.getElementById('loading-status');
        
        try {
            loadingStatus.textContent = "Loading overview dashboard...";
            await this.loadView(this.currentView);
            
            // Success! Fade out loading screen
            const loadingScreen = document.getElementById('loading-screen');
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                document.getElementById('app').style.display = 'flex';
            }, 500);
        } catch (error) {
            console.error("Initialization failed:", error);
            loadingStatus.textContent = "Error loading data. Retrying...";
            loadingStatus.style.color = "var(--flag-red)";
        }
    },

    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetView = btn.dataset.view;
                if (!targetView || targetView === this.currentView) return;

                // Update active state in UI
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Switch views
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                const viewEl = document.getElementById(`view-${targetView}`);
                if (viewEl) {
                    viewEl.classList.add('active');
                }

                this.currentView = targetView;
                await this.loadView(targetView);
            });
        });
    },

    setupSeasonSelector() {
        const select = document.getElementById('season-select');
        if (select) {
            select.value = this.currentSeason;
            select.addEventListener('change', async (e) => {
                const newSeason = parseInt(e.target.value);
                if (newSeason === this.currentSeason) return;

                this.currentSeason = newSeason;
                F1Config.currentSeason = newSeason;

                // Show loading spinner/status briefly or reload current view
                const loadingScreen = document.getElementById('loading-screen');
                const loadingStatus = document.getElementById('loading-status');
                const loadingBar = document.getElementById('loading-bar');
                
                loadingScreen.style.display = 'flex';
                loadingScreen.classList.remove('fade-out');
                loadingBar.style.width = '0%';
                // Force reflow
                void loadingBar.offsetWidth;
                loadingBar.style.animation = 'none';
                loadingBar.style.width = '100%';
                loadingBar.style.transition = 'width 1s ease';
                
                loadingStatus.textContent = `Updating dashboard for ${newSeason} season...`;

                try {
                    // Re-initialize views that need season resets
                    await this.loadView(this.currentView, true);
                    
                    setTimeout(() => {
                        loadingScreen.classList.add('fade-out');
                        setTimeout(() => {
                            loadingScreen.style.display = 'none';
                        }, 500);
                    }, 800);
                } catch (error) {
                    console.error("Failed to load season:", error);
                    loadingStatus.textContent = "Error reloading season data.";
                    loadingStatus.style.color = "var(--flag-red)";
                }
            });
        }
    },

    /**
     * Load view and run specific init functions
     * @param {string} viewName - Name of the view to load
     * @param {boolean} forceReload - Force re-initialization of components
     */
    async loadView(viewName, forceReload = false) {
        console.log(`Loading view: ${viewName} for season ${this.currentSeason}`);
        
        switch (viewName) {
            case 'overview':
                await OverviewView.load(this.currentSeason);
                break;
            case 'driver-compare':
                await DriverCompareView.init(this.currentSeason);
                break;
            case 'team-compare':
                await TeamCompareView.init(this.currentSeason);
                break;
            case 'tyre-analysis':
                await TyreAnalysisView.init(this.currentSeason);
                break;
            case 'track-analysis':
                await TrackAnalysisView.init(this.currentSeason);
                break;
            case 'standings':
                await StandingsView.load(this.currentSeason);
                break;
            case 'ai-analyst':
                await AIAnalystView.init(this.currentSeason);
                break;
            default:
                console.warn(`Unknown view: ${viewName}`);
        }
    }
};

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
