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
  authProvider?: string;
  createdAt: string;
  onboardingComplete?: boolean;
  setupWizardComplete?: boolean;
  deploymentComplete?: boolean;
  freeUntil?: string | null;
}

export interface UserPreferences {
  displayName: string | null;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  goals: string[];
  language: string;
  tone: 'friendly' | 'professional' | 'casual' | 'technical';
  privacyMode?: 'private' | 'shared';
  proactiveEnabled?: boolean;
  onboardingComplete: boolean;
}

// ============================================================================
// Proactive Companion
// ============================================================================

export interface ProactiveSettings {
  proactiveEnabled: boolean;
  quietStart: number | null;
  quietEnd: number | null;
  maxDaily: number;
  channels: string[];
  calendarConnected: boolean;
}

export interface ProactiveSuggestion {
  id: string;
  companionId: string;
  content: string;
  deliveryChannel: string;
  status: string;
  userFeedback: string | null;
  createdAt: string;
  deliveredAt: string | null;
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

export interface StarterConversation {
  conversationId: string;
  companionId: string;
  companionName: string;
  welcomeMessage: string;
  suggestedReplies: string[];
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
  files?: Record<string, unknown> | null;
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
// Installer Runtime
// ============================================================================

export type InstallerRuntimeStatus =
  | 'idle'
  | 'running'
  | 'waiting-confirmation'
  | 'failed'
  | 'complete';

export interface InstallerPendingAction {
  id: string;
  description: string;
  scope: 'local' | 'external';
  risk: 'safe' | 'destructive' | 'account';
}

export interface InstallerStatusResponse {
  runId: string;
  status: InstallerRuntimeStatus;
  currentPhase: string;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  pendingAction: InstallerPendingAction | null;
  blockedPhase: string | null;
  startedAt: number;
  updatedAt: number;
  phaseHistory: Array<{
    phase: string;
    result: 'ok' | 'failed' | 'blocked';
    timestamp: number;
    error?: string;
  }>;
  allowedRecoveryActions: string[];
}

export type SetupWizardStepStatus = 'ready' | 'needs-attention' | 'not-configured';

export interface SetupWizardStep {
  id: 'keys' | 'telegram' | 'discord' | 'whatsapp';
  label: string;
  message: string;
  status: SetupWizardStepStatus;
  blocking: boolean;
  reasonCode: string | null;
  nextActions: string[];
}

export interface SetupWizardStatusResponse {
  steps: SetupWizardStep[];
  completion: {
    persisted: boolean;
    eligible: boolean;
    reason: string | null;
  };
  isComplete: boolean;
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
  author: string;
  version: string;
  triggers: string[];
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

// ============================================================================
// NFT Rebinding
// ============================================================================

export interface RebindingStatus {
  rebindingId: string;
  status: 'pending_payment' | 'processing' | 'pending_onboarding' | 'complete' | 'failed';
  companionId: string;
  fromUserId: string;
  toUserId: string | null;
  createdAt: string;
  completedAt: string | null;
}

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
// Trait Verification (IPFS + On-Chain)
// ============================================================================

export interface TraitSkill {
  skillId: string;
  skillName: string;
  skillDisplayName: string;
  skillCategory: string;
  skillLevel: number;
  xp: number;
  xpToNextLevel: number;
  isPortable: boolean;
  usageCount: number;
  accruedAt: string;
  lastUsedAt: string | null;
}

export interface TraitSnapshot {
  id: string;
  contentHash: string;
  ipfsCid: string | null;
  solanaTxSig: string | null;
  isOnChain: boolean;
  createdAt: string;
}

export interface TraitResponse {
  companionId: string;
  mintAddress: string;
  skills: TraitSkill[];
  latestSnapshot: TraitSnapshot | null;
  totalSkillLevels: number;
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

// ============================================================================
// Completion Gate Status
// ============================================================================

export interface CompletionGate {
  id: string;
  label: string;
  ready: boolean;
  description: string;
  recoveryActions: string[];
}

export interface CompletionProgress {
  completedGates: number;
  totalGates: number;
  summary: string;
}

export interface CompletionStatusResponse {
  gates: CompletionGate[];
  progress: CompletionProgress;
  overallComplete: boolean;
  blockingReasons: string[];
  nextActions: string[];
}

// ============================================================================
// Fleet Dashboard
// ============================================================================

export interface ContainerResourceUsage {
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
}

export interface FleetInstanceResponse {
  id: string;
  userId: string;
  subdomain: string;
  status: 'provisioning' | 'running' | 'stopped' | 'error' | 'removing';
  apiContainerId: string | null;
  webContainerId: string | null;
  apiPort: number | null;
  webPort: number | null;
  resourceLimits: { cpuShares: number; memoryMb: number };
  healthCheck: {
    lastCheckAt: number | null;
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastError: string | null;
  };
  lastError: string | null;
  tunnelId: string | null;
  tunnelStatus: 'unconfigured' | 'provisioned' | 'connected' | 'disconnected';
  lastActivityAt: number | null;
  createdAt: number;
  updatedAt: number;
  resourceUsage?: {
    api: ContainerResourceUsage | null;
    web: ContainerResourceUsage | null;
  };
}

export interface FleetStatusResponse {
  totalInstances: number;
  running: number;
  stopped: number;
  error: number;
  provisioning: number;
  removing: number;
  instances: FleetInstanceResponse[];
  lastUpdated: number;
}

export interface FleetCreditSummaryResponse {
  totalUsers: number;
  totalBalanceUsd: number;
  byTier: Record<string, { count: number; totalBalanceUsd: number }>;
}

export interface CreditBalanceResponse {
  userId: string;
  balanceUsd: number;
  tier: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Migration / Import Archive
// ============================================================================

export interface ImportCategoryResult {
  category: string;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface FileArtifactResult {
  restored: number;
  failed: number;
  errors: string[];
}

export interface ModelRestorationResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export interface ImportArchiveResult {
  success: boolean;
  manifestVersion: number;
  categories: ImportCategoryResult[];
  totalImported: number;
  totalSkipped: number;
  totalErrors: number;
  durationMs: number;
  fileArtifacts: FileArtifactResult;
  modelRestoration: ModelRestorationResult;
}

// ============================================================================
// Revenue Reports & Distributions
// ============================================================================

export interface RevenueReport {
  id: string;
  periodStart: number;   // epoch ms
  periodEnd: number;     // epoch ms
  subscriptionRevenue: number;  // cents
  mintRevenue: number;
  rebindingRevenue: number;
  totalRevenue: number;
  surplusAllocated: number;
  status: string;
  createdAt: number;     // epoch ms
  distributions?: RevenueDistribution[];
}

export interface RevenueDistribution {
  id: string;
  reportId: string;
  userId: string;
  genesisTier: string;
  rewardPercent: number;
  amount: number;        // cents
  createdAt: number;     // epoch ms
}

// ============================================================================
// Family Mode
// ============================================================================

export interface FamilyMember {
  memberId: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  role: 'parent' | 'child' | 'member';
  joinedAt: number;
  messageCount: number;
  lastActive: number | null;
  ageBracket?: 'under_13' | 'teen' | null;
}

export interface FamilyGroup {
  familyGroupId: string;
  familyName: string;
  createdBy: string;
  createdAt: number;
  myRole: 'parent' | 'child' | 'member';
  members: FamilyMember[];
}

export interface FamilyCreateResponse {
  familyGroupId: string;
  name: string;
  role: string;
  createdAt: number;
}

export interface FamilyInviteResponse {
  code: string;
  expiresAt: number;
}

export interface ChildAccountResponse {
  childUserId: string;
  firstName: string;
  ageBracket: string;
  role: string;
  familyGroupId: string;
  contentFilterLevel: string;
  token: string;
  createdAt: number;
}

export interface SharedMemory {
  id: string;
  userId: string;
  companionId: string;
  memoryType: string;
  content: string;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  authorFirstName: string;
}

export interface SharedMemoriesResponse {
  familyGroupId: string;
  memories: SharedMemory[];
}

export interface FamilyActivityMember {
  userId: string;
  firstName: string;
  role: string;
  ageBracket: string | null;
  messageCount: number;
  lastActive: number | null;
  topicKeywords: string[];
}

export interface FamilyActivityResponse {
  familyGroupId: string;
  members: FamilyActivityMember[];
}
