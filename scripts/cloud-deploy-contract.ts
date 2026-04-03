import {
  GHCR_REGISTRY,
  GHCR_SERVICES,
  buildGhcrImageRefs,
  type BuildGhcrImageRefsInput,
  type GhcrImageRefsByService,
} from './ghcr-contract.js';

/** Canonical provider IDs used by deploy manifests, docs, and validators. */
export type CloudProviderId = 'railway' | 'render' | 'fly' | 'coolify';

/** Provider metadata intentionally kept minimal and deterministic for parser consumption. */
export interface CloudDeployProviderContract {
  id: CloudProviderId;
  label: 'Railway' | 'Render' | 'Fly.io' | 'Coolify';
}

/**
 * Shared provider contract used by tests + validators to guarantee
 * one-click coverage remains Railway/Render/Fly/Coolify.
 */
export const CLOUD_DEPLOY_PROVIDERS: readonly CloudDeployProviderContract[] = [
  { id: 'railway', label: 'Railway' },
  { id: 'render', label: 'Render' },
  { id: 'fly', label: 'Fly.io' },
  { id: 'coolify', label: 'Coolify' },
];

/** Canonical deploy health proof endpoint across manifests/docs. */
export const CANONICAL_CLOUD_HEALTH_PATH = '/health';

/** Legacy endpoint marker kept only so drift checks can fail loudly. */
export const LEGACY_CLOUD_HEALTH_PATH = '/health/live';

/** Runtime ports shared by compose/manifests. */
export const DEFAULT_RUNTIME_PORTS = {
  api: 3002,
  web: 3001,
  inference: 11434,
} as const;

interface GhcrContractSurface {
  GHCR_REGISTRY?: unknown;
  GHCR_SERVICES?: unknown;
  buildGhcrImageRefs?: unknown;
}

function contractParseError(message: string): never {
  throw new Error(`[cloud-deploy-contract] contract-parse error: ${message}`);
}

/**
 * Validates ghcr-contract runtime shape before delegating image-ref derivation.
 * This ensures validator/test failures remain actionable if exports drift.
 */
export function assertGhcrContractExports(
  value: GhcrContractSurface,
): asserts value is {
  GHCR_REGISTRY: string;
  GHCR_SERVICES: readonly Array<{ id: string; image: string }>;
  buildGhcrImageRefs: typeof buildGhcrImageRefs;
} {
  if (typeof value.buildGhcrImageRefs !== 'function') {
    contractParseError('missing ghcr-contract export "buildGhcrImageRefs".');
  }

  if (typeof value.GHCR_REGISTRY !== 'string' || !value.GHCR_REGISTRY.trim()) {
    contractParseError('missing ghcr-contract export "GHCR_REGISTRY".');
  }

  if (!Array.isArray(value.GHCR_SERVICES) || value.GHCR_SERVICES.length === 0) {
    contractParseError('missing ghcr-contract export "GHCR_SERVICES".');
  }

  const hasMalformedServiceEntry = value.GHCR_SERVICES.some(
    (entry) =>
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as { id?: unknown }).id !== 'string' ||
      typeof (entry as { image?: unknown }).image !== 'string',
  );

  if (hasMalformedServiceEntry) {
    contractParseError('GHCR_SERVICES entries must include string id and image fields.');
  }
}

/**
 * Delegates GHCR image-ref derivation to the GHCR contract source of truth.
 * No image naming/tag logic should be duplicated in cloud deploy surfaces.
 */
export function buildCloudDeployImageRefs(
  input: BuildGhcrImageRefsInput,
): GhcrImageRefsByService {
  assertGhcrContractExports({
    GHCR_REGISTRY,
    GHCR_SERVICES,
    buildGhcrImageRefs,
  });

  return buildGhcrImageRefs(input);
}

/** Enforces the canonical /health path and blocks legacy deploy probes. */
export function validateCanonicalHealthPath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(
      `[cloud-deploy-contract] Invalid health path "${path}". Health paths must start with "/".`,
    );
  }

  if (path.includes(LEGACY_CLOUD_HEALTH_PATH)) {
    throw new Error(
      `[cloud-deploy-contract] Legacy deploy health path detected: ${LEGACY_CLOUD_HEALTH_PATH}. Use ${CANONICAL_CLOUD_HEALTH_PATH}.`,
    );
  }

  if (path !== CANONICAL_CLOUD_HEALTH_PATH) {
    throw new Error(
      `[cloud-deploy-contract] Invalid health path "${path}". Expected "${CANONICAL_CLOUD_HEALTH_PATH}".`,
    );
  }

  return path;
}

/** Scans free-form text sources and fails when /health/live is still present. */
export function assertNoLegacyHealthPath(content: string, sourceLabel: string): void {
  if (content.includes(LEGACY_CLOUD_HEALTH_PATH)) {
    throw new Error(
      `[cloud-deploy-contract] ${sourceLabel} still references legacy health path ${LEGACY_CLOUD_HEALTH_PATH}.`,
    );
  }
}
