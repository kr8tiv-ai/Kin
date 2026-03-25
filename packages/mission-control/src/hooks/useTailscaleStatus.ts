/**
 * React hook for fetching Tailscale network status.
 */

import { useState, useEffect, useCallback } from 'react';

export interface TailscaleDevice {
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

export interface NetworkHealth {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  health_score: number;
  last_check: string;
}

export interface TailscaleStatus {
  record_id: string;
  schema_family: 'tailscale_status';
  tailnet: string;
  devices: TailscaleDevice[];
  network_health: NetworkHealth;
  auth_key?: {
    key_id: string;
    expires_at: string;
    reusable: boolean;
  };
  created_at: string;
}

interface UseTailscaleStatusOptions {
  refreshInterval?: number;
  autoRefresh?: boolean;
}

interface UseTailscaleStatusReturn {
  status: TailscaleStatus | null;
  devices: TailscaleDevice[];
  health: NetworkHealth | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTailscaleStatus(
  options: UseTailscaleStatusOptions = {}
): UseTailscaleStatusReturn {
  const { refreshInterval = 30000, autoRefresh = true } = options;

  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/tailscale/status');
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchStatus, autoRefresh, refreshInterval]);

  return {
    status,
    devices: status?.devices ?? [],
    health: status?.network_health ?? null,
    loading,
    error,
    refresh: fetchStatus,
  };
}

interface UseAuthKeyReturn {
  generateKey: (reusable?: boolean, tags?: string[]) => Promise<string | null>;
  loading: boolean;
  error: string | null;
}

export function useAuthKey(): UseAuthKeyReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateKey = useCallback(async (reusable = true, tags: string[] = []) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tailscale/auth-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reusable, tags }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate auth key: ${response.status}`);
      }

      const data = await response.json();
      return data.key;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generateKey, loading, error };
}

interface UseDeviceAlertsOptions {
  onOffline?: (device: TailscaleDevice) => void;
  onOnline?: (device: TailscaleDevice) => void;
}

export function useDeviceAlerts(
  devices: TailscaleDevice[],
  options: UseDeviceAlertsOptions = {}
): void {
  const { onOffline, onOnline } = options;
  const previousDevices = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    const currentMap = new Map<string, boolean>();

    for (const device of devices) {
      const wasOnline = previousDevices.current.get(device.device_id);
      const isNowOnline = device.online;

      currentMap.set(device.device_id, isNowOnline);

      // Check for status changes
      if (wasOnline !== undefined && wasOnline !== isNowOnline) {
        if (isNowOnline && onOnline) {
          onOnline(device);
        } else if (!isNowOnline && onOffline) {
          onOffline(device);
        }
      }
    }

    previousDevices.current = currentMap;
  }, [devices, onOffline, onOnline]);
}

import { useRef } from 'react';
