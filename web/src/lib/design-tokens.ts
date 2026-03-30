// ============================================================================
// KIN Design Tokens — Shared constants matching KIN NFT site
// Single source of truth for both web app and NFT site styling.
// ============================================================================

// --- Colors ----------------------------------------------------------------

export const COLORS = {
  bg: '#000000',
  surface: '#0A0A0A',
  surfaceHover: '#141414',

  // Accent tri-color system
  cyan: '#00F0FF',
  magenta: '#FF00AA',
  gold: '#FFD700',

  // Text
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.7)',
  textSubtle: 'rgba(255,255,255,0.5)',
  textFaint: 'rgba(255,255,255,0.3)',

  // Borders
  border: 'rgba(255,255,255,0.1)',
  borderSubtle: 'rgba(255,255,255,0.06)',

  // Component backgrounds
  cyanBg: 'rgba(0,229,255,0.06)',
  magentaBg: 'rgba(255,0,170,0.06)',
  goldBg: 'rgba(255,184,0,0.08)',
  glassBg: 'rgba(255,255,255,0.02)',
} as const;

// --- Layout ----------------------------------------------------------------

export const LAYOUT = {
  maxContentWidth: 900,
  panelWidth: 425,
  cardPadding: 30,
  topPadding: '8rem',

  // Responsive breakpoints
  breakpoints: {
    mobile: 480,
    tablet: 768,
    desktop: 1024,
  },
} as const;

// --- Border Radii ----------------------------------------------------------

export const RADII = {
  sm: 12,
  md: 20,
  lg: 24,
  pill: 100,
} as const;

// --- Glow Effects ----------------------------------------------------------

export const GLOWS = {
  cyan: '0 0 30px rgba(0,240,255,0.3)',
  cyanStrong: '0 0 40px rgba(0,240,255,0.5)',
  magenta: '0 0 30px rgba(255,0,170,0.3)',
  magentaStrong: '0 0 40px rgba(255,0,170,0.5)',
  gold: '0 0 30px rgba(255,215,0,0.3)',
  goldStrong: '0 0 40px rgba(255,215,0,0.5)',
} as const;

// --- Companion Tier Colors -------------------------------------------------

export const TIER_COLORS = {
  egg: { accent: COLORS.gold, bg: COLORS.goldBg, glow: GLOWS.gold },
  hatchling: { accent: COLORS.cyan, bg: COLORS.cyanBg, glow: GLOWS.cyan },
  elder: { accent: COLORS.magenta, bg: COLORS.magentaBg, glow: GLOWS.magenta },
} as const;

// --- Animations ------------------------------------------------------------

export const ANIMATIONS = {
  fast: '150ms',
  normal: '300ms',
  slow: '500ms',
  easeOut: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
} as const;
