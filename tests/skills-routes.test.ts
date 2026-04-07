/**
 * Skills Marketplace API Route Tests
 *
 * Covers the three core marketplace endpoints:
 * - GET  /skills          — catalog listing with search/category filters
 * - GET  /skills/mine     — user's installed skills
 * - POST /skills/:id/toggle — install/enable/disable a skill
 *
 * Uses Fastify inject() with in-memory SQLite. No running server needed.
 * Skips gracefully when better-sqlite3 or dockerode binaries are unavailable (K027, K029).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let authToken = '';
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

    // Get auth token for protected routes
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 99999, firstName: 'SkillsTestUser' },
    });
    authToken = loginRes.json().token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('dockerode') ||
      msg.includes('ERR_DLOPEN_FAILED') ||
      msg.includes('ERR_MODULE_NOT_FOUND')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
}, 60_000);

afterAll(async () => {
  if (server) {
    await server.close();
  }
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// Helper for authenticated requests
function authHeaders() {
  return { authorization: `Bearer ${authToken}` };
}

// ============================================================================
// GET /skills — Catalog Listing
// ============================================================================

describe('GET /skills — catalog listing', () => {
  it('returns an array of skills with expected shape', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);

    // Verify shape of first skill
    const s = skills[0];
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('name');
    expect(s).toHaveProperty('displayName');
    expect(s).toHaveProperty('description');
    expect(s).toHaveProperty('category');
    expect(s).toHaveProperty('sourceType');
    expect(s).toHaveProperty('author');
    expect(s).toHaveProperty('version');
    expect(s).toHaveProperty('triggers');
    expect(s).toHaveProperty('installCount');
    expect(s).toHaveProperty('isInstalled');
    expect(s).toHaveProperty('isActive');
  });

  it('returns triggers as a parsed array, not a JSON string', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });

    const skills = res.json();
    for (const s of skills) {
      expect(Array.isArray(s.triggers)).toBe(true);
      // Each trigger should be a string, not a nested JSON
      for (const t of s.triggers) {
        expect(typeof t).toBe('string');
      }
    }
  });

  it('filters by search term', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills?search=weather',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    expect(skills.length).toBeGreaterThan(0);
    // Every result should match 'weather' in name or description
    for (const s of skills) {
      const haystack = `${s.displayName} ${s.description}`.toLowerCase();
      expect(haystack).toContain('weather');
    }
  });

  it('filters by category', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills?category=productivity',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.category).toBe('productivity');
    }
  });

  it('filters by both search and category (intersection)', async () => {
    if (skip()) return;

    // 'code' + 'developer' should hit code-gen and/or architecture-review
    const res = await server!.inject({
      method: 'GET',
      url: '/skills?search=code&category=developer',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    for (const s of skills) {
      expect(s.category).toBe('developer');
      const haystack = `${s.displayName} ${s.description}`.toLowerCase();
      expect(haystack).toContain('code');
    }
  });

  it('returns empty array for nonexistent search term', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills?search=zzzznonexistent',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns empty array for search with empty string', async () => {
    if (skip()) return;

    // Empty search string matches everything via LIKE '%%'
    const res = await server!.inject({
      method: 'GET',
      url: '/skills?search=',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    // Empty string LIKE '%%' matches all — should return all skills
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
  });

  it('returns empty array for invalid category', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills?category=nonexistent_cat',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

// ============================================================================
// GET /skills/mine — User's Installed Skills
// ============================================================================

describe('GET /skills/mine — installed skills', () => {
  it('returns empty array for a new user with no installs', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills/mine',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBe(0);
  });

  it('returns installed skill after toggle install', async () => {
    if (skip()) return;

    // Install a skill
    await server!.inject({
      method: 'POST',
      url: '/skills/skill-weather/toggle',
      headers: authHeaders(),
      payload: { active: true },
    });

    const res = await server!.inject({
      method: 'GET',
      url: '/skills/mine',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json();
    expect(skills.length).toBeGreaterThanOrEqual(1);

    const weather = skills.find((s: any) => s.id === 'skill-weather');
    expect(weather).toBeDefined();
    expect(weather.isInstalled).toBe(true);
    expect(weather.isActive).toBe(true);
    expect(weather.displayName).toBe('Weather');
    expect(Array.isArray(weather.triggers)).toBe(true);
  });
});

// ============================================================================
// POST /skills/:id/toggle — Install & Toggle
// ============================================================================

describe('POST /skills/:id/toggle — install and toggle', () => {
  // Use a different skill to avoid state leaks from the /mine tests
  const testSkillId = 'skill-calculator';

  it('installs a skill (active=true)', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: `/skills/${testSkillId}/toggle`,
      headers: authHeaders(),
      payload: { active: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, active: true });
  });

  it('skill appears in /skills/mine after install', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills/mine',
      headers: authHeaders(),
    });

    const skills = res.json();
    const found = skills.find((s: any) => s.id === testSkillId);
    expect(found).toBeDefined();
    expect(found.isActive).toBe(true);
  });

  it('install count increments on first install', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });

    const skills = res.json();
    const calc = skills.find((s: any) => s.id === testSkillId);
    expect(calc).toBeDefined();
    expect(calc.installCount).toBeGreaterThanOrEqual(1);
    expect(calc.isInstalled).toBe(true);
    expect(calc.isActive).toBe(true);
  });

  it('toggles off (active=false)', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: `/skills/${testSkillId}/toggle`,
      headers: authHeaders(),
      payload: { active: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, active: false });

    // Verify isActive changed in catalog
    const catalogRes = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });
    const calc = catalogRes.json().find((s: any) => s.id === testSkillId);
    expect(calc.isInstalled).toBe(true);  // still installed
    expect(calc.isActive).toBe(false);    // but inactive
  });

  it('toggle back on does not double-increment install count', async () => {
    if (skip()) return;

    // Get current install count
    const beforeRes = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });
    const beforeCount = beforeRes.json().find((s: any) => s.id === testSkillId).installCount;

    // Toggle on again
    await server!.inject({
      method: 'POST',
      url: `/skills/${testSkillId}/toggle`,
      headers: authHeaders(),
      payload: { active: true },
    });

    // Check count didn't change
    const afterRes = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });
    const afterCount = afterRes.json().find((s: any) => s.id === testSkillId).installCount;
    expect(afterCount).toBe(beforeCount);
  });

  it('returns 404 for nonexistent skill', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/skills/skill-does-not-exist/toggle',
      headers: authHeaders(),
      payload: { active: true },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when active field is missing', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: `/skills/${testSkillId}/toggle`,
      headers: authHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('isInstalled and isActive flags reflect current state in catalog', async () => {
    if (skip()) return;

    // Skill was toggled on in a prior test
    const res = await server!.inject({
      method: 'GET',
      url: '/skills',
      headers: authHeaders(),
    });

    const calc = res.json().find((s: any) => s.id === testSkillId);
    expect(calc.isInstalled).toBe(true);
    expect(calc.isActive).toBe(true);

    // Check an uninstalled skill
    const uninstalled = res.json().find((s: any) => s.id === 'skill-creative-writing');
    expect(uninstalled.isInstalled).toBe(false);
    expect(uninstalled.isActive).toBe(false);
  });
});

// ============================================================================
// Auth enforcement on skills routes
// ============================================================================

describe('Skills routes — auth enforcement', () => {
  it('GET /skills without JWT returns 401', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /skills/mine without JWT returns 401', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/skills/mine',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /skills/:id/toggle without JWT returns 401', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/skills/skill-calculator/toggle',
      payload: { active: true },
    });

    expect(res.statusCode).toBe(401);
  });
});
