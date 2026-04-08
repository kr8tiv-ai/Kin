const DEFAULT_COMPANION_ID = 'cipher';
const KNOWN_COMPANION_IDS = new Set([
  'cipher',
  'mischief',
  'vortex',
  'forge',
  'aether',
  'catalyst',
]);

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCompanionId(value: string | null | undefined): string | null {
  const trimmed = normalizeValue(value);
  if (!trimmed) return null;
  return KNOWN_COMPANION_IDS.has(trimmed) ? trimmed : null;
}

export interface InitialChatSelection {
  companionId: string;
  conversationId: string | null;
  launchedFromOnboarding: boolean;
}

export function resolveInitialChatSelection(
  search: string,
  fallbackCompanionId?: string | null,
): InitialChatSelection {
  const params = new URLSearchParams(search);
  const launchCompanionId = normalizeCompanionId(params.get('companion'));
  const conversationId = normalizeValue(params.get('conversation'));

  return {
    companionId:
      launchCompanionId ??
      normalizeCompanionId(fallbackCompanionId) ??
      DEFAULT_COMPANION_ID,
    conversationId,
    launchedFromOnboarding: Boolean(launchCompanionId && conversationId),
  };
}
