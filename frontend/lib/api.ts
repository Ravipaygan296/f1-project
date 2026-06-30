/**
 * F1 Analytics — API Client
 * Fetch wrappers to the FastAPI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ========== Schedule ==========

export async function getSeasonSchedule(season: number) {
  return fetchAPI<{ races: any[]; season: number }>(`/api/schedule/${season}`);
}

export async function getRaceDetail(season: number, round: number) {
  return fetchAPI<{ race: any; results: any[] }>(`/api/schedule/${season}/race/${round}`);
}

export async function getNextRace() {
  return fetchAPI<{ next_race: any }>('/api/schedule/upcoming/next');
}

// ========== Standings ==========

export async function getDriverStandings(season: number) {
  return fetchAPI<{ standings: any[]; season: number }>(`/api/standings/drivers/${season}`);
}

export async function getConstructorStandings(season: number) {
  return fetchAPI<{ standings: any[]; season: number }>(`/api/standings/constructors/${season}`);
}

// ========== Comparisons ==========

export async function compareDrivers(raceId: number, driverIds: string[]) {
  const params = new URLSearchParams({ race_id: String(raceId) });
  driverIds.forEach(id => params.append('driver_ids', id));
  return fetchAPI<any>(`/api/compare/drivers?${params}`);
}

export async function compareDriversSeason(season: number, driverIds: string[]) {
  const params = new URLSearchParams({ season: String(season) });
  driverIds.forEach(id => params.append('driver_ids', id));
  return fetchAPI<any>(`/api/compare/drivers/season?${params}`);
}

export async function compareTeams(season: number, teamIds: string[]) {
  const params = new URLSearchParams({ season: String(season) });
  teamIds.forEach(id => params.append('team_ids', id));
  return fetchAPI<any>(`/api/compare/teams?${params}`);
}

export async function getTyreAnalysis(raceId: number) {
  return fetchAPI<any>(`/api/compare/tyres?race_id=${raceId}`);
}

export async function getTrackAnalysis(circuitId: string) {
  return fetchAPI<any>(`/api/compare/track?circuit_id=${circuitId}`);
}

// ========== Live ==========

export async function getLiveStatus() {
  return fetchAPI<any>('/api/live/status');
}

export async function getLivePositions() {
  return fetchAPI<any>('/api/live/positions');
}

export async function getLiveStrategy() {
  return fetchAPI<any>('/api/live/strategy');
}

// ========== AI Analyst ==========

export async function askAnalyst(question: string) {
  return fetchAPI<{
    answer: string | null;
    sql: string | null;
    data: any[];
    row_count: number;
    error: string | null;
  }>('/api/chat/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export async function getExampleQuestions() {
  return fetchAPI<{ examples: string[] }>('/api/chat/examples');
}

// ========== Entities ==========

export async function getSeasons() {
  return fetchAPI<{ seasons: number[] }>('/api/seasons');
}

export async function getDrivers(season?: number) {
  const params = season ? `?season=${season}` : '';
  return fetchAPI<{ drivers: any[] }>(`/api/drivers${params}`);
}

export async function getConstructors(season?: number) {
  const params = season ? `?season=${season}` : '';
  return fetchAPI<{ constructors: any[] }>(`/api/constructors${params}`);
}

export async function getCircuits() {
  return fetchAPI<{ circuits: any[] }>('/api/circuits');
}

// ========== Prediction ==========

export async function getRacePrediction(raceId: number) {
  return fetchAPI<any>(`/api/prediction/race/${raceId}`);
}

export async function getSeasonPrediction(season: number) {
  return fetchAPI<any>(`/api/prediction/season/${season}`);
}

export async function getPredictableRaces(season: number) {
  return fetchAPI<{ races: any[]; season: number }>(`/api/prediction/races/${season}`);
}

export async function getNextRacePrediction(season: number = 2026) {
  return fetchAPI<any>(`/api/prediction/next-race?season=${season}`);
}

// ========== Live Prediction ==========

export async function initLivePrediction(sessionKey: number, season: number = 2026) {
  return fetchAPI<any>(`/api/live-prediction/init/${sessionKey}?season=${season}`);
}

export async function getLivePrediction(sessionKey: number, totalLaps: number = 71) {
  return fetchAPI<any>(`/api/live-prediction/lap/${sessionKey}?total_laps=${totalLaps}`);
}

export async function getAccuracyChart() {
  return fetchAPI<any>('/api/live-prediction/accuracy-chart');
}

// ========== Team Colors ==========

export const TEAM_COLORS: Record<string, string> = {
  red_bull: '#3671C6',
  ferrari: '#E80020',
  mclaren: '#FF8700',
  mercedes: '#27F4D2',
  aston_martin: '#229971',
  alpine: '#FF87BC',
  williams: '#64C4FF',
  rb: '#6692FF',
  haas: '#B6BABD',
  sauber: '#52E252',
  kick_sauber: '#52E252',
  alphatauri: '#6692FF',
};

export const TYRE_COLORS: Record<string, string> = {
  SOFT: '#EF4444',
  MEDIUM: '#F59E0B',
  HARD: '#F1F5F9',
  INTERMEDIATE: '#22C55E',
  WET: '#3B82F6',
};

