/**
 * Drift Detection API Routes
 * 
 * Endpoints for Kin behavioral drift monitoring and alerting.
 */

import express, { Request, Response } from 'express';

const router = express.Router();

// In-memory store for drift status (would be replaced with real data in production)
let driftStatus: DriftStatusSummary | null = null;
let driftBaselines: Map<string, DriftBaseline> = new Map();
let driftAlerts: DriftAlert[] = [];

// --- Type Definitions ---

interface KinDriftScore {
  kin_id: string;
  kin_name: string;
  drift_score: number;
  status: 'healthy' | 'warning' | 'alert' | 'critical';
  trend: 'improving' | 'stable' | 'worsening';
  last_alert_severity: 'low' | 'medium' | 'high' | 'critical' | null;
  last_alert_at: string | null;
}

interface DriftStatusSummary {
  record_id: string;
  timestamp: string;
  kin_drift_scores: KinDriftScore[];
  alert_count_24h: number;
  critical_count_24h: number;
  high_count_24h: number;
  medium_count_24h: number;
  low_count_24h: number;
  overall_health: 'stable' | 'warning' | 'critical';
  created_at: string;
}

interface DriftBaseline {
  record_id: string;
  schema_family: 'drift_baseline';
  kin_id: string;
  kin_name: string;
  specialization: string;
  behavior_profile: {
    task_patterns: {
      primary_task_types: string[];
      avg_task_duration_minutes: number;
      task_completion_rate_target: number;
      complexity_handling: string;
    };
    response_patterns: {
      avg_response_time_seconds: number;
      response_style: string;
      tone: string;
      proactive_suggestions: boolean;
    };
    interaction_patterns: {
      engagement_level: string;
      initiated_interactions_ratio: number;
      follow_up_rate: number;
      context_retention: string;
    };
  };
  baseline_metrics: {
    avg_response_time: number;
    task_completion_rate: number;
    error_rate: number;
    specialization_alignment_score: number;
    uptime_percentage?: number;
    interaction_count_7d?: number;
    satisfaction_score?: number;
  };
  created_at: string;
  last_updated_at: string;
  baseline_period_days?: number;
  sample_size?: number;
  confidence_score?: number;
  drift_threshold_override?: number;
}

interface DriftAlert {
  record_id: string;
  schema_family: 'drift_alert';
  kin_id: string;
  kin_name: string;
  timestamp: string;
  drift_score: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    deviant_metrics: Record<string, {
      current: number;
      baseline: number;
      deviation_percent: number;
      impact: 'low' | 'medium' | 'high';
    }>;
    baseline_comparison: {
      metrics_above_threshold: string[];
      worst_deviation: {
        metric_name: string;
        deviation_percent: number;
      };
      trend: 'improving' | 'stable' | 'worsening';
    };
    health_check_context?: {
      recent_error_count: number;
      recent_check_count: number;
      time_window_hours: number;
    };
    specialization_context?: {
      expected_specialization: string;
      alignment_score: number;
      misaligned_behaviors: string[];
    };
  };
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  notification_sent: boolean;
  notification_channels: string[];
}

// --- API Routes ---

/**
 * Get current drift status for all Kin
 * GET /api/drift/status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // In development, return mock data
    if (process.env.NODE_ENV === 'development' || !driftStatus) {
      const mockStatus = getMockDriftStatus();
      return res.json(mockStatus);
    }

    res.json(driftStatus);
  } catch (error) {
    console.error('Error fetching drift status:', error);
    res.status(500).json({ error: 'Failed to fetch drift status' });
  }
});

/**
 * Get drift baseline for a specific Kin
 * GET /api/drift/baseline/:kinId
 */
router.get('/baseline/:kinId', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;

    // Check memory first
    const baseline = driftBaselines.get(kinId);
    if (baseline) {
      return res.json(baseline);
    }

    // In development, return mock baseline
    if (process.env.NODE_ENV === 'development' || !baseline) {
      const mockBaseline = getMockDriftBaseline(kinId);
      return res.json(mockBaseline);
    }

    res.status(404).json({ error: `No baseline found for ${kinId}` });
  } catch (error) {
    console.error('Error fetching drift baseline:', error);
    res.status(500).json({ error: 'Failed to fetch drift baseline' });
  }
});

/**
 * Reset drift baseline for a specific Kin
 * POST /api/drift/baseline/:kinId/reset
 */
