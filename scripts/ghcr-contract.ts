export const GHCR_REGISTRY = 'ghcr.io';

export type GhcrServiceId = 'api' | 'web' | 'inference';
export type RuntimeImageName = 'kin-api' | 'kin-web' | 'kin-inference';

export interface GhcrServiceContract {
  id: GhcrServiceId;
  image: RuntimeImageName;
}

export const GHCR_SERVICES: readonly GhcrServiceContract[] = [
  { id: 'api', image: 'kin-api' },
  { id: 'web', image: 'kin-web' },
  { id: 'inference', image: 'kin-inference' },
];

export const DEFAULT_RUNTIME_IMAGES: readonly RuntimeImageName[] = GHCR_SERVICES.map(
  (service) => service.image,
);

export interface BuildGhcrImageRefsInput {
  owner: string;
  sha: string;
  registry?: string;
}

export type GhcrImageRefsByService = Record<GhcrServiceId, [string, string]>;

function assertNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`[ghcr-contract] ${field} is required.`);
  }

  return normalized;
}

function normalizeRegistry(registry: string): string {
  return assertNonEmpty(registry, 'registry').toLowerCase().replace(/\/+$/, '');
}

function normalizeImageName(imageName: string): string {
  return assertNonEmpty(imageName, 'imageName').toLowerCase();
}

export function normalizeOwner(owner: string): string {
  return assertNonEmpty(owner, 'owner').replace(/^@+/, '').toLowerCase();
}

export function normalizeCommitSha(sha: string, length: number = 7): string {
  if (length < 1) {
    throw new Error('[ghcr-contract] length must be >= 1.');
  }

  const normalized = assertNonEmpty(sha, 'sha').toLowerCase().replace(/[^a-f0-9]/g, '');

  if (normalized.length < length) {
    throw new Error(`[ghcr-contract] sha must include at least ${length} hex characters.`);
  }

  return normalized.slice(0, length);
}

export function getGhcrImageBase(
  owner: string,
  imageName: string,
  registry: string = GHCR_REGISTRY,
): string {
  const normalizedRegistry = normalizeRegistry(registry);
  const normalizedOwner = normalizeOwner(owner);
  const normalizedImageName = normalizeImageName(imageName);

  return `${normalizedRegistry}/${normalizedOwner}/${normalizedImageName}`;
}

export function getRuntimeImageTags(sha: string): [string, string] {
  return ['latest', `sha-${normalizeCommitSha(sha)}`];
}

export function buildGhcrImageRefs(
  input: BuildGhcrImageRefsInput,
): GhcrImageRefsByService {
  const owner = normalizeOwner(input.owner);
  const registry = input.registry ?? GHCR_REGISTRY;
  const [latestTag, shaTag] = getRuntimeImageTags(input.sha);
  const refs = {} as GhcrImageRefsByService;

  for (const service of GHCR_SERVICES) {
    const baseRef = getGhcrImageBase(owner, service.image, registry);
    refs[service.id] = [`${baseRef}:${latestTag}`, `${baseRef}:${shaTag}`];
  }

  return refs;
}
