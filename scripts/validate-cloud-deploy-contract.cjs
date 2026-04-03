#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const PROVIDER_MANIFESTS = {
  railway: {
    file: 'railway.toml',
    label: 'Railway',
    structureChecks: [
      {
        field: '[deploy]',
        pattern: /^\[deploy\]/m,
        expected: '[deploy] block',
      },
      {
        field: 'deploy.healthcheckPath',
        pattern: /healthcheckPath\s*=\s*['"]\/health['"]/,
        expected: 'healthcheckPath = "/health"',
      },
    ],
  },
  render: {
    file: 'render.yaml',
    label: 'Render',
    structureChecks: [
      {
        field: 'services',
        pattern: /^services:\s*$/m,
        expected: 'top-level services block',
      },
      {
        field: 'services.kin-api.healthCheckPath',
        pattern: /name:\s*kin-api[\s\S]*?healthCheckPath:\s*\/health/m,
        expected: 'kin-api service with healthCheckPath: /health',
      },
      {
        field: 'services.kin-web',
        pattern: /name:\s*kin-web/m,
        expected: 'kin-web service declaration',
      },
      {
        field: 'services.kin-inference',
        pattern: /name:\s*kin-inference/m,
        expected: 'kin-inference service declaration',
      },
    ],
  },
  fly: {
    file: 'fly.toml',
    label: 'Fly.io',
    structureChecks: [
      {
        field: '[build]',
        pattern: /^\[build\]/m,
        expected: '[build] block',
      },
      {
        field: 'http_service.checks.path',
        pattern: /\[\[http_service\.checks\]\][\s\S]*?path\s*=\s*['"]\/health['"]/m,
        expected: '[[http_service.checks]] path = "/health"',
      },
    ],
  },
  coolify: {
    file: 'docker-compose.coolify.yml',
    label: 'Coolify',
    structureChecks: [
      {
        field: 'services',
        pattern: /^services:\s*$/m,
        expected: 'top-level services block',
      },
      {
        field: 'services.api',
        pattern: /^\s{2}api:\s*$/m,
        expected: 'api service declaration',
      },
      {
        field: 'services.web',
        pattern: /^\s{2}web:\s*$/m,
        expected: 'web service declaration',
      },
      {
        field: 'services.inference',
        pattern: /^\s{2}inference:\s*$/m,
        expected: 'inference service declaration',
      },
      {
        field: 'services.api.healthcheck.test',
        pattern: /healthcheck:[\s\S]*?\/health/m,
        expected: 'api healthcheck command targeting /health',
      },
    ],
  },
};

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRoot(inputRoot) {
  if (!inputRoot) {
    return DEFAULT_REPO_ROOT;
  }

  return path.resolve(inputRoot);
}

function stripHashCommentLines(content) {
  return content
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function createReporter() {
  const failures = [];
  const seenFailures = new Set();

  return {
    fail(message) {
      if (!seenFailures.has(message)) {
        failures.push(message);
        seenFailures.add(message);
      }
    },
    getFailures() {
      return failures;
    },
  };
}

function readFileOrFail(rootDir, relativePath, scope, report) {
  const fullPath = path.join(rootDir, relativePath);

  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    report.fail(`[${scope}] ${relativePath} unreadable: ${error.message}`);
    return null;
  }
}

function parseCloudDeployContract(cloudContractSource, report) {
  const canonicalHealthMatch = cloudContractSource.match(
    /export const CANONICAL_CLOUD_HEALTH_PATH\s*=\s*['"]([^'"]+)['"]\s*;/,
  );
  const legacyHealthMatch = cloudContractSource.match(
    /export const LEGACY_CLOUD_HEALTH_PATH\s*=\s*['"]([^'"]+)['"]\s*;/,
  );

  if (!canonicalHealthMatch) {
    report.fail(
      '[contract] scripts/cloud-deploy-contract.ts missing export CANONICAL_CLOUD_HEALTH_PATH = "...".',
    );
  }

  if (!legacyHealthMatch) {
    report.fail(
      '[contract] scripts/cloud-deploy-contract.ts missing export LEGACY_CLOUD_HEALTH_PATH = "...".',
    );
  }

  const providersBlockMatch = cloudContractSource.match(
    /export const CLOUD_DEPLOY_PROVIDERS[\s\S]*?=\s*\[([\s\S]*?)\];/,
  );

  if (!providersBlockMatch) {
    report.fail(
      '[contract] scripts/cloud-deploy-contract.ts missing CLOUD_DEPLOY_PROVIDERS array export.',
    );
    return {
      providerIds: [],
      canonicalHealthPath: canonicalHealthMatch ? canonicalHealthMatch[1] : '/health',
      legacyHealthPath: legacyHealthMatch ? legacyHealthMatch[1] : '/health/live',
    };
  }

  const providerIds = [...providersBlockMatch[1].matchAll(/id:\s*'([^']+)'/g)].map(
    (entry) => entry[1],
  );

  if (!providerIds.length) {
    report.fail('[contract] scripts/cloud-deploy-contract.ts has no parseable provider ids.');
  }

  return {
    providerIds,
    canonicalHealthPath: canonicalHealthMatch ? canonicalHealthMatch[1] : '/health',
    legacyHealthPath: legacyHealthMatch ? legacyHealthMatch[1] : '/health/live',
  };
}

