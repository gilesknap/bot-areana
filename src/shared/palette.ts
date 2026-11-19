/** Colours from docs/visual/Main.dc.html (spec sheet 01) plus the arena / editor extras. */
export const PALETTE = {
  void: '#0B1016', // ground / page background
  panel: '#111A23', // surfaces
  panelDark: '#0E151D', // top bar, side panels, console
  panelActive: '#16222E', // selected tab / meter track
  border: '#22303F',
  grid: '#152030',
  ink: '#E6EDF3', // text
  steel: '#93A4B5', // muted text
  dim: '#4A5A6B', // line numbers, locked
  cyan: '#3FD0E0', // player, UI
  cyanHover: '#8BE8F2',
  amber: '#FFB547', // enemy, defense
  signal: '#5BE39A', // sensors, goals
  alert: '#FF6B7A', // weapons, damage
  core: '#C792EA', // battery / energy / data cores
  // Arena "test hall" (docs/visual/Arena.dc.html)
  hallFloor: '#0A0E13',
  plateDark: '#0C1117',
  plateA: '#1A232E',
  plateB: '#121920',
  hazardStripe: '#E0A23E',
  wallLight: '#3A4655',
  wallDark: '#232C37',
  wallEdge: '#5B6B7C',
  lavaHot: '#FFE29A',
  lavaMid: '#FF8A3D',
  lavaLow: '#C2340F',
  lavaEdge: '#6E1607',
  water: '#0F2A44',
  waterEdge: '#2F7BBF',
  rough: '#1A1E14',
  roughDot: '#4A5233',
  // Editor syntax (Arena.dc.html code pane)
  synKeyword: '#C792EA',
  synFunction: '#82AAFF',
  synNumber: '#F78C6C',
  synString: '#C3E88D',
  synComment: '#6B7C8D',
  errorLine: '#3A1A20',
} as const;

export const FONTS = {
  display: "'Space Grotesk', sans-serif",
  body: 'Inter, sans-serif',
  mono: "'JetBrains Mono', monospace",
} as const;
