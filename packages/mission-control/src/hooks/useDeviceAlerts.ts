/**
 * useDeviceAlerts hook for monitoring device offline status.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TailscaleDevice } from './useTailscaleStatus';

export interface DeviceAlert {
  device_id: string;
  hostname: string;
  type: 'offline' | 'online' | 'new_device';
  timestamp: string;
  message: string;
}

interface UseDeviceAlertsOptions {
  onOffline?: (alert: DeviceAlert) => void;
  onOnline?: (alert: DeviceAlert) => void;
  onNewDevice?: (alert: DeviceAlert) => void;
  onAlert?: (alert: DeviceAlert) => void;
  enabled?: boolean;
}

export function useDeviceAlerts(
  devices: TailscaleDevice[],
  options: UseDeviceAlertsOptions = {}
): DeviceAlert[] {
  const {
    onOffline,
    onOnline,
    onNewDevice,
    onAlert,
    enabled = true,
  } = options;

  const alertsRef = useRef<DeviceAlert[]>([]);
  const previousDevicesRef = useRef<Map<string, { online: boolean }>>(new Map());
  const knownDevicesRef = useRef<Set<string>>(new Set());

  const createAlert = useCallback((
    device: TailscaleDevice,
    type: DeviceAlert['type']
  ): DeviceAlert => {
    const messages: Record<DeviceAlert['type'], string> = {
      offline: `Device "${device.hostname}" went offline`,
      online: `Device "${device.hostname}" is back online`,
      new_device: `New device "${device.hostname}" joined the network`,
    };

    return {
      device_id: device.device_id,
      hostname: device.hostname,
      type,
      timestamp: new Date().toISOString(),
      message: messages[type],
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const currentMap = new Map<string, { online: boolean }>();
    const newAlerts: DeviceAlert[] = [];

    for (const device of devices) {
      const previous = previousDevicesRef.current.get(device.device_id);
      const wasKnown = knownDevicesRef.current.has(device.device_id);

      currentMap.set(device.device_id, { online: device.online });

      // Check for new device
      if (!wasKnown) {
        knownDevicesRef.current.add(device.device_id);
        if (previous === undefined) {
          // First time seeing this device in this session
          const alert = createAlert(device, 'new_device');
          newAlerts.push(alert);
          onNewDevice?.(alert);
          onAlert?.(alert);
        }
        continue;
      }

      // Check for status changes
      if (previous !== undefined && previous.online !== device.online) {
        const type = device.online ? 'online' : 'offline';
        const alert = createAlert(device, type);
        newAlerts.push(alert);

        if (device.online) {
          onOnline?.(alert);
        } else {
          onOffline?.(alert);
        }
        onAlert?.(alert);
      }
    }

    // Update refs
    previousDevicesRef.current = currentMap;
    alertsRef.current = [...newAlerts, ...alertsRef.current].slice(0, 100);

  }, [devices, enabled, createAlert, onOffline, onOnline, onNewDevice, onAlert]);

  return alertsRef.current;
}

export default useDeviceAlerts;