function parseGhcrContract(ghcrContractSource, report) {
  const servicesBlockMatch = ghcrContractSource.match(
    /export const GHCR_SERVICES:[\s\S]*?=\s*\[([\s\S]*?)\];/,
  );

  if (!servicesBlockMatch) {
    report.fail('[contract] scripts/ghcr-contract.ts missing GHCR_SERVICES export block.');
    return [];
  }

  const services = [...servicesBlockMatch[1].matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*image:\s*'([^']+)'\s*\}/g)].map(
    (entry) => ({
      id: entry[1],
      image: entry[2],
    }),
  );

  if (!services.length) {
    report.fail('[contract] scripts/ghcr-contract.ts GHCR_SERVICES has no parseable entries.');
    return [];
  }

  return services;
}

function assertProviderSet(contractProviderIds, report) {
  const expectedProviderIds = Object.keys(PROVIDER_MANIFESTS);

  for (const providerId of expectedProviderIds) {
    if (!contractProviderIds.includes(providerId)) {
      report.fail(
        `[contract] scripts/cloud-deploy-contract.ts CLOUD_DEPLOY_PROVIDERS missing id '${providerId}'.`,
      );
    }
  }

  for (const providerId of contractProviderIds) {
    if (!expectedProviderIds.includes(providerId)) {
      report.fail(
        `[contract] scripts/cloud-deploy-contract.ts defines unsupported provider '${providerId}' (expected only railway/render/fly/coolify).`,
      );
    }
  }
}

function assertManifestStructure(providerId, content, report) {
  const manifest = PROVIDER_MANIFESTS[providerId];
  const configContent = stripHashCommentLines(content);

  for (const check of manifest.structureChecks) {
    if (!check.pattern.test(configContent)) {
      report.fail(
        `[${providerId}] ${manifest.file} ${check.field} drift: expected ${check.expected}.`,
      );
    }
  }
}

function assertCanonicalHealth(providerId, content, canonicalHealthPath, legacyHealthPath, report) {
  const manifest = PROVIDER_MANIFESTS[providerId];
  const configContent = stripHashCommentLines(content);

  if (configContent.includes(legacyHealthPath)) {
    report.fail(
      `[${providerId}] ${manifest.file} references legacy health path '${legacyHealthPath}' (expected '${canonicalHealthPath}').`,
    );
  }

  if (!configContent.includes(canonicalHealthPath)) {
    report.fail(
      `[${providerId}] ${manifest.file} missing canonical health path '${canonicalHealthPath}'.`,
    );
  }
}

function assertGhcrReferences(providerId, content, ghcrServices, report) {
  const manifest = PROVIDER_MANIFESTS[providerId];
  const targetContent = providerId === 'railway' ? content : stripHashCommentLines(content);

  for (const service of ghcrServices) {
    const imageRefPattern = new RegExp(
      `ghcr\\.io\\/[^\\s\"'\\/]+\\/${escapeRegex(service.image)}:[^\\s\"']+`,
      'i',
    );

    if (!imageRefPattern.test(targetContent)) {
      report.fail(
        `[${providerId}] ${manifest.file} image contract drift for service '${service.id}': expected ghcr.io/<owner>/${service.image}:<tag>.`,
      );
    }
  }
}

