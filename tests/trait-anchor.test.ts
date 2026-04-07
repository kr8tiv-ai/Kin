/**
 * Trait Anchor Integration Tests
 *
 * Tests the snapshot → IPFS pin → chain anchor flow and
 * the GET /nft/:mintAddress/traits query endpoint.
 *
 * Uses Fastify inject() with in-memory SQLite. Mocks pinJSON and
 * anchorHash so no real Pinata/Solana calls are made.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock ipfs-pin and chain-anchor before any imports that pull them in
vi.mock('../api/lib/ipfs-pin.js', () => ({
  pinJSON: vi.fn().mockResolvedValue(null),
}));

vi.mock('../api/lib/chain-anchor.js', () => ({
  anchorHash: vi.fn().mockResolvedValue(null),
}));

let server: FastifyInstance | null = null;
let authToken = '';
let testUserId = '';
let skipReason = '';

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-for-vitest',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Get auth token via dev-login
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 99999, firstName: 'TraitTester' },
    });
    const loginBody = loginRes.json();
    authToken = loginBody.token;
    testUserId = loginBody.user.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('dockerode') ||
      msg.includes('ERR_DLOPEN_FAILED')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
}, 30_000);

afterAll(async () => {
  if (server) await server.close();
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ============================================================================
// Helpers
// ============================================================================

/** Seed a companion_skill row directly for test setup */
function seedSkill(
  companionId: string,
  userId: string,
  skillId: string,
  level: number,
  xp: number,
) {
  const id = `cs-test-${Math.random().toString(36).slice(2, 10)}`;
  server!.context.db.prepare(`
    INSERT INTO companion_skills
      (id, companion_id, user_id, skill_id, skill_level, xp,
       xp_to_next_level, is_portable, usage_count, accrued_at)
    VALUES (?, ?, ?, ?, ?, ?, 300, 1, 5, ?)
  `).run(id, companionId, userId, skillId, level, xp, Date.now());
  return id;
}

/** Seed an nft_ownership row for test setup */
function seedNFT(userId: string, companionId: string, mintAddress: string) {
  const id = `nft-test-${Math.random().toString(36).slice(2, 10)}`;
  server!.context.db.prepare(`
    INSERT INTO nft_ownership (id, user_id, companion_id, mint_address, owner_wallet)
    VALUES (?, ?, ?, ?, 'test-wallet-abc')
  `).run(id, userId, companionId, mintAddress);
  return id;
}

// ============================================================================
// Snapshot Creation + Fire-and-Forget Pin/Anchor
// ============================================================================

describe('POST /companion-skills/snapshot — IPFS pin + chain anchor', () => {
  it('creates a snapshot and returns immediately with null ipfsCid/isOnChain', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.ipfsCid).toBeNull();
    expect(body.isOnChain).toBe(false);
  });

  it('snapshot row gets ipfs_cid updated when pinJSON resolves a CID', async () => {
    if (skip()) return;

    // Import the mocked pinJSON and configure it to return a CID
    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const mockedPin = vi.mocked(pinJSON);
    mockedPin.mockResolvedValueOnce({
      cid: 'QmTestCid123abc',
      gatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmTestCid123abc',
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    const body = res.json();
    const snapshotId = body.id;

    // Immediate response still has null (fire-and-forget hasn't resolved yet)
    expect(body.ipfsCid).toBeNull();

    // Give the async fire-and-forget time to settle
    await new Promise((r) => setTimeout(r, 100));

    // Check DB directly — the async update should have written the CID
    const row = server!.context.db.prepare(
      `SELECT ipfs_cid FROM companion_snapshots WHERE id = ?`,
    ).get(snapshotId) as any;

    expect(row.ipfs_cid).toBe('QmTestCid123abc');
  });

  it('snapshot row gets solana_tx_sig when anchorHash resolves', async () => {
    if (skip()) return;

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const { anchorHash } = await import('../api/lib/chain-anchor.js');
    vi.mocked(pinJSON).mockResolvedValueOnce(null);
    vi.mocked(anchorHash).mockResolvedValueOnce({ txSig: '5xTestTxSig999' });

    const res = await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    const body = res.json();
    const snapshotId = body.id;

    // Wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 100));

    const row = server!.context.db.prepare(
      `SELECT solana_tx_sig, is_on_chain FROM companion_snapshots WHERE id = ?`,
    ).get(snapshotId) as any;

    expect(row.solana_tx_sig).toBe('5xTestTxSig999');
    expect(row.is_on_chain).toBe(1);
  });

  it('snapshot still saved when both pinJSON and anchorHash fail', async () => {
    if (skip()) return;

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const { anchorHash } = await import('../api/lib/chain-anchor.js');
    vi.mocked(pinJSON).mockRejectedValueOnce(new Error('network error'));
    vi.mocked(anchorHash).mockRejectedValueOnce(new Error('rpc down'));

    const res = await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Wait for fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 100));

    // Row exists with null CID/tx
    const row = server!.context.db.prepare(
      `SELECT ipfs_cid, solana_tx_sig, is_on_chain FROM companion_snapshots WHERE id = ?`,
    ).get(body.id) as any;

    expect(row.ipfs_cid).toBeNull();
    expect(row.solana_tx_sig).toBeNull();
    expect(row.is_on_chain).toBe(0);
  });
});