router.post('/baseline/:kinId/reset', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;
    const { specialization, kin_name } = req.body;

    // In development, return mock reset result
    if (process.env.NODE_ENV === 'development') {
      const newBaseline = getMockDriftBaseline(kinId, kin_name, specialization);
      driftBaselines.set(kinId, newBaseline);
      
      return res.json({
        success: true,
        message: `Baseline reset for ${kinId}`,
        baseline: newBaseline,
      });
    }

    // In production, call Python drift detector
    const baseline = await resetBaseline(kinId, specialization);
    
    res.json({
      success: true,
      message: `Baseline reset for ${kinId}`,
      baseline,
    });
  } catch (error) {
    console.error('Error resetting drift baseline:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reset drift baseline',
    });
  }
});

/**
 * Get recent drift alerts
 * GET /api/drift/alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { kin_id, severity, limit = 50, acknowledged } = req.query;

    let alerts = driftAlerts;

    // In development, use mock alerts
    if (process.env.NODE_ENV === 'development' || driftAlerts.length === 0) {
      alerts = getMockDriftAlerts();
    }

    // Apply filters
    if (kin_id) {
      alerts = alerts.filter(a => a.kin_id === kin_id);
    }
    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }
    if (acknowledged !== undefined) {
      const ackBool = acknowledged === 'true';
      alerts = alerts.filter(a => a.acknowledged === ackBool);
    }

    // Sort by timestamp descending and limit
    alerts = alerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Number(limit));

    res.json({
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('Error fetching drift alerts:', error);
    res.status(500).json({ error: 'Failed to fetch drift alerts' });
  }
});

/**
 * Acknowledge a drift alert
 * PATCH /api/drift/alerts/:alertId/acknowledge
 */
router.patch('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { acknowledged_by = 'owner' } = req.body;

    // Find and update alert
    const alertIndex = driftAlerts.findIndex(a => a.record_id === alertId);
    
    if (alertIndex === -1) {
      // In development, check mock alerts
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: `Alert ${alertId} acknowledged (mock)`,
          alert: {
            record_id: alertId,
            acknowledged: true,
            acknowledged_at: new Date().toISOString(),
          },
        });
      }
      
      return res.status(404).json({ 
        success: false,
        error: `Alert ${alertId} not found`,
      });
    }

    driftAlerts[alertIndex].acknowledged = true;
    driftAlerts[alertIndex].acknowledged_at = new Date().toISOString();

    res.json({
      success: true,
      message: `Alert ${alertId} acknowledged`,
      alert: driftAlerts[alertIndex],
    });
  } catch (error) {
    console.error('Error acknowledging drift alert:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to acknowledge alert',
    });
  }
});

