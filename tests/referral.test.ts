/**
 * Referral Route Integration Tests
 *
 * Tests all 4 referral endpoints: GET /referral, POST /referral/generate,
 * POST /referral/redeem, GET /referral/leaderboard.
 *
 * Uses Fastify inject() with in-memory SQLite — no running server needed.
 * Skips gracefully if better-sqlite3 native module is unavailable (K019).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let skipReason = '';

// Two users: referrer and referred
let referrerToken = '';
let referrerUserId = '';
let referredToken = '';
let referredUserId = '';

// Shared state across ordered tests
let generatedCode = '';

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

    // Create referrer user via dev-login
    const referrerRes = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 90001, firstName: 'Alice' },
    });
    const referrerBody = referrerRes.json();
    referrerToken = referrerBody.token;
    referrerUserId = referrerBody.user.id;

    // Create referred user via dev-login
    const referredRes = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 90002, firstName: 'Bob' },
    });
    const referredBody = referredRes.json();
    referredToken = referredBody.token;
    referredUserId = referredBody.user.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('ERR_DLOPEN_FAILED') ||
      msg.includes('dockerode')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
});

afterAll(async () => {
  if (server) {
    await server.close();
  }
});

/** Returns true (and the test should early-return) when native deps are missing. */
function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ============================================================================
// GET /referral — fresh user (no code yet)
// ============================================================================

describe('Referral Routes', () => {
  it('GET /referral returns null code for a fresh user', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/referral',
      headers: { authorization: `Bearer ${referrerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.referralCode).toBeNull();
    expect(body.totalReferrals).toBe(0);
    expect(body.completedReferrals).toBe(0);
    expect(body.rewardsGranted).toBe(0);
    expect(body.createdAt).toBeNull();
  });

  // ==========================================================================
  // POST /referral/generate — create a new code
  // ==========================================================================

  it('POST /referral/generate creates a code and returns isNew: true', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/generate',
      headers: { authorization: `Bearer ${referrerToken}` },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.referralCode).toBeDefined();
    expect(typeof body.referralCode).toBe('string');
    expect(body.referralCode.length).toBe(8);
    expect(body.isNew).toBe(true);

    generatedCode = body.referralCode;
  });

  // ==========================================================================
  // POST /referral/generate — idempotent retry
  // ==========================================================================

  it('POST /referral/generate is idempotent, returns same code with isNew: false', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/generate',
      headers: { authorization: `Bearer ${referrerToken}` },
    });

    // Idempotent call returns 200 (not 201)
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.referralCode).toBe(generatedCode);
    expect(body.isNew).toBe(false);
  });

  // ==========================================================================
  // GET /referral — after generate, code is present
  // ==========================================================================

  it('GET /referral returns stats with the code after generation', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/referral',
      headers: { authorization: `Bearer ${referrerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.referralCode).toBe(generatedCode);
    expect(body.totalReferrals).toBe(0);
    expect(body.completedReferrals).toBe(0);
    expect(body.rewardsGranted).toBe(0);
    expect(body.createdAt).toBeDefined();
    // createdAt should be a valid ISO date string
    expect(new Date(body.createdAt).getTime()).toBeGreaterThan(0);
  });

  // ==========================================================================
  // POST /referral/redeem — self-referral blocked
  // ==========================================================================

  it('POST /referral/redeem rejects self-referral with 400', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/redeem',
      headers: { authorization: `Bearer ${referrerToken}` },
      payload: { code: generatedCode },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toMatch(/own referral/i);
  });

  // ==========================================================================
  // POST /referral/redeem — invalid code
  // ==========================================================================

  it('POST /referral/redeem returns 404 for invalid code', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/redeem',
      headers: { authorization: `Bearer ${referredToken}` },
      payload: { code: 'ZZZZZZZZ' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toMatch(/not found/i);
  });

  // ==========================================================================
  // POST /referral/redeem — successful redemption
  // ==========================================================================

  it('POST /referral/redeem succeeds for a valid code from another user', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/redeem',
      headers: { authorization: `Bearer ${referredToken}` },
      payload: { code: generatedCode },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/redeemed/i);
    expect(body.referrerId).toBe(referrerUserId);
    expect(body.rewards).toBeDefined();
    expect(body.rewards.referrerBonus).toMatch(/7 free days/i);
    expect(body.rewards.referredBonus).toMatch(/3 free days/i);
  });

  // ==========================================================================
  // POST /referral/redeem — double-redeem blocked
  // ==========================================================================

  it('POST /referral/redeem returns 409 on double-redeem', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/redeem',
      headers: { authorization: `Bearer ${referredToken}` },
      payload: { code: generatedCode },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toMatch(/already redeemed/i);
  });

  // ==========================================================================
  // Verify free_until is set on both users after redemption
  // ==========================================================================

  it('free_until is set on both users after successful redemption', async () => {
    if (skip()) return;

    // Check referrer via /auth/verify
    const referrerVerify = await server!.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${referrerToken}` },
    });
    expect(referrerVerify.statusCode).toBe(200);
    const referrerBody = referrerVerify.json();
    expect(referrerBody.valid).toBe(true);
    expect(referrerBody.user.freeUntil).toBeDefined();
    expect(referrerBody.user.freeUntil).not.toBeNull();
    // Referrer gets 7 days — freeUntil should be ~7 days from now
    const referrerFreeUntil = new Date(referrerBody.user.freeUntil);
    const now = new Date();
    const daysDiffReferrer = (referrerFreeUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiffReferrer).toBeGreaterThan(6);
    expect(daysDiffReferrer).toBeLessThan(8);

    // Check referred user via /auth/verify
    const referredVerify = await server!.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${referredToken}` },
    });
    expect(referredVerify.statusCode).toBe(200);
    const referredBody = referredVerify.json();
    expect(referredBody.valid).toBe(true);
    expect(referredBody.user.freeUntil).toBeDefined();
    expect(referredBody.user.freeUntil).not.toBeNull();
    // Referred user gets 3 days
    const referredFreeUntil = new Date(referredBody.user.freeUntil);
    const daysDiffReferred = (referredFreeUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiffReferred).toBeGreaterThan(2);
    expect(daysDiffReferred).toBeLessThan(4);
  });

  // ==========================================================================
  // GET /referral — stats updated after redemption
  // ==========================================================================

  it('GET /referral shows updated stats after redemption', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/referral',
      headers: { authorization: `Bearer ${referrerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.referralCode).toBe(generatedCode);
    expect(body.totalReferrals).toBe(1);
    expect(body.completedReferrals).toBe(1);
    expect(body.rewardsGranted).toBe(1);
  });

  // ==========================================================================
  // GET /referral/leaderboard — sorted list with anonymized names
  // ==========================================================================

  it('GET /referral/leaderboard returns sorted list with anonymized names', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/referral/leaderboard',
      headers: { authorization: `Bearer ${referrerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.leaderboard).toBeDefined();
    expect(Array.isArray(body.leaderboard)).toBe(true);
    expect(body.leaderboard.length).toBeGreaterThanOrEqual(1);

    const top = body.leaderboard[0];
    expect(top.rank).toBe(1);
    expect(top.displayName).toBe('Alice'); // dev-login only provides firstName, no lastName
    expect(top.referralCount).toBe(1);
  });

  // ==========================================================================
  // Auth enforcement — referral routes require JWT
  // ==========================================================================

  it('GET /referral without JWT returns 401', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/referral',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /referral/generate without JWT returns 401', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/referral/generate',
    });

    expect(res.statusCode).toBe(401);
  });
});
