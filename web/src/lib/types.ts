// ============================================================================
// KIN API Response Types
// ============================================================================

export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName: string;
  lastName?: string;
  tier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

export interface Companion {
  id: string;
  name: string;
  type: string;
  specialization: string;
}

export interface UserCompanion {
  id: string;
  companion: Companion;
  claimedAt: string;
  isActive: boolean;
  nftMintAddress?: string;
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
