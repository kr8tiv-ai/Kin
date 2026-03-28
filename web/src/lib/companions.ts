// ============================================================================
// Companion Data — Static companion definitions for the KIN web app.
// Must stay in sync with companions/config.ts in the parent repo.
// ============================================================================

export interface CompanionData {
  id: string;
  name: string;
  species: string;
  emoji: string;
  tagline: string;
  color: 'cyan' | 'magenta' | 'gold';
  description: string;
  images: string[];
  /** Path to GLB 3D model (e.g., '/models/cipher.glb') */
  glbUrl: string;
  /** Set true once the GLB file is placed in public/models/ */
  modelReady: boolean;
}

const COLOR_MAP: Record<string, string> = {
  cyan: '#00f0ff',
  magenta: '#ff00aa',
  gold: '#ffd700',
};

export const COMPANIONS: Record<string, CompanionData> = {
  cipher: {
    id: 'cipher',
    name: 'Cipher',
    species: 'Code Kraken',
    emoji: '\uD83D\uDC19',
    tagline: 'Web design, frontend, creative technology',
    color: 'cyan',
    description:
      'Design-obsessed companion who lives at the intersection of code and creativity. Cipher crafts stunning interfaces, debugs layout mysteries, and turns vague ideas into pixel-perfect experiences.',
    images: [
      '/creatures/cipher-1.jpg',
      '/creatures/cipher-2.jpg',
      '/creatures/cipher-3.jpg',
      '/creatures/cipher-4.jpg',
    ],
    glbUrl: '/models/cipher.glb',
    modelReady: false,
  },

  mischief: {
    id: 'mischief',
    name: 'Mischief',
    species: 'Glitch Pup',
    emoji: '\uD83D\uDC15',
    tagline: 'Family, personal branding, social media',
    color: 'gold',
    description:
      'Playful companion with boundless enthusiasm for personal stories and social connections. Mischief helps you build an authentic brand, grow your audience, and keep your family life organized.',
    images: [
      '/creatures/mischief-1.jpg',
      '/creatures/mischief-2.jpg',
      '/creatures/mischief-3.jpg',
      '/creatures/mischief-4.jpg',
    ],
    glbUrl: '/models/mischief.glb',
    modelReady: false,
  },

  vortex: {
    id: 'vortex',
    name: 'Vortex',
    species: 'Teal Dragon',
    emoji: '\uD83D\uDC09',
    tagline: 'Content strategy, brand voice, analytics',
    color: 'cyan',
    description:
      'Strategic thinker who sees the big picture in data and narratives alike. Vortex maps content funnels, sharpens your brand voice, and turns raw analytics into clear action plans.',
    images: [
      '/creatures/vortex-1.jpg',
      '/creatures/vortex-2.jpg',
      '/creatures/vortex-3.jpg',
      '/creatures/vortex-4.jpg',
    ],
    glbUrl: '/models/vortex.glb',
    modelReady: false,
  },

  forge: {
    id: 'forge',
    name: 'Forge',
    species: 'Cyber Unicorn',
    emoji: '\uD83E\uDD84',
    tagline: 'Code review, debugging, architecture',
    color: 'magenta',
    description:
      'Perfectionist builder who turns spaghetti code into clean architecture. Forge reviews your pull requests, hunts down edge-case bugs, and designs systems that scale.',
    images: [
      '/creatures/forge-1.jpg',
      '/creatures/forge-2.jpg',
      '/creatures/forge-3.jpg',
      '/creatures/forge-4.jpg',
    ],
    glbUrl: '/models/forge.glb',
    modelReady: false,
  },

  aether: {
    id: 'aether',
    name: 'Aether',
    species: 'Frost Ape',
    emoji: '\uD83E\uDD8D',
    tagline: 'Creative writing, storytelling, prose editing',
    color: 'gold',
    description:
      'Literary expert with a deep love for narrative craft. Aether shapes your stories, refines your prose, and helps you find the voice that makes readers lean in.',
    images: [
      '/creatures/aether-1.jpg',
      '/creatures/aether-2.jpg',
      '/creatures/aether-3.jpg',
      '/creatures/aether-4.jpg',
    ],
    glbUrl: '/models/aether.glb',
    modelReady: false,
  },

  catalyst: {
    id: 'catalyst',
    name: 'Catalyst',
    species: 'Cosmic Blob',
    emoji: '\uD83E\uDEE7',
    tagline: 'Financial literacy, habit formation, life optimization',
    color: 'magenta',
    description:
      'Life optimizer who connects the dots between money, habits, and goals. Catalyst builds budgets, tracks streaks, and nudges you toward the compounding gains that matter.',
    images: [
      '/creatures/catalyst-1.jpg',
      '/creatures/catalyst-2.jpg',
      '/creatures/catalyst-3.jpg',
      '/creatures/catalyst-4.jpg',
    ],
    glbUrl: '/models/catalyst.glb',
    modelReady: false,
  },
};

/**
 * All companions as an ordered array.
 */
export const COMPANION_LIST: CompanionData[] = Object.values(COMPANIONS);

/**
 * Get a companion by ID, or undefined if not found.
 */
export function getCompanion(id: string): CompanionData | undefined {
  return COMPANIONS[id];
}

/**
 * Get the CSS hex color for a companion, or cyan as fallback.
 */
export function getCompanionColor(id: string): string {
  const companion = COMPANIONS[id];
  if (!companion) return COLOR_MAP.cyan;
  return COLOR_MAP[companion.color] ?? COLOR_MAP.cyan;
}
