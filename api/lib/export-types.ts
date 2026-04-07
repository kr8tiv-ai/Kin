/**
 * Export Archive Type Definitions — v1 schema
 *
 * Defines the shape of every data category in the full-state export archive.
 * All interfaces use camelCase keys (K005). Extractors read snake_case DB
 * columns and map to these shapes.
 *
 * @module api/lib/export-types
 */

// ============================================================================
// Per-Category Export Shapes
// ============================================================================

export interface ExportUserProfile {
  id: string;
  telegramId: number | null;
  email: string | null;
  googleId: string | null;
  walletAddress: string | null;
  xId: string | null;
  authProvider: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  tier: string;
  stripeCustomerId: string | null;
  freeUntil: string | null;
  genesisTier: string | null;
  genesisDiscount: number;
  metadata: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportCompanion {
  companionId: string;
  companionName: string;
  companionType: string;
  specialization: string;
  claimedAt: string;
  isActive: boolean;
  nftMintAddress: string | null;
  nftMetadataUri: string | null;
}

export interface ExportPreferences {
  displayName: string | null;
  experienceLevel: string;
  goals: unknown[];
  language: string;
  tone: string;
  privacyMode: string;
  onboardingComplete: boolean;
  setupWizardComplete: boolean;
  deploymentComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportMemory {
  id: string;
  companionId: string;
  memoryType: string;
  content: string;
  importance: number;
  isTransferable: boolean;
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
}

export interface ExportMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  tokensUsed: number | null;
  model: string | null;
  provider: string | null;
}

export interface ExportConversation {
  id: string;
  companionId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ExportMessage[];
}

export interface ExportCustomization {
  companionId: string;
  customName: string | null;
  toneOverride: string | null;
  personalityNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportSoulConfig {
  companionId: string;
  customName: string | null;
  traits: unknown;
  soulValues: unknown[];
  style: unknown;
  customInstructions: string;
  boundaries: unknown[];
  antiPatterns: unknown[];
  soulHash: string | null;
  driftScore: number;
  lastCalibratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportCompanionSkill {
  companionId: string;
  skillId: string;
  skillLevel: number;
  xp: number;
  xpToNextLevel: number;
  isPortable: boolean;
  accruedAt: string;
  lastUsedAt: string | null;
  usageCount: number;
}

export interface ExportUserSkill {
  skillId: string;
  companionId: string | null;
  isActive: boolean;
  installedAt: string;
}

export interface ExportProgress {
  currentStreak: number;
  longestStreak: number;
  totalMessages: number;
  totalProjects: number;
  totalVoiceNotes: number;
  lastActiveDate: string | null;
  level: number;
  xp: number;
  badges: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface ExportTrainingCuration {
  entryHash: string;
  companionId: string;
  verdict: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportCompanionSnapshot {
  id: string;
  companionId: string;
  nftMintAddress: string | null;
  snapshotType: string;
  contentHash: string;
  ipfsCid: string | null;
  solanaTxSig: string | null;
  isOnChain: boolean;
  createdAt: string;
}

// ============================================================================
// File Artifact References
// ============================================================================

export interface FileArtifactRef {
  /** Category: 'training' | 'distill' | 'modelfile' */
  category: string;
  /** Companion ID this artifact belongs to */
  companionId: string;
  /** Relative path within the archive (e.g. training/cipher/training.jsonl) */
  archivePath: string;
  /** Absolute source path on disk */
  sourcePath: string;
  /** File size in bytes, or null if stat fails */
  sizeBytes: number | null;
}

// ============================================================================
// Manifest
// ============================================================================

export interface CategoryCount {
  category: string;
  count: number;
}

export interface ManifestV1 {
  schemaVersion: 1;
  exportedAt: string;
  userId: string;
  categories: CategoryCount[];
  fileArtifacts: FileArtifactRef[];
  errors: ManifestError[];
}

export interface ManifestError {
  category: string;
  message: string;
}

// ============================================================================
// Full Archive Data (all categories in one object)
// ============================================================================

export interface ArchiveCategoryData {
  userProfile: ExportUserProfile | null;
  companions: ExportCompanion[];
  preferences: ExportPreferences | null;
  memories: ExportMemory[];
  conversations: ExportConversation[];
  customizations: ExportCustomization[];
  soulConfigs: ExportSoulConfig[];
  companionSkills: ExportCompanionSkill[];
  userSkills: ExportUserSkill[];
  progress: ExportProgress | null;
  trainingCuration: ExportTrainingCuration[];
  companionSnapshots: ExportCompanionSnapshot[];
}