// ============================================================================
// GET /nft/:mintAddress/traits
// ============================================================================

describe('GET /nft/:mintAddress/traits', () => {
  const testMint = 'TestMint' + Math.random().toString(36).slice(2, 10);

  beforeAll(() => {
    if (skipReason) return;

    // Seed NFT ownership + a skill for cipher
    seedNFT(testUserId, 'cipher', testMint);
    seedSkill('cipher', testUserId, 'skill-calculator', 3, 250);
  });

  it('returns skills and snapshot data for a valid mint address', async () => {
    if (skip()) return;

    // Create a snapshot first so latestSnapshot is populated
    await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    const res = await server!.inject({
      method: 'GET',
      url: `/nft/${testMint}/traits`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Top-level shape
    expect(body.companionId).toBe('cipher');
    expect(body.mintAddress).toBe(testMint);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(typeof body.totalSkillLevels).toBe('number');

    // Skills array contains our seeded skill
    const calcSkill = body.skills.find((s: any) => s.skillId === 'skill-calculator');
    expect(calcSkill).toBeDefined();
    expect(calcSkill.skillLevel).toBe(3);
    expect(calcSkill.skillName).toBe('calculator');
    expect(calcSkill.isPortable).toBe(true);

    // Snapshot present
    expect(body.latestSnapshot).toBeDefined();
    expect(body.latestSnapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.latestSnapshot.id).toBeDefined();
    expect(body.latestSnapshot.createdAt).toBeDefined();
  });

  it('returns 404 for nonexistent mint address', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/nft/NonExistentMintAddress12345/traits',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NFT not found');
  });

  it('returns empty skills array when companion has no skills', async () => {
    if (skip()) return;

    // Seed a new NFT for a companion with no skills
    const emptyMint = 'EmptyMint' + Math.random().toString(36).slice(2, 10);
    seedNFT(testUserId, 'mischief', emptyMint);

    const res = await server!.inject({
      method: 'GET',
      url: `/nft/${emptyMint}/traits`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.companionId).toBe('mischief');
    expect(body.skills).toEqual([]);
    expect(body.latestSnapshot).toBeNull();
    expect(body.totalSkillLevels).toBe(0);
  });
});

// ============================================================================
// Negative Tests
// ============================================================================

describe('Negative tests', () => {
  it('POST /companion-skills/snapshot without companionId returns 400', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('snapshot still created when companion has no NFT ownership', async () => {
    if (skip()) return;

    // 'catalyst' has no NFT seeded — snapshot should still work
    const res = await server!.inject({
      method: 'POST',
      url: '/companion-skills/snapshot',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'catalyst' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.contentHash).toBeDefined();
  });
});
