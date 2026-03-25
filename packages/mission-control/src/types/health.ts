/**
 * Health monitoring types for Mission Control dashboard.
 * Derived from JSON schemas for type-safe API communication.
 */

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown';

export type CheckType = 'ping' | 'http' | 'process' | 'custom';

export interface HealthCheckRecord {
  record_id: string;
  schema_family: 'health_check_record';
  kin_id: string;
  timestamp: string;
  status: HealthStatus;
  response_time_ms?: number;
  error_count: number;
  check_type: CheckType;
  details: {
    error_message?: string;
    http_status_code?: number;
    process_pid?: number;
    memory_usage_mb?: number;
    cpu_usage_percent?: number;
    [key: string]: unknown;
  };
  created_at: string;
  schema_version: string;
}

export type RecoveryTrigger = 'health_check' | 'manual' | 'scheduled' | 'threshold_exceeded' | 'owner_request';

export type RecoveryAction = 'restart' | 'notify' | 'escalate' | 'reset' | 'redeploy';

export type RecoveryResult = 'success' | 'failed' | 'pending' | 'partial';

export interface RecoveryEvent {
  record_id: string;
  schema_family: 'recovery_event';
  kin_id: string;
  timestamp: string;
  trigger: RecoveryTrigger;
  action: RecoveryAction;
  result: RecoveryResult;
  details: {
    error_message?: string;
    retry_count?: number;
    duration_ms?: number;
    previous_status?: string;
    new_status?: string;
    notified_channels?: string[];
    [key: string]: unknown;
  };
  initiated_by: 'daemon' | 'owner' | 'system' | 'api';
  created_at: string;
  schema_version: string;
}

export type VpsOverallStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  uptime_seconds: number;
  load_average: [number, number, number];
  network_in_bytes?: number;
  network_out_bytes?: number;
}

export interface KinSummary {
  active_kin_count: number;
  total_kin_count: number;
  healthy_count: number;
  unhealthy_count: number;
  unknown_count: number;
}

export interface Alert {
  alert_id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
}

export interface VpsHealthStatus {
  record_id: string;
  schema_family: 'vps_health_status';
  vps_id: string;
  vps_name?: string;
  overall_status: VpsOverallStatus;
  system_metrics: SystemMetrics;
  kin_summary: KinSummary;
  alerts: Alert[];
  last_check_timestamp: string;
  created_at: string;
  schema_version: string;
}

// API Response types
export interface HealthStatusResponse {
  success: boolean;
  data?: VpsHealthStatus;
  error?: string;
}

export interface HealthChecksResponse {
  success: boolean;
  data?: HealthCheckRecord[];
  error?: string;
}

export interface RecoveryResponse {
  success: boolean;
  data?: RecoveryEvent;
  error?: string;
}