/**
 * Initialize drift baseline for a new Kin
 * POST /api/drift/initialize
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { kin_id, kin_name, specialization } = req.body;

    if (!kin_id || !kin_name || !specialization) {
      return res.status(400).json({
        success: false,
        error: 'kin_id, kin_name, and specialization are required',
      });
    }

    // Validate specialization
    const validSpecializations = [
      'web-design',
      'family-companion',
      'social-media',
      'developer-support',
      'creative-writing',
      'wealth-coaching',
    ];

    if (!validSpecializations.includes(specialization)) {
      return res.status(400).json({
        success: false,
        error: `Invalid specialization. Must be one of: ${validSpecializations.join(', ')}`,
      });
    }

    // Create baseline
    const baseline = getMockDriftBaseline(kin_id, kin_name, specialization);
    driftBaselines.set(kin_id, baseline);

    res.json({
      success: true,
      message: `Initialized drift baseline for ${kin_id}`,
      baseline,
    });
  } catch (error) {
    console.error('Error initializing drift baseline:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to initialize drift baseline',
    });
  }
});

// --- Helper functions for mock data ---

function getMockDriftStatus(): DriftStatusSummary {
  const now = new Date();
  
  return {
    record_id: `drift-status-${now.toISOString().split('T')[0].replace(/-/g, '')}`,
    timestamp: now.toISOString(),
    kin_drift_scores: [
      {
        kin_id: 'cipher-001',
        kin_name: 'Cipher',
        drift_score: 0.05,
        status: 'healthy',
        trend: 'stable',
        last_alert_severity: null,
        last_alert_at: null,
      },
      {
        kin_id: 'mischief-001',
        kin_name: 'Mischief',
        drift_score: 0.08,
        status: 'healthy',
        trend: 'improving',
        last_alert_severity: 'low',
        last_alert_at: new Date(now.getTime() - 86400000).toISOString(),
      },
      {
        kin_id: 'vortex-001',
        kin_name: 'Vortex',
        drift_score: 0.35,
        status: 'critical',
        trend: 'worsening',
        last_alert_severity: 'high',
        last_alert_at: now.toISOString(),
      },
      {
        kin_id: 'forge-001',
        kin_name: 'Forge',
        drift_score: 0.15,
        status: 'warning',
        trend: 'stable',
        last_alert_severity: null,
        last_alert_at: null,
      },
    ],
    alert_count_24h: 3,
    critical_count_24h: 1,
    high_count_24h: 1,
    medium_count_24h: 0,
    low_count_24h: 1,
    overall_health: 'warning',
    created_at: now.toISOString(),
  };
}

function getMockDriftBaseline(
  kinId: string, 
  kinName?: string, 
  specialization?: string
): DriftBaseline {
  const now = new Date();
  const name = kinName || kinId.split('-')[0].charAt(0).toUpperCase() + kinId.split('-')[0].slice(1);
  const spec = specialization || 'web-design';
  
  const profiles: Record<string, Partial<DriftBaseline['behavior_profile']>> = {
    'web-design': {
      task_patterns: {
        primary_task_types: ['website-design', 'frontend-development', 'ui-review', 'design-teaching'],
        avg_task_duration_minutes: 25,
        task_completion_rate_target: 0.95,
        complexity_handling: 'expert',
      },
      response_patterns: {
        avg_response_time_seconds: 12,
        response_style: 'detailed',
        tone: 'friendly',
        proactive_suggestions: true,
      },
      interaction_patterns: {
        engagement_level: 'high',
        initiated_interactions_ratio: 0.3,
        follow_up_rate: 0.8,
        context_retention: 'long-term',
      },
    },
    'family-companion': {
      task_patterns: {
        primary_task_types: ['family-activities', 'personal-brand', 'scheduling', 'reminders'],
        avg_task_duration_minutes: 10,
        task_completion_rate_target: 0.98,
        complexity_handling: 'moderate',
      },
      response_patterns: {
        avg_response_time_seconds: 8,
        response_style: 'balanced',
        tone: 'casual',
        proactive_suggestions: true,
      },
      interaction_patterns: {
        engagement_level: 'very-high',
        initiated_interactions_ratio: 0.4,
        follow_up_rate: 0.9,
        context_retention: 'long-term',
      },
    },
    'social-media': {
      task_patterns: {
        primary_task_types: ['content-creation', 'post-scheduling', 'engagement-tracking', 'analytics'],
        avg_task_duration_minutes: 15,
        task_completion_rate_target: 0.92,
        complexity_handling: 'moderate',
      },
      response_patterns: {
        avg_response_time_seconds: 15,
        response_style: 'comprehensive',
        tone: 'enthusiastic',
        proactive_suggestions: true,
      },
      interaction_patterns: {
        engagement_level: 'high',
        initiated_interactions_ratio: 0.25,
        follow_up_rate: 0.85,
        context_retention: 'medium-term',
      },
    },
    'developer-support': {
      task_patterns: {
        primary_task_types: ['code-review', 'debugging', 'architecture', 'documentation'],
        avg_task_duration_minutes: 30,
        task_completion_rate_target: 0.90,
        complexity_handling: 'expert',
      },
      response_patterns: {
        avg_response_time_seconds: 20,
        response_style: 'detailed',
        tone: 'professional',
        proactive_suggestions: true,
      },
      interaction_patterns: {
        engagement_level: 'moderate',
        initiated_interactions_ratio: 0.2,
        follow_up_rate: 0.7,
        context_retention: 'long-term',
      },
    },
    'creative-writing': {
      task_patterns: {
        primary_task_types: ['storytelling', 'writing-assistance', 'brainstorming', 'editing'],
        avg_task_duration_minutes: 20,
        task_completion_rate_target: 0.94,
        complexity_handling: 'complex',
      },
      response_patterns: {
        avg_response_time_seconds: 18,
        response_style: 'comprehensive',
        tone: 'friendly',
        proactive_suggestions: true,
      },
      interaction_patterns: {
        engagement_level: 'high',
        initiated_interactions_ratio: 0.35,
        follow_up_rate: 0.8,
        context_retention: 'long-term',
      },
    },
    'wealth-coaching': {
      task_patterns: {
        primary_task_types: ['financial-planning', 'habit-tracking', 'investment-analysis', 'goal-setting'],
        avg_task_duration_minutes: 25,
        task_completion_rate_target: 0.93,
        complexity_handling: 'complex',
      },
      response_patterns: {
        avg_response_time_seconds: 22,
        response_style: 'balanced',
        tone: 'professional',
        proactive_suggestions: true,
      },
      interaction_patterns: {
        engagement_level: 'moderate',
        initiated_interactions_ratio: 0.25,
        follow_up_rate: 0.75,
        context_retention: 'long-term',
      },
    },
  };

  const profile = profiles[spec] || profiles['web-design'];

  return {
    record_id: `drift-baseline-${kinId.replace(/-/g, '')}`,
    schema_family: 'drift_baseline',
    kin_id: kinId,
    kin_name: name,
    specialization: spec,
    behavior_profile: {
      task_patterns: profile.task_patterns!,
      response_patterns: profile.response_patterns!,
      interaction_patterns: profile.interaction_patterns!,
    },
    baseline_metrics: {
      avg_response_time: profile.response_patterns!.avg_response_time_seconds,
      task_completion_rate: profile.task_patterns!.task_completion_rate_target,
      error_rate: 0.02,
      specialization_alignment_score: 0.90,
      uptime_percentage: 99.5,
      interaction_count_7d: 127,
      satisfaction_score: 4.8,
    },
    created_at: now.toISOString(),
    last_updated_at: now.toISOString(),
    baseline_period_days: 7,
    sample_size: 892,
    confidence_score: 0.95,
  };
}

function getMockDriftAlerts(): DriftAlert[] {
  const now = new Date();
  
  return [
    {
      record_id: `drift-alert-vortex001-${now.getTime()}`,
      schema_family: 'drift_alert',
      kin_id: 'vortex-001',
      kin_name: 'Vortex',
      timestamp: now.toISOString(),
      drift_score: 0.35,
      threshold: 0.20,
      severity: 'high',
      details: {
        deviant_metrics: {
          task_completion_rate: {
            current: 0.72,
            baseline: 0.94,
            deviation_percent: 23.4,
            impact: 'high',
          },
          avg_response_time: {
            current: 45.2,
            baseline: 15.0,
            deviation_percent: 201.3,
            impact: 'high',
          },
          error_rate: {
            current: 0.12,
            baseline: 0.03,
            deviation_percent: 300.0,
            impact: 'medium',
          },
        },
        baseline_comparison: {
          metrics_above_threshold: ['task_completion_rate', 'avg_response_time', 'error_rate'],
          worst_deviation: {
            metric_name: 'error_rate',
            deviation_percent: 300.0,
          },
          trend: 'worsening',
        },
        health_check_context: {
          recent_error_count: 8,
          recent_check_count: 24,
          time_window_hours: 6,
        },
        specialization_context: {
          expected_specialization: 'social-media',
          alignment_score: 0.65,
          misaligned_behaviors: [
            'declining content-creation tasks',
            'extended response times on social-media queries',
          ],
        },
      },
      acknowledged: false,
      acknowledged_at: null,
      created_at: now.toISOString(),
      resolved_at: null,
      resolution_notes: null,
      notification_sent: true,
      notification_channels: ['mission-control', 'telegram'],
    },
    {
      record_id: `drift-alert-mischief001-${now.getTime() - 86400000}`,
      schema_family: 'drift_alert',
      kin_id: 'mischief-001',
      kin_name: 'Mischief',
      timestamp: new Date(now.getTime() - 86400000).toISOString(),
      drift_score: 0.22,
      threshold: 0.20,
      severity: 'low',
      details: {
        deviant_metrics: {
          avg_response_time: {
            current: 12.5,
            baseline: 8.0,
            deviation_percent: 56.25,
            impact: 'low',
          },
        },
        baseline_comparison: {
          metrics_above_threshold: ['avg_response_time'],
          worst_deviation: {
            metric_name: 'avg_response_time',
            deviation_percent: 56.25,
          },
          trend: 'improving',
        },
      },
      acknowledged: true,
      acknowledged_at: new Date(now.getTime() - 43200000).toISOString(),
      created_at: new Date(now.getTime() - 86400000).toISOString(),
      resolved_at: new Date(now.getTime() - 36000000).toISOString(),
      resolution_notes: 'Response time improved after restart',
      notification_sent: true,
      notification_channels: ['mission-control'],
    },
  ];
}

// --- Production stubs ---

async function resetBaseline(kinId: string, specialization?: string): Promise<DriftBaseline> {
  // TODO: Call Python drift detector via subprocess or HTTP
  return getMockDriftBaseline(kinId, undefined, specialization);
}

export default router;
