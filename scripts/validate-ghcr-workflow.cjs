#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'publish-ghcr.yml');
const contractPath = path.join(repoRoot, 'scripts', 'ghcr-contract.ts');

let failureCount = 0;

function pass(message) {
  console.log(`✅ ${message}`);
}

function fail(message) {
  console.error(`❌ ${message}`);
  failureCount += 1;
}

function readFileOrFail(filePath, label) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    pass(`Loaded ${label}: ${path.relative(repoRoot, filePath)}`);
    return content;
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
    return '';
  }
}

function assertIncludes(content, snippet, description) {
  if (!content.includes(snippet)) {
    fail(`${description} missing: ${snippet}`);
    return;
  }

  pass(description);
}

function assertRegex(content, regex, description) {
  if (!regex.test(content)) {
    fail(`${description} missing (pattern: ${regex})`);
    return;
  }

  pass(description);
}

function parseContractServices(contractSource) {
  const blockMatch = contractSource.match(/export const GHCR_SERVICES:[\s\S]*?=\s*\[([\s\S]*?)\];/);

  if (!blockMatch) {
    fail('Unable to locate GHCR_SERVICES array in scripts/ghcr-contract.ts.');
    return [];
  }

  const entries = [...blockMatch[1].matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*image:\s*'([^']+)'\s*\}/g)].map(
    (match) => ({ id: match[1], image: match[2] }),
  );

  if (!entries.length) {
    fail('GHCR_SERVICES has no parsable service entries.');
    return [];
  }

  pass(`Parsed ${entries.length} GHCR service contracts from scripts/ghcr-contract.ts.`);
  return entries;
}

function main() {
  const workflowSource = readFileOrFail(workflowPath, 'workflow file');
  const contractSource = readFileOrFail(contractPath, 'GHCR contract source');

  if (!workflowSource || !contractSource) {
    process.exit(1);
  }

  const serviceContracts = parseContractServices(contractSource);

  assertIncludes(workflowSource, 'workflow_dispatch:', 'Manual dispatch trigger is configured');
  assertIncludes(workflowSource, 'packages: write', 'Workflow has package publish permissions');
  assertIncludes(workflowSource, 'concurrency:', 'Workflow defines concurrency controls');
  assertIncludes(workflowSource, 'uses: docker/login-action@v3', 'Workflow logs into GHCR');
  assertIncludes(workflowSource, 'password: ${{ secrets.GITHUB_TOKEN }}', 'Workflow uses GITHUB_TOKEN for GHCR auth');
  assertIncludes(workflowSource, 'uses: docker/metadata-action@v5', 'Workflow resolves OCI metadata');
  assertIncludes(workflowSource, 'type=raw,value=latest', 'Workflow publishes latest tag');
  assertIncludes(workflowSource, 'type=sha,format=short,prefix=sha-', 'Workflow publishes sha-* tag');
  assertIncludes(workflowSource, 'uses: docker/build-push-action@v6', 'Workflow builds and pushes images');
  assertIncludes(
    workflowSource,
    'images: ghcr.io/${{ github.repository_owner }}/${{ matrix.image }}',
    'Workflow targets owner-scoped GHCR image references',
  );

  assertIncludes(
    contractSource,
    "return ['latest', `sha-${normalizeCommitSha(sha)}`];",
    'Contract tag helper returns latest + sha-* tags',
  );

  for (const service of serviceContracts) {
    const escapedService = service.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedImage = service.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    assertRegex(
      workflowSource,
      new RegExp(`service:\\s*${escapedService}`),
      `Matrix includes service '${service.id}'`,
    );

    assertRegex(
      workflowSource,
      new RegExp(`image:\\s*${escapedImage}`),
      `Matrix includes image '${service.image}'`,
    );

    assertRegex(
      workflowSource,
      new RegExp(`dockerfile:\\s*docker\\/Dockerfile\\.${escapedService}`),
      `Matrix includes dockerfile docker/Dockerfile.${service.id}`,
    );
  }

  if (failureCount > 0) {
    console.error(`\nValidation failed with ${failureCount} issue(s).`);
    process.exit(1);
  }

  console.log('\nWorkflow validation passed.');
}

main();
