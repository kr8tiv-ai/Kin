export type WizardStepStatus = 'ready' | 'needs-attention' | 'not-configured';

export interface WizardStep {
  id: 'keys' | 'telegram' | 'discord' | 'whatsapp';
  label: string;
  message: string;
  status: WizardStepStatus;
  blocking: boolean;
  reasonCode: string | null;
  nextActions: string[];
}

export interface WizardCompletion {
  persisted: boolean;
  eligible: boolean;
  reason: string | null;
}

export interface WizardStatus {
  steps: WizardStep[];
  completion: WizardCompletion;
  isComplete: boolean;
}

interface DbLike {
  prepare: (sql: string) => {
    get: (...args: any[]) => unknown;
    run?: (...args: any[]) => unknown;
  };
}

function hasEnv(key: string): boolean {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function checkApiKeys(): WizardStep {
  const requiredKeys = [
    { key: 'TELEGRAM_BOT_TOKEN' },
    { key: 'GROQ_API_KEY' },
  ];

  const missing = requiredKeys.filter(({ key }) => !hasEnv(key));

  if (missing.length > 0) {
    return {
      id: 'keys',
      label: 'API Keys',
      message: 'Some required keys are missing. Add them in your environment settings.',
      status: 'needs-attention',
      blocking: true,
      reasonCode: 'MISSING_REQUIRED_KEYS',
      nextActions: ['open provider', 'retry', 'contact support'],
    };
  }

  return {
    id: 'keys',
    label: 'API Keys',
    message: 'Required API keys are configured.',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function checkTelegramBot(): WizardStep {
  if (!hasEnv('TELEGRAM_BOT_TOKEN')) {
    return {
      id: 'telegram',
      label: 'Telegram',
      message: 'Telegram bot token is not configured yet.',
      status: 'not-configured',
      blocking: false,
      reasonCode: 'TELEGRAM_BOT_TOKEN_NOT_SET',
      nextActions: ['open provider', 'retry', 'contact support'],
    };
  }

  return {
    id: 'telegram',
    label: 'Telegram',
    message: 'Telegram is configured.',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function checkDiscordBot(): WizardStep {
  if (!hasEnv('DISCORD_BOT_TOKEN') || !hasEnv('DISCORD_CLIENT_ID')) {
    return {
      id: 'discord',
      label: 'Discord',
      message: 'Discord bot credentials are not configured yet.',
      status: 'not-configured',
      blocking: false,
      reasonCode: 'DISCORD_NOT_CONFIGURED',
      nextActions: ['open provider', 'retry', 'contact support'],
    };
  }

  return {
    id: 'discord',
    label: 'Discord',
    message: 'Discord is configured.',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function checkWhatsApp(): WizardStep {
  if (!hasEnv('WHATSAPP_AUTH_DIR')) {
    return {
      id: 'whatsapp',
      label: 'WhatsApp',
      message: 'WhatsApp auth directory is not configured yet.',
      status: 'not-configured',
      blocking: false,
      reasonCode: 'WHATSAPP_AUTH_DIR_NOT_SET',
      nextActions: ['open provider', 'retry', 'contact support'],
    };
  }

  return {
    id: 'whatsapp',
    label: 'WhatsApp',
    message: 'WhatsApp is configured.',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function readPersistedCompletion(userId: string, db: DbLike): boolean {
  try {
    const prefs = db
      .prepare('SELECT setup_wizard_complete FROM user_preferences WHERE user_id = ?')
      .get(userId) as { setup_wizard_complete?: number } | undefined;

    return prefs?.setup_wizard_complete === 1;
  } catch {
    return false;
  }
}

export function getCompletionEligibility(status: { steps: WizardStep[] }): {
  eligible: boolean;
  reason: string | null;
} {
  const blockingStep = status.steps.find((step) => step.blocking);
  if (blockingStep) {
    return {
      eligible: false,
      reason: `${blockingStep.label} must be ready before completing setup`,
    };
  }

  return { eligible: true, reason: null };
}

export function getWizardStatus(userId: string, db: DbLike): WizardStatus {
  const steps: WizardStep[] = [
    checkApiKeys(),
    checkTelegramBot(),
    checkDiscordBot(),
    checkWhatsApp(),
  ];

  const eligibility = getCompletionEligibility({ steps });
  const persisted = readPersistedCompletion(userId, db);
  const isComplete = persisted && eligibility.eligible;

  return {
    steps,
    completion: {
      persisted,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    },
    isComplete,
  };
}
