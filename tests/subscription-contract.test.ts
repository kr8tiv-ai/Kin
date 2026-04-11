import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('subscription contract', () => {
  it('keeps OpenAPI aligned with canonical user and skill enums', () => {
    const openApi = JSON.parse(readRepoFile('api/openapi.json'));
    const userTierEnum = openApi.components.schemas.UserProfile.properties.tier.enum;
    const skillSourceEnum = openApi.components.schemas.Skill.properties.sourceType.enum;
    const billingTierEnum =
      openApi.paths['/billing/status'].get.responses['200'].content['application/json'].schema.properties.plan.enum;

    expect(userTierEnum).toEqual(['free', 'hatchling', 'elder', 'hero']);
    expect(skillSourceEnum).toEqual(['builtin', 'companion', 'custom']);
    expect(billingTierEnum).toEqual(['free', 'hatchling', 'elder', 'hero']);
  });

  it('keeps JSON subscription config on the same Stripe secret and plan IDs as the app', () => {
    const subscriptionConfig = JSON.parse(readRepoFile('config/subscription.json'));
    const tiersConfig = JSON.parse(readRepoFile('config/tiers.json'));

    expect(subscriptionConfig.stripe.api_key_env).toBe('STRIPE_SECRET_KEY');
    expect(Object.keys(subscriptionConfig.price_ids)).toEqual(['hatchling', 'elder', 'hero']);
    expect(tiersConfig.tiers.map((tier: { id: string }) => tier.id)).toEqual([
      'free',
      'hatchling',
      'elder',
      'hero',
    ]);
  });

  it('keeps secondary runtimes on the canonical tier vocabulary', () => {
    const pythonStripeClient = readRepoFile('runtime_types/stripe_client.py');
    const creditRoutes = readRepoFile('fleet/credit-routes.ts');

    expect(pythonStripeClient).toContain('STRIPE_SECRET_KEY');
    expect(pythonStripeClient).toContain('"hatchling"');
    expect(pythonStripeClient).toContain('"elder"');
    expect(pythonStripeClient).toContain('"hero"');
    expect(pythonStripeClient).not.toContain('"starter"');
    expect(creditRoutes).toContain("['free', 'hatchling', 'elder', 'hero']");
  });
});
