import { FastifyPluginAsync } from 'fastify';

interface SharedCompanion {
  id: string;
  ownerId: string;
  companionId: string;
  name: string;
  description: string;
  downloads: number;
  rating: number;
  createdAt: number;
}

interface CommunityActivity {
  id: string;
  userId: string;
  type: 'companion_shared' | 'project_created' | 'milestone_reached' | 'referral_completed';
  description: string;
  timestamp: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  firstName: string;
  xp: number;
  level: number;
  tier: string;
}

class CommunityStore {
  private sharedCompanions: Map<string, SharedCompanion> = new Map();
  private activities: CommunityActivity[] = [];
  private leaderboard: LeaderboardEntry[] = [];

  shareCompanion(companion: Omit<SharedCompanion, 'id' | 'downloads' | 'rating' | 'createdAt'>): string {
    const id = `shared-${Date.now()}`;
    this.sharedCompanions.set(id, {
      ...companion,
      id,
      downloads: 0,
      rating: 0,
      createdAt: Date.now(),
    });
    this.addActivity({
      id: `act-${Date.now()}`,
      userId: companion.ownerId,
      type: 'companion_shared',
      description: `${companion.name} was shared with the community`,
      timestamp: Date.now(),
    });
    return id;
  }

  getSharedCompanions(limit: number = 20): SharedCompanion[] {
    return Array.from(this.sharedCompanions.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  downloadCompanion(id: string): SharedCompanion | null {
    const companion = this.sharedCompanions.get(id);
    if (companion) {
      companion.downloads++;
      return companion;
    }
    return null;
  }

  addActivity(activity: CommunityActivity): void {
    this.activities.unshift(activity);
    if (this.activities.length > 1000) {
      this.activities = this.activities.slice(0, 1000);
    }
  }

  getRecentActivity(limit: number = 50): CommunityActivity[] {
    return this.activities.slice(0, limit);
  }

  updateLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderboard = entries
      .sort((a, b) => b.xp - a.xp)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  getLeaderboard(limit: number = 100): LeaderboardEntry[] {
    return this.leaderboard.slice(0, limit);
  }
}

let store: CommunityStore | null = null;

function getCommunityStore(): CommunityStore {
  if (!store) {
    store = new CommunityStore();
  }
  return store;
}

const communityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/community/companions', async (request) => {
    const limit = parseInt((request.query as any)?.limit ?? '20', 10);
    const communityStore = getCommunityStore();
    return communityStore.getSharedCompanions(limit);
  });

  fastify.post<{ Body: { companionId: string; name: string; description: string } }>(
    '/community/share',
    async (request) => {
      const userId = (request.user as { userId: string }).userId;
      const { companionId, name, description } = request.body;

      const communityStore = getCommunityStore();
      const shareId = communityStore.shareCompanion({
        ownerId: userId,
        companionId,
        name,
        description,
      });

      return { success: true, shareId };
    }
  );

  fastify.get('/community/activity', async (request) => {
    const limit = parseInt((request.query as any)?.limit ?? '50', 10);
    const communityStore = getCommunityStore();
    return communityStore.getRecentActivity(limit);
  });

  fastify.get('/community/leaderboard', async (request) => {
    const limit = parseInt((request.query as any)?.limit ?? '100', 10);
    const communityStore = getCommunityStore();
    
    if (communityStore.getLeaderboard().length === 0) {
      const mockLeaderboard: LeaderboardEntry[] = [
        { rank: 1, userId: 'user-1', firstName: 'Alex', xp: 15000, level: 25, tier: 'hero' },
        { rank: 2, userId: 'user-2', firstName: 'Jordan', xp: 12000, level: 22, tier: 'elder' },
        { rank: 3, userId: 'user-3', firstName: 'Sam', xp: 9500, level: 18, tier: 'elder' },
      ];
      communityStore.updateLeaderboard(mockLeaderboard);
    }

    return communityStore.getLeaderboard(limit);
  });
};

export default communityRoutes;
