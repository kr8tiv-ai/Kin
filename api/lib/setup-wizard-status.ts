export interface WizardStep {
  id: string;
  label: string;
  status: 'ready' | 'needs-attention' | 'not-configured';
  blocking: boolean;
  reasonCode: string | null;
  nextActions: string[];
}

export interface WizardStatus {
  steps: WizardStep[];
  isComplete: boolean;
}

function checkApiKeys(): WizardStep {
  const requiredKeys = [
    { key: 'TELEGRAM_BOT_TOKEN', name: 'Telegram Bot' },
    { key: 'GROQ_API_KEY', name: 'Groq API' },
  ];
  
  const optionalKeys = [
    { key: 'OPENAI_API_KEY', name: 'OpenAI' },
    { key: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
  ];

  const missingRequired: string[] = [];
  const configured: string[] = [];

  for (const { key, name } of requiredKeys) {
    if (!process.env[key]) {
      missingRequired.push(name);
    } else {
      configured.push(name);
    }
  }

  for (const { key, name } of optionalKeys) {
    if (process.env[key]) {
      configured.push(name);
    }
  }

  if (missingRequired.length > 0) {
    return {
      id: 'keys',
      label: 'API Keys',
      status: 'needs-attention',
      blocking: true,
      reasonCode: 'MISSING_REQUIRED_KEYS',
      nextActions: [
        'Add required API keys to environment',
        'See .env.example for required variables',
      ],
    };
  }

  return {
    id: 'keys',
    label: 'API Keys',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function checkTelegramBot(): WizardStep {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    return {
      id: 'telegram',
      label: 'Telegram',
      status: 'not-configured',
      blocking: false,
      reasonCode: 'TELEGRAM_BOT_TOKEN_NOT_SET',
      nextActions: [
        'Get token from @BotFather on Telegram',
        'Add TELEGRAM_BOT_TOKEN to environment',
      ],
    };
  }

  return {
    id: 'telegram',
    label: 'Telegram',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function checkDiscordBot(): WizardStep {
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_APP_ID;
  
  if (!token || !appId) {
    return {
      id: 'discord',
      label: 'Discord',
      status: 'not-configured',
      blocking: false,
      reasonCode: 'DISCORD_NOT_CONFIGURED',
      nextActions: [
        'Create Discord application at discord.com/developers',
        'Add DISCORD_BOT_TOKEN and DISCORD_APP_ID to environment',
      ],
    };
  }

  return {
    id: 'discord',
    label: 'Discord',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

function checkWhatsApp(): WizardStep {
  const authDir = process.env.WHATSAPP_AUTH_DIR;
  
  if (!authDir) {
    return {
      id: 'whatsapp',
      label: 'WhatsApp',
      status: 'not-configured',
      blocking: false,
      reasonCode: 'WHATSAPP_AUTH_DIR_NOT_SET',
      nextActions: [
        'Set up WhatsApp Business API',
        'Add WHATSAPP_AUTH_DIR to environment',
      ],
    };
  }

  return {
    id: 'whatsapp',
    label: 'WhatsApp',
    status: 'ready',
    blocking: false,
    reasonCode: null,
    nextActions: [],
  };
}

export function getWizardStatus(userId: string, db: any): WizardStatus {
  const steps: WizardStep[] = [
    checkApiKeys(),
    checkTelegramBot(),
    checkDiscordBot(),
    checkWhatsApp(),
  ];

  const isComplete = steps.every(step => !step.blocking);

  return { steps, isComplete };
}

export function getCompletionEligibility(status: WizardStatus): {
  eligible: boolean;
  reason: string | null;
} {
  const keysStep = status.steps.find(s => s.id === 'keys');
  
  if (!keysStep || keysStep.status !== 'ready') {
    return {
      eligible: false,
      reason: 'API keys must be configured before completing setup',
    };
  }

  return { eligible: true, reason: null };
}