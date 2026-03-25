/**
 * Subscription Management API Routes
 *
 * Endpoints for subscription status, usage, and tier management.
 */

import express, { Request, Response } from 'express';

const router = express.Router();

// --- Type Definitions ---

interface UsageMetrics {
  kin_count: number;
  kin_limit: number;
  api_calls_current: number;
  api_calls_limit: number;
  storage_used_mb: number;
  storage_limit_mb: number;
  voice_minutes_current?: number;
  voice_minutes_limit?: number;
}

interface BillingCycle {
  interval: 'month' | 'year';
  current_period_start: string;
  current_period_end: string;
  amount?: number;
  currency?: string;
}

interface PaymentMethod {
  type: 'card' | 'bank_transfer' | 'other';
  last_four: string;
  brand: string;
  expiry_month: number;
  expiry_year: number;
}

interface SubscriptionRecord {
  record_id: string;
  schema_family: 'subscription_record';
  owner_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'unpaid';
  usage: UsageMetrics;
  billing_cycle: BillingCycle;
  renewal_date: string;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  payment_method?: PaymentMethod | null;
  features: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

interface Invoice {
  invoice_id: string;
  number: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  created_at: string;
  due_date?: string | null;
  paid_at?: string | null;
  invoice_url?: string | null;
  invoice_pdf?: string | null;
}

interface TierDefinition {
  price: number;
  kin_limit: number;
  api_calls_limit: number;
  storage_limit_mb: number;
  voice_minutes_limit: number;
  features: Record<string, boolean>;
}

// Tier definitions (should match Python StripeClient)
const TIERS: Record<string, TierDefinition> = {
  free: {
    price: 0,
    kin_limit: 1,
    api_calls_limit: 1000,
    storage_limit_mb: 100,
    voice_minutes_limit: 10,
    features: {
      voice_mode: false,
      custom_specializations: false,
      priority_support: false,
      api_access: false,
      drift_alerts: false,
      health_monitoring: false,
    },
  },
  starter: {
    price: 900,
    kin_limit: 3,
    api_calls_limit: 10000,
    storage_limit_mb: 500,
    voice_minutes_limit: 50,
    features: {
      voice_mode: true,
      custom_specializations: false,
      priority_support: false,
      api_access: true,
      drift_alerts: true,
      health_monitoring: true,
    },
  },
  pro: {
    price: 2900,
    kin_limit: 10,
    api_calls_limit: 100000,
    storage_limit_mb: 5000,
    voice_minutes_limit: 500,
    features: {
      voice_mode: true,
      custom_specializations: true,
      priority_support: true,
      api_access: true,
      drift_alerts: true,
      health_monitoring: true,
    },
  },
  enterprise: {
    price: 9900,
    kin_limit: -1,
    api_calls_limit: -1,
    storage_limit_mb: -1,
    voice_minutes_limit: -1,
    features: {
      voice_mode: true,
      custom_specializations: true,
      priority_support: true,
      api_access: true,
      drift_alerts: true,
      health_monitoring: true,
      dedicated_support: true,
      sla: true,
    },
  },
};

// In-memory store for development
let subscriptionStore: Map<string, SubscriptionRecord> = new Map();

// --- API Routes ---

/**
 * Get current subscription
 * GET /api/subscription
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // In development, return mock subscription
    if (process.env.NODE_ENV === 'development') {
      const mockSub = getMockSubscription();
      return res.json(mockSub);
    }

    // Production: Get customer ID from session/auth
    const customerId = req.headers['x-customer-id'] as string;
    if (!customerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Call Python StripeClient
    const subscription = await getSubscriptionFromPython(customerId);
    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * Get usage metrics
 * GET /api/subscription/usage
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    // In development, return mock usage
    if (process.env.NODE_ENV === 'development') {
      const mockUsage = getMockUsage();
      return res.json(mockUsage);
    }

    const subscriptionId = req.headers['x-subscription-id'] as string;
    if (!subscriptionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usage = await getUsageFromPython(subscriptionId);
    res.json(usage);
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

/**
 * Upgrade subscription tier
 * POST /api/subscription/upgrade
 */
router.post('/upgrade', async (req: Request, res: Response) => {
  try {
    const { tier } = req.body;

    // Validate tier
    if (!tier || !TIERS[tier]) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier. Must be one of: ${Object.keys(TIERS).join(', ')}`,
      });
    }

    // Prevent downgrading in this endpoint
    if (tier === 'free') {
      return res.status(400).json({
        success: false,
        error: 'Use /cancel to cancel subscription',
      });
    }

    // In development, return mock success
    if (process.env.NODE_ENV === 'development') {
      const updatedSub = getMockSubscription(tier);
      return res.json({
        success: true,
        message: `Upgraded to ${tier} tier`,
        subscription: updatedSub,
      });
    }

    const customerId = req.headers['x-customer-id'] as string;
    if (!customerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await upgradeTierInPython(customerId, tier);

    res.json({
      success: result,
      message: `Upgraded to ${tier} tier`,
    });
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upgrade subscription',
    });
  }
});

/**
 * Cancel subscription
 * POST /api/subscription/cancel
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { immediate } = req.body;

    // In development, return mock success
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        success: true,
        message: immediate
          ? 'Subscription canceled immediately'
          : 'Subscription will cancel at end of billing period',
        subscription: {
          ...getMockSubscription(),
          cancel_at_period_end: !immediate,
          status: immediate ? 'canceled' : 'active',
        },
      });
    }

    const customerId = req.headers['x-customer-id'] as string;
    if (!customerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await cancelInPython(customerId, immediate);

    res.json({
      success: result,
      message: immediate
        ? 'Subscription canceled immediately'
        : 'Subscription will cancel at end of billing period',
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
    });
  }
});

/**
 * Get billing history
 * GET /api/subscription/invoices
 */
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    // In development, return mock invoices
    if (process.env.NODE_ENV === 'development') {
      const mockInvoices = getMockInvoices(limit);
      return res.json({
        count: mockInvoices.length,
        invoices: mockInvoices,
      });
    }

    const customerId = req.headers['x-customer-id'] as string;
    if (!customerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoices = await getInvoicesFromPython(customerId, limit);

    res.json({
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * Get tier definitions
 * GET /api/subscription/tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  res.json({
    tiers: Object.entries(TIERS).map(([name, config]) => ({
      name,
      price: config.price,
      price_display: config.price === 0 ? 'Free' : `$${(config.price / 100).toFixed(0)}/mo`,
      limits: {
        kin: config.kin_limit === -1 ? 'Unlimited' : config.kin_limit,
        api_calls: config.api_calls_limit === -1 ? 'Unlimited' : config.api_calls_limit.toLocaleString(),
        storage: config.storage_limit_mb === -1 ? 'Unlimited' : `${config.storage_limit_mb} MB`,
        voice_minutes: config.voice_minutes_limit === -1 ? 'Unlimited' : `${config.voice_minutes_limit} min`,
      },
      features: config.features,
    })),
  });
});

// --- Mock Data Functions ---

function getMockSubscription(tier: string = 'pro'): SubscriptionRecord {
  const now = new Date();
  const tierConfig = TIERS[tier];

  return {
    record_id: `sub-mock-${Date.now()}`,
    schema_family: 'subscription_record',
    owner_id: 'owner-mock123',
    stripe_customer_id: 'cus_mock123456',
    stripe_subscription_id: 'sub_mock123456',
    tier: tier as 'free' | 'starter' | 'pro' | 'enterprise',
    status: 'active',
    usage: getMockUsage(tier),
    billing_cycle: {
      interval: 'month',
      current_period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      current_period_end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      amount: tierConfig.price,
      currency: 'usd',
    },
    renewal_date: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    payment_method: {
      type: 'card',
      last_four: '4242',
      brand: 'visa',
      expiry_month: 12,
      expiry_year: 2027,
    },
    features: tierConfig.features,
    created_at: new Date(now.getFullYear() - 1, now.getMonth(), 15).toISOString(),
    updated_at: now.toISOString(),
  };
}

function getMockUsage(tier: string = 'pro'): UsageMetrics {
  const tierConfig = TIERS[tier];

  return {
    kin_count: 3,
    kin_limit: tierConfig.kin_limit,
    api_calls_current: 45230,
    api_calls_limit: tierConfig.api_calls_limit,
    storage_used_mb: 128.5,
    storage_limit_mb: tierConfig.storage_limit_mb,
    voice_minutes_current: 45.2,
    voice_minutes_limit: tierConfig.voice_minutes_limit,
  };
}

function getMockInvoices(limit: number): Invoice[] {
  const invoices: Invoice[] = [];
  const now = new Date();

  for (let i = 0; i < Math.min(limit, 6); i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    invoices.push({
      invoice_id: `in_mock${String(i).padStart(3, '0')}`,
      number: `INV-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      amount: 2900,
      currency: 'usd',
      status: 'paid',
      created_at: date.toISOString(),
      paid_at: date.toISOString(),
      invoice_url: `https://invoice.stripe.com/mock${i}`,
      invoice_pdf: `https://invoice.stripe.com/mock${i}.pdf`,
    });
  }

  return invoices;
}

// --- Python Integration Stubs ---

async function getSubscriptionFromPython(customerId: string): Promise<SubscriptionRecord> {
  // TODO: Call Python StripeClient via subprocess or HTTP
  return getMockSubscription();
}

async function getUsageFromPython(subscriptionId: string): Promise<UsageMetrics> {
  // TODO: Call Python StripeClient via subprocess or HTTP
  return getMockUsage();
}

async function upgradeTierInPython(customerId: string, tier: string): Promise<boolean> {
  // TODO: Call Python StripeClient via subprocess or HTTP
  return true;
}

async function cancelInPython(customerId: string, immediate: boolean): Promise<boolean> {
  // TODO: Call Python StripeClient via subprocess or HTTP
  return true;
}

async function getInvoicesFromPython(customerId: string, limit: number): Promise<Invoice[]> {
  // TODO: Call Python StripeClient via subprocess or HTTP
  return getMockInvoices(limit);
}

export default router;
