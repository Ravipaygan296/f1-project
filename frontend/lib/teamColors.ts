/**
 * F1 Livery Hex Colors (Updated for latest season details)
 */
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
  audi: '#FF007F', // Audi entering
};

export function getTeamColor(teamId: string): string {
  const normalized = teamId?.toLowerCase()?.replace(/\s+/g, '_') || '';
  for (const [key, val] of Object.entries(TEAM_COLORS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return val;
    }
  }
  return '#6B7280'; // Default gray
}
