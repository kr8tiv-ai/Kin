#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'publish-ghcr.yml');
const contractPath = path.join(repoRoot, 'scripts', 'ghcr-contract.ts');
const composePath = path.join(repoRoot, 'docker-compose.yml');
const readmePath = path.join(repoRoot, 'README.md');

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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function validateWorkflowContract(workflowSource, contractSource, serviceContracts) {
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
    const escapedService = escapeRegex(service.id);
    const escapedImage = escapeRegex(service.image);

    assertRegex(
      workflowSource,
      new RegExp(`service:\\s*${escapedService}`),
      `Workflow matrix includes service '${service.id}'`,
    );

    assertRegex(
      workflowSource,
      new RegExp(`image:\\s*${escapedImage}`),
      `Workflow matrix includes image '${service.image}'`,
    );

    assertRegex(
      workflowSource,
      new RegExp(`dockerfile:\\s*docker\\/Dockerfile\\.${escapedService}`),
      `Workflow matrix includes dockerfile docker/Dockerfile.${service.id}`,
    );
  }
}

function validateComposeContract(composeSource, serviceContracts) {
  assertIncludes(
    composeSource,
    'KIN_IMAGE_TAG:-latest',
    'Compose defaults runtime tag to latest while allowing overrides',
  );

  for (const service of serviceContracts) {
    const escapedService = escapeRegex(service.id);
    const escapedImage = escapeRegex(service.image);

    assertRegex(
      composeSource,
      new RegExp(`^\\s{2}${escapedService}:`, 'm'),
      `Compose declares '${service.id}' service`,
    );

    assertRegex(
      composeSource,
      new RegExp(`image:\\s*ghcr\\.io\\/\\$\\{GHCR_OWNER:-[^}]+\\}\\/${escapedImage}:\\$\\{KIN_IMAGE_TAG:-latest\\}`),
      `Compose image contract references ghcr.io/<owner>/${service.image}:<tag>`,
    );
  }
}

function validateReadmeContract(readmeSource, serviceContracts) {
  assertIncludes(readmeSource, '### GHCR Runtime Image Contract', 'README documents GHCR runtime image contract');
  assertIncludes(readmeSource, '`scripts/ghcr-contract.ts`', 'README links GHCR contract source of truth');
  assertIncludes(readmeSource, 'docker compose pull', 'README includes pull-first deployment command');
  assertIncludes(readmeSource, 'KIN_IMAGE_TAG=sha-', 'README shows sha-pinned tag deployment example');

  for (const service of serviceContracts) {
    assertIncludes(
      readmeSource,
      `ghcr.io/<owner>/${service.image}:latest`,
      `README lists latest tag reference for ${service.image}`,
    );

    assertIncludes(
      readmeSource,
      `ghcr.io/<owner>/${service.image}:sha-<short_sha>`,
      `README lists sha-pinned tag reference for ${service.image}`,
    );
  }
}

function main() {
  const workflowSource = readFileOrFail(workflowPath, 'workflow file');
  const contractSource = readFileOrFail(contractPath, 'GHCR contract source');
  const composeSource = readFileOrFail(composePath, 'compose contract file');
  const readmeSource = readFileOrFail(readmePath, 'README');

  if (!workflowSource || !contractSource || !composeSource || !readmeSource) {
    process.exit(1);
  }

  const serviceContracts = parseContractServices(contractSource);

  validateWorkflowContract(workflowSource, contractSource, serviceContracts);
  validateComposeContract(composeSource, serviceContracts);
  validateReadmeContract(readmeSource, serviceContracts);

  if (failureCount > 0) {
    console.error(`\nValidation failed with ${failureCount} issue(s).`);
    process.exit(1);
  }

  console.log('\nGHCR contract validation passed (workflow + compose + docs).');
}

main();
