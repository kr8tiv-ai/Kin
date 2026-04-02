#!/usr/bin/env tsx
/**
 * Smoke Test — Quick sanity check that the KIN API starts and responds.
 * Run: npx tsx scripts/smoke.ts
 *
 * Uses Fastify's inject() pattern — no HTTP port needed.
 * All checks run in-process against an in-memory SQLite database.
 */

import { createServer } from '../api/server.js';

// ============================================================================
// Types
// ============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  optional?: boolean;
  detail?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function pass(name: string, detail?: string): CheckResult {
  return { name, passed: true, detail };
}

function fail(name: string, detail?: string, optional = false): CheckResult {
  return { name, passed: false, optional, detail };
}

function printResult(r: CheckResult) {
  const icon = r.passed ? '✓' : r.optional ? '~' : '✗';
  const label = r.optional && !r.passed ? ' (optional)' : '';
  const detail = r.detail ? `  → ${r.detail}` : '';
  console.log(`  ${icon} ${r.name}${label}${detail}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n=== KIN API Smoke Test ===\n');

  // ---------------------------------------------------------------------------
  // Boot server with test configuration
  // Note: dev-login requires environment='development' in auth.ts.
  // We use 'development' here so all test endpoints are available.
  // ---------------------------------------------------------------------------
  let server: Awaited<ReturnType<typeof createServer>>;
  try {
    server = await createServer({
      environment: 'development',
      databasePath: ':memory:',
      jwtSecret: 'smoke-test-secret-not-for-production',
      port: 0, // not actually bound
    });
    console.log('  Server created OK\n');
  } catch (err) {
    console.error('  FATAL: Could not create server:', err);
    process.exit(1);
  }

  const results: CheckResult[] = [];
  let token = '';

  // ---------------------------------------------------------------------------
  // 1. GET /health → 200
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({ method: 'GET', url: '/health' });
    if (res.statusCode === 200) {
      const body = res.json<{ status: string }>();
      results.push(pass('GET /health → 200', `status=${body.status}`));
    } else {
      results.push(fail('GET /health → 200', `got ${res.statusCode}`));
    }
  } catch (err) {
    results.push(fail('GET /health → 200', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 2. POST /auth/dev-login → returns token
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ telegramId: 999001, firstName: 'SmokeTest' }),
    });

    if (res.statusCode === 200) {
      const body = res.json<{ token?: string }>();
      if (body.token) {
        token = body.token;
        results.push(pass('POST /auth/dev-login → token', `token length=${token.length}`));
      } else {
        results.push(fail('POST /auth/dev-login → token', 'no token in response body'));
      }
    } else {
      results.push(fail('POST /auth/dev-login → token', `got ${res.statusCode}: ${res.body}`));
    }
  } catch (err) {
    results.push(fail('POST /auth/dev-login → token', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 3. GET /auth/verify → valid: true
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    if (res.statusCode === 200) {
      const body = res.json<{ valid?: boolean }>();
      if (body.valid === true) {
        results.push(pass('GET /auth/verify → valid: true'));
      } else {
        results.push(fail('GET /auth/verify → valid: true', `valid=${body.valid}`));
      }
    } else {
      results.push(fail('GET /auth/verify → valid: true', `got ${res.statusCode}: ${res.body}`));
    }
  } catch (err) {
    results.push(fail('GET /auth/verify → valid: true', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 4. GET /installer/status → returns installer state shape
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({
      method: 'GET',
      url: '/installer/status',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    if (res.statusCode === 200) {
      const body = res.json<{ status?: string; currentPhase?: string }>();
      if (body.status && body.currentPhase) {
        results.push(
          pass(
            'GET /installer/status → state',
            `status=${body.status}, phase=${body.currentPhase}`,
          ),
        );
      } else {
        results.push(
          fail('GET /installer/status → state', 'missing status/currentPhase'),
        );
      }
    } else {
      results.push(
        fail('GET /installer/status → state', `got ${res.statusCode}: ${res.body}`),
      );
    }
  } catch (err) {
    results.push(fail('GET /installer/status → state', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 5. GET /chat/status → returns providers
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({
      method: 'GET',
      url: '/chat/status',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    if (res.statusCode === 200) {
      const body = res.json<{ providers?: object }>();
      if (body.providers && typeof body.providers === 'object') {
        const providerNames = Object.keys(body.providers).join(', ');
        results.push(pass('GET /chat/status → providers', `providers: ${providerNames}`));
      } else {
        results.push(fail('GET /chat/status → providers', 'no providers key in response'));
      }
    } else {
      results.push(fail('GET /chat/status → providers', `got ${res.statusCode}: ${res.body}`));
    }
  } catch (err) {
    results.push(fail('GET /chat/status → providers', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 6. GET /skills → returns array
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({
      method: 'GET',
      url: '/skills',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    if (res.statusCode === 200) {
      const body = res.json();
      if (Array.isArray(body)) {
        results.push(pass('GET /skills → array', `${body.length} skill(s) returned`));
      } else {
        results.push(fail('GET /skills → array', `expected array, got ${typeof body}`));
      }
    } else {
      results.push(fail('GET /skills → array', `got ${res.statusCode}: ${res.body}`));
    }
  } catch (err) {
    results.push(fail('GET /skills → array', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 6. GET /support/faq → returns array
  // ---------------------------------------------------------------------------
  try {
    const res = await server.inject({
      method: 'GET',
      url: '/support/faq',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    if (res.statusCode === 200) {
      const body = res.json();
      if (Array.isArray(body)) {
        results.push(pass('GET /support/faq → array', `${body.length} FAQ entry/entries returned`));
      } else {
        results.push(fail('GET /support/faq → array', `expected array, got ${typeof body}`));
      }
    } else {
      results.push(fail('GET /support/faq → array', `got ${res.statusCode}: ${res.body}`));
    }
  } catch (err) {
    results.push(fail('GET /support/faq → array', String(err)));
  }

  // ---------------------------------------------------------------------------
  // 7. POST /chat → returns response (OPTIONAL — requires GROQ_API_KEY)
  // ---------------------------------------------------------------------------
  const hasApiKey =
    !!process.env.GROQ_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY;

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/chat',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload: JSON.stringify({
        companionId: 'cipher',
        message: 'Hello! Smoke test ping.',
      }),
    });

    if (res.statusCode === 200) {
      const body = res.json<{ response?: string }>();
      if (body.response) {
        results.push(pass('POST /chat → response', `response length=${body.response.length}`));
      } else {
        results.push(fail('POST /chat → response', 'no response field', true));
      }
    } else {
      const hint = hasApiKey ? '' : ' (no API key configured — expected)';
      results.push(
        fail('POST /chat → response', `got ${res.statusCode}${hint}`, true),
      );
    }
  } catch (err) {
    results.push(fail('POST /chat → response', String(err), true));
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------
  await server.close();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\nResults:');
  results.forEach(printResult);

  const criticalResults = results.filter((r) => !r.optional);
  const optionalResults = results.filter((r) => r.optional);
  const criticalPassed = criticalResults.filter((r) => r.passed).length;
  const optionalPassed = optionalResults.filter((r) => r.passed).length;
  const allCriticalPassed = criticalPassed === criticalResults.length;

  console.log('\n─────────────────────────────────────────');
  console.log(
    `Critical: ${criticalPassed}/${criticalResults.length} passed` +
      (allCriticalPassed ? ' ✓' : ' ✗'),
  );
  if (optionalResults.length > 0) {
    console.log(`Optional: ${optionalPassed}/${optionalResults.length} passed`);
  }
  console.log(
    `\nSummary: ${criticalPassed + optionalPassed}/${results.length} checks passed`,
  );

  if (!allCriticalPassed) {
    console.log('\n[FAIL] One or more critical checks failed.\n');
    process.exit(1);
  } else {
    console.log('\n[PASS] All critical checks passed.\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