function assertReadmeOneClick(readmeSource, report) {
  const headingPattern = /^#{2,3}\s+One-Click Cloud Deploy Paths\s*$/m;

  if (!headingPattern.test(readmeSource)) {
    report.fail("[docs] README.md missing 'One-Click Cloud Deploy Paths' section.");
    return;
  }

  const oneClickLinePattern = /one-click/i;
  if (!oneClickLinePattern.test(readmeSource)) {
    report.fail('[docs] README.md missing explicit "one-click" wording for cloud paths.');
  }

  for (const [providerId, provider] of Object.entries(PROVIDER_MANIFESTS)) {
    const providerPattern = new RegExp(
      `${escapeRegex(provider.label)}[\\s\\S]{0,200}${escapeRegex(provider.file)}`,
      'i',
    );

    if (!providerPattern.test(readmeSource)) {
      report.fail(
        `[docs] README.md one-click reference missing for provider '${providerId}' (expected mention of '${provider.label}' and '${provider.file}').`,
      );
    }
  }
}

function assertProviderDocLinks(rootDir, readmeSource, report) {
  const deployDocsDir = path.join(rootDir, 'docs', 'deploy');

  if (!fs.existsSync(deployDocsDir)) {
    return;
  }

  for (const providerId of Object.keys(PROVIDER_MANIFESTS)) {
    const providerDocPath = path.join(deployDocsDir, `${providerId}.md`);
    if (!fs.existsSync(providerDocPath)) {
      continue;
    }

    const expectedReadmeToken = `docs/deploy/${providerId}.md`;
    if (!readmeSource.includes(expectedReadmeToken)) {
      report.fail(
        `[docs] README.md missing link to existing provider doc '${expectedReadmeToken}'.`,
      );
    }
  }
}

function validateCloudDeployContract(options = {}) {
  const report = createReporter();
  const rootDir = normalizeRoot(options.rootDir || process.env.KIN_DEPLOY_CONTRACT_ROOT);

  const cloudContractSource = readFileOrFail(
    rootDir,
    path.join('scripts', 'cloud-deploy-contract.ts'),
    'contract',
    report,
  );
  const ghcrContractSource = readFileOrFail(
    rootDir,
    path.join('scripts', 'ghcr-contract.ts'),
    'contract',
    report,
  );
  const readmeSource = readFileOrFail(rootDir, 'README.md', 'docs', report);

  if (!cloudContractSource || !ghcrContractSource || !readmeSource) {
    return {
      ok: false,
      rootDir,
      failures: report.getFailures(),
    };
  }

  const cloudContract = parseCloudDeployContract(cloudContractSource, report);
  const ghcrServices = parseGhcrContract(ghcrContractSource, report);

  assertProviderSet(cloudContract.providerIds, report);

  for (const providerId of Object.keys(PROVIDER_MANIFESTS)) {
    const manifest = PROVIDER_MANIFESTS[providerId];
    const content = readFileOrFail(rootDir, manifest.file, providerId, report);

    if (!content) {
      report.fail(`[${providerId}] ${manifest.file} missing provider manifest file.`);
      continue;
    }

    assertManifestStructure(providerId, content, report);
    assertCanonicalHealth(
      providerId,
      content,
      cloudContract.canonicalHealthPath,
      cloudContract.legacyHealthPath,
      report,
    );

    if (ghcrServices.length > 0) {
      assertGhcrReferences(providerId, content, ghcrServices, report);
    }
  }

  assertReadmeOneClick(readmeSource, report);
  assertProviderDocLinks(rootDir, readmeSource, report);

  const failures = report.getFailures();

  return {
    ok: failures.length === 0,
    rootDir,
    failures,
  };
}

function runCli(options = {}) {
  const result = validateCloudDeployContract(options);

  if (!result.ok) {
    for (const message of result.failures) {
      console.error(`❌ ${message}`);
    }

    console.error(`\nValidation failed with ${result.failures.length} issue(s).`);
    return 1;
  }

  console.log(
    `Cloud deploy contract validation passed (${path.relative(process.cwd(), result.rootDir) || '.'}).`,
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  PROVIDER_MANIFESTS,
  validateCloudDeployContract,
  runCli,
};
