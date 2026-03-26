/**
 * Tailscale API endpoints for Mission Control.
 *
 * Provides device listing, auth key generation, and network status
 * for the Tailscale Auto-Setup Flow.
 */

import express, { Request, Response, Router } from 'express';

// Types matching Python TailscaleStatus schema
interface TailscaleDevice {
  device_id: string;
  hostname: string;
  ip_addresses: string[];
  online: boolean;
  last_seen: string;
  os: string;
  user?: string;
  tags?: string[];
  is_kin_host?: boolean;
  kin_id?: string;
}

interface NetworkHealth {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  health_score: number;
  last_check: string;
}

interface AuthKeyInfo {
  key_id: string;
  expires_at: string;
  reusable: boolean;
}

interface TailscaleStatus {
  record_id: string;
  schema_family: 'tailscale_status';
  tailnet: string;
  devices: TailscaleDevice[];
  network_health: NetworkHealth;
  auth_key?: AuthKeyInfo;
  created_at: string;
}

// Mock data for development
const MOCK_DEVICES: TailscaleDevice[] = [
  {
    device_id: 'dev-abc123',
    hostname: 'cipher-host',
    ip_addresses: ['100.64.0.1', 'fd7a:115c:a1e0::1'],
    online: true,
    last_seen: new Date().toISOString(),
    os: 'linux',
    user: 'owner@kr8tiv.ai',
    tags: ['tag:kin-host', 'tag:production'],
    is_kin_host: true,
    kin_id: 'kin-cipher',
  },
  {
    device_id: 'dev-def456',
    hostname: 'mobile-phone',
    ip_addresses: ['100.64.0.2'],
    online: true,
    last_seen: new Date().toISOString(),
    os: 'ios',
    user: 'owner@kr8tiv.ai',
    tags: ['tag:mobile'],
    is_kin_host: false,
  },
  {
    device_id: 'dev-ghi789',
    hostname: 'laptop',
    ip_addresses: ['100.64.0.3'],
    online: false,
    last_seen: new Date(Date.now() - 86400000).toISOString(),
    os: 'macos',
    user: 'owner@kr8tiv.ai',
    is_kin_host: false,
  },
];

function calculateNetworkHealth(devices: TailscaleDevice[]): NetworkHealth {
  const total = devices.length;
  const online = devices.filter(d => d.online).length;
  const offline = total - online;
  const score = total > 0 ? (online / total) * 100 : 0;

  return {
    total_devices: total,
    online_devices: online,
    offline_devices: offline,
    health_score: Math.round(score * 10) / 10,
    last_check: new Date().toISOString(),
  };
}

function generateMockStatus(): TailscaleStatus {
  return {
    record_id: `tss-${Math.random().toString(36).substring(2, 10)}`,
    schema_family: 'tailscale_status',
    tailnet: process.env.TAILSCALE_TAILNET || 'kr8tiv-kin',
    devices: MOCK_DEVICES,
    network_health: calculateNetworkHealth(MOCK_DEVICES),
    auth_key: {
      key_id: 'k123456',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      reusable: true,
    },
    created_at: new Date().toISOString(),
  };
}

/**
 * GET /api/tailscale/status
 * Returns current Tailscale network status
 */
export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    // In production, this would call Python derive_tailscale_status_record()
    const status = generateMockStatus();

    res.setHeader('X-Response-Time', `${Date.now() - (req.startTime || Date.now())}ms`);
    res.json(status);
  } catch (error) {
    console.error('Error fetching Tailscale status:', error);
    res.status(500).json({
      error: 'Failed to fetch Tailscale status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/tailscale/devices
 * Returns list of all devices in the tailnet
 */
export async function getDevices(req: Request, res: Response): Promise<void> {
  try {
    res.json({
      devices: MOCK_DEVICES,
      total: MOCK_DEVICES.length,
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({
      error: 'Failed to fetch devices',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/tailscale/devices/:deviceId
 * Returns a specific device by ID
 */
export async function getDevice(req: Request, res: Response): Promise<void> {
  const { deviceId } = req.params;

  try {
    const device = MOCK_DEVICES.find(d => d.device_id === deviceId);

    if (!device) {
      res.status(404).json({
        error: 'Device not found',
        device_id: deviceId,
      });
      return;
    }

    res.json(device);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({
      error: 'Failed to fetch device',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/tailscale/authorize
 * Authorize a new device
 */
export async function authorizeDevice(req: Request, res: Response): Promise<void> {
  const { device_id, device_key } = req.body;

  if (!device_id && !device_key) {
    res.status(400).json({
      error: 'Missing required field',
      message: 'Either device_id or device_key is required',
    });
    return;
  }

  try {
    // In production, this would call Python TailscaleClient.authorize_device()
    res.json({
      success: true,
      message: `Device ${device_id || device_key} authorized`,
      authorized_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error authorizing device:', error);
    res.status(500).json({
      error: 'Failed to authorize device',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/tailscale/auth-key
 * Generate a new auth key for device pairing
 */
export async function generateAuthKey(req: Request, res: Response): Promise<void> {
  const { reusable = true, tags = [] } = req.body;

  try {
    // In production, this would call Python TailscaleClient.generate_auth_key()
    const keyId = Math.random().toString(36).substring(2, 10);
    const authKey = `tskey-auth-k${Math.random().toString(36).substring(2, 18)}`;

    res.json({
      key: authKey,
      key_id: keyId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      reusable,
      tags,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating auth key:', error);
    res.status(500).json({
      error: 'Failed to generate auth key',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * DELETE /api/tailscale/devices/:deviceId
 * Remove a device from the tailnet
 */
export async function deleteDevice(req: Request, res: Response): Promise<void> {
  const { deviceId } = req.params;

  try {
    // In production, this would call Python TailscaleClient.delete_device()
    res.json({
      success: true,
      message: `Device ${deviceId} removed from tailnet`,
      deleted_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({
      error: 'Failed to delete device',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/tailscale/devices/:deviceId/tags
 * Update tags for a device
 */
export async function setDeviceTags(req: Request, res: Response): Promise<void> {
  const { deviceId } = req.params;
  const { tags } = req.body;

  if (!Array.isArray(tags)) {
    res.status(400).json({
      error: 'Invalid tags',
      message: 'tags must be an array of strings',
    });
    return;
  }

  try {
    // In production, this would call Python TailscaleClient.set_device_tags()
    res.json({
      success: true,
      device_id: deviceId,
      tags,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error setting device tags:', error);
    res.status(500).json({
      error: 'Failed to set device tags',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Router factory
export function createTailscaleRouter(): Router {
  const router = Router();

  router.get('/status', getStatus);
  router.get('/devices', getDevices);
  router.get('/devices/:deviceId', getDevice);
  router.post('/authorize', authorizeDevice);
  router.post('/auth-key', generateAuthKey);
  router.delete('/devices/:deviceId', deleteDevice);
  router.post('/devices/:deviceId/tags', setDeviceTags);

  return router;
}

export default createTailscaleRouter;
