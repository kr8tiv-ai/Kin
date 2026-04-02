// ============================================================================
// KIN API Response Types
// ============================================================================

export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName: string;
  lastName?: string;
  tier: 'free' | 'hatchling' | 'elder' | 'hero';
  email?: string;
  walletAddress?: string;
  authProvider?: string; // 'telegram' | 'google' | 'solana' | comma-separated combo
  createdAt: string;
  onboardingComplete?: boolean;
}

export interface UserPreferences {
  displayName: string | null;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  goals: string[];
  language: string;
  tone: 'friendly' | 'professional' | 'casual' | 'technical';
  privacyMode?: 'private' | 'shared';
  onboardingComplete: boolean;
}

export interface FrontierModelInfo {
  provider: string;
  modelId: string;
  modelName: string;
  contextWindow: number;
}

export interface Companion {
  id: string;
  name: string;
  type: string;
  specialization: string;
  frontierModel?: FrontierModelInfo;
}

export interface UserCompanion {
  id: string;
  companion: Companion;
  claimedAt: string;
  isActive: boolean;
  nftMintAddress?: string;
  bagsTokenId?: string;
}

export interface Conversation {
  id: string;
  companionId: string;
  companionName: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens?: number;
  model?: string;
  provider?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  projectType: string;
  status: 'draft' | 'in_progress' | 'preview' | 'deployed' | 'archived';
  companionId: string;
  previewUrl?: string;
  deployUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingStatus {
  plan: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  usage?: {
    messagesToday: number;
    activeCompanions: number;
    apiCalls: number;
  };
}

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  completedReferrals: number;
  rewardsGranted: number;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  referralCount: number;
}

export interface Memory {
  id: string;
  companionId: string;
  type: 'personal' | 'preference' | 'context' | 'event';
  content: string;
  importance: number;
  createdAt: string;
}

export interface ProgressData {
  xp: number;
  level: number;
  badges: string[];
  currentStreak: number;
  longestStreak: number;
  totalMessages: number;
}

export interface ApiError {
  error: string;
  statusCode?: number;
}

// ============================================================================
// Skills Marketplace
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  sourceType: 'builtin' | 'companion' | 'custom';
  installCount: number;
  isInstalled: boolean;
  isActive: boolean;
}

export interface SkillRequest {
  id: string;
  githubRepoUrl: string;
  skillName?: string;
  status: 'pending' | 'payment_required' | 'paid' | 'reviewing' |
          'approved' | 'installed' | 'rejected';
  rejectionReason?: string;
  amountCents: number;
  createdAt: string;
}

// ============================================================================
// Health Dashboard
// ============================================================================

export interface ServiceStatus {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  label: string;
}

export interface HealthDashboardData {
  overallStatus: 'healthy' | 'degraded' | 'offline';
  lastHeartbeat: string;
  latencyMs: number;
  kinVersion: string;
  services: ServiceStatus[];
  system: {
    cpuUsagePercent: number;
    memUsedMB: number;
    memTotalMB: number;
    diskFreeMB: number;
    uptimeSeconds: number;
  };
  recentEvents: Array<{ service: string; from: string; to: string; timestamp: string }>;
}

// ============================================================================
// Support Chat
// ============================================================================

export interface SupportMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  createdAt: string;
}

export interface SupportChatSession {
  chatId: string | null;
  status: 'active' | 'escalated' | 'resolved' | null;
  messages: SupportMessage[];
}

// ============================================================================
// NFT Skill Portability
// ============================================================================

export interface CompanionSkill {
  id: string;
  companionId: string;
  skillId: string;
  skillName: string;
  skillDisplayName: string;
  skillLevel: number;
  xp: number;
  xpToNextLevel: number;
  isPortable: boolean;
  usageCount: number;
  accruedAt: string;
  lastUsedAt?: string;
}

export interface CompanionSnapshot {
  id: string;
  companionId: string;
  snapshotType: 'skill_state' | 'personality' | 'full' | 'transfer';
  contentHash: string;
  ipfsCid?: string;
  isOnChain: boolean;
  createdAt: string;
}

// ── Soul System ──────────────────────────────────────────────────────────────

export interface SoulTraits {
  warmth: number;
  formality: number;
  humor: number;
  directness: number;
  creativity: number;
  depth: number;
}

export interface SoulStyle {
  vocabulary: 'simple' | 'moderate' | 'advanced';
  responseLength: 'concise' | 'balanced' | 'detailed';
  useEmoji: boolean;
}

export interface SoulConfig {
  customName?: string;
  traits: SoulTraits;
  values: string[];
  style: SoulStyle;
  customInstructions: string;
  boundaries: string[];
  antiPatterns: string[];
}

export interface CompanionSoul {
  id: string;
  companionId: string;
  config: SoulConfig;
  soulHash: string;
  driftScore: number;
  lastCalibratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SOUL_TRAITS: SoulTraits = {
  warmth: 50,
  formality: 50,
  humor: 50,
  directness: 50,
  creativity: 50,
  depth: 50,
};

export const DEFAULT_SOUL_CONFIG: SoulConfig = {
  traits: { ...DEFAULT_SOUL_TRAITS },
  values: [],
  style: { vocabulary: 'moderate', responseLength: 'balanced', useEmoji: true },
  customInstructions: '',
  boundaries: [],
  antiPatterns: [],
};

export interface NftTransfer {
  id: string;
  nftMintAddress: string;
  companionId: string;
  fromUserId: string;
  toUserId?: string;
  skillsTransferred: Array<{ skillId: string; level: number }>;
  transferTxSig?: string;
  createdAt: string;
}

// ============================================================================
// Training Curation
// ============================================================================

export interface TrainingCompanionStats {
  id: string;
  name: string;
  emoji: string;
  totalEntries: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
}

export interface TrainingEntry {
  hash: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  metadata: {
    companionId: string;
    timestamp: string;
    provider: string;
    model: string;
    latencyMs: number;
  };
  verdict: 'pending' | 'approved' | 'rejected';
}

export interface TrainingEntriesResponse {
  entries: TrainingEntry[];
  total: number;
  page: number;
  pageSize: number;
}
