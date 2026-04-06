/**
 * Fleet Control Plane — Type Definitions
 *
 * Data model for provisioning, managing, and monitoring KIN container instances.
 * Each fleet instance represents a user's KIN deployment with 2 containers
 * (kin-api + kin-web), enforced resource limits, and health monitoring.
 */

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

/** Lifecycle states for a fleet instance */
export type FleetInstanceStatus =
  | 'provisioning'
  | 'running'
  | 'stopped'
  | 'error'
  | 'removing';

/** Default CPU shares per container (Docker relative weight, 1024 = 1 core) */
export const DEFAULT_CPU_SHARES = 256;

/** Default memory limit per container in MB */
export const DEFAULT_MEMORY_MB = 256;

/** Maximum concurrent fleet instances the control plane will manage */
export const MAX_INSTANCES = 64;

// ---------------------------------------------------------------------------
// Resource Limits
// ---------------------------------------------------------------------------

export interface FleetResourceLimits {
  /** Docker CPU shares (relative weight; 1024 ≈ 1 core) */
  cpuShares: number;
  /** Memory limit in megabytes */
  memoryMb: number;
}

// ---------------------------------------------------------------------------
// Container Info
// ---------------------------------------------------------------------------

export interface ContainerInfo {
  /** Docker container ID */
  containerId: string;
  /** Container name */
  name: string;
  /** Container image */
  image: string;
  /** Mapped host port */
  hostPort: number;
  /** Container internal port */
  containerPort: number;
  /** Current container state reported by Docker */
  state: string;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export interface FleetHealthCheck {
  /** ISO timestamp of last health check */
  lastCheckAt: number | null;
  /** Result of last health check */
  status: 'healthy' | 'unhealthy' | 'unknown';
  /** Last error message, if any */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Fleet Instance
// ---------------------------------------------------------------------------

export interface FleetInstance {
  /** Unique instance identifier (e.g. fleet-<nanoid>) */
  id: string;
  /** Owning user ID — one instance per user */
  userId: string;
  /** Subdomain for routing (e.g. user123.kin.example.com) */
  subdomain: string;
  /** Current lifecycle status */
  status: FleetInstanceStatus;
  /** Docker container ID for the kin-api service */
  apiContainerId: string | null;
  /** Docker container ID for the kin-web service */
  webContainerId: string | null;
  /** Mapped host port for kin-api */
  apiPort: number | null;
  /** Mapped host port for kin-web */
  webPort: number | null;
  /** Resource limits applied to containers */
  resourceLimits: FleetResourceLimits;
  /** Health check state */
  healthCheck: FleetHealthCheck;
  /** Last error message for error status */
  lastError: string | null;
  /** Last request/activity timestamp (ms since epoch), null if never active */
  lastActivityAt: number | null;
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
  /** Last-updated timestamp (ms since epoch) */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Query / Filter helpers
// ---------------------------------------------------------------------------

export interface FleetListFilters {
  status?: FleetInstanceStatus;
  userId?: string;
}

export interface FleetStats {
  total: number;
  provisioning: number;
  running: number;
  stopped: number;
  error: number;
  removing: number;
}

// ---------------------------------------------------------------------------
// Wake-on-Demand & Idle Timeout
// ---------------------------------------------------------------------------

/** Emitted when a sleeping instance is woken by an incoming request. */
export interface WakeEvent {
  /** Subdomain that triggered the wake (e.g. "alice") */
  subdomain: string;
  /** Fleet instance ID that was woken */
  instanceId: string;
  /** Time in ms from request arrival to container ready */
  latencyMs: number;
  /** Number of concurrent wake operations at the moment this fired */
  concurrent: number;
  /** Epoch-ms timestamp of the event */
  timestamp: number;
}

/** Configuration for the idle-timeout reaper. */
export interface IdleConfig {
  /** How often the reaper checks for idle instances (ms). Default 60 000 (1 min). */
  checkIntervalMs: number;
  /** How long an instance can be idle before it is stopped (ms). Default 1 800 000 (30 min). */
  idleThresholdMs: number;
  /** Max simultaneous wake operations to prevent thundering-herd. Default 5. */
  maxConcurrentWakes: number;
}

/** Default idle configuration values. */
export const DEFAULT_IDLE_CONFIG: IdleConfig = {
  checkIntervalMs: 60_000,
  idleThresholdMs: 1_800_000,
  maxConcurrentWakes: 5,
};

/** Resolved target for the reverse-proxy to forward a request to. */
export interface ProxyTarget {
  /** Container host or IP */
  host: string;
  /** Mapped host port for the kin-api container */
  apiPort: number;
  /** Mapped host port for the kin-web container */
  webPort: number;
}
