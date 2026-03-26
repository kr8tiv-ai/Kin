/**
 * Mission Control Dashboard
 *
 * React components for monitoring Kin drift, health status, and 3D avatars.
 *
 * @module @kr8tiv-ai/mission-control
 */

// Components
export { 
  DriftStatusWidget, 
  DriftAlertPanel, 
  GLBViewer, 
  ErrorBoundary,
  KinStatusCard,
  KinStatusCardFallback,
} from './components';
export type { 
  DriftStatusWidgetProps, 
  DriftAlertPanelProps, 
  GLBViewerProps,
  ErrorBoundaryProps,
  KinStatusCardProps,
} from './components';

// Hooks
export { useDriftStatus, useDriftAlerts, useGLB, clearGLBCache, preloadGLB } from './hooks';
export type {
  UseDriftStatusState,
  UseDriftStatusOptions,
  UseDriftAlertsState,
  UseDriftAlertsOptions,
  GLBModel,
  UseGLBState,
  UseGLBOptions,
} from './hooks';

// Types
export type {
  DriftAlert,
  DriftBaseline,
  DriftStatus,
  DriftSeverity,
  DriftHealthStatus,
  DriftTrend,
  DriftAlertDetails,
  KinDriftScore,
  BaselineMetrics,
  BaselineComparisonValue,
  BehaviorProfile,
} from './types/drift';

export type { KinStatusRecord } from './types/kin-status';
