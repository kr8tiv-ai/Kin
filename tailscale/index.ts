/**
 * Tailscale Module - Remote access integration for KIN
 *
 * This module provides secure remote access with:
 * - Tailscale API client
 * - Device management
 * - Trust ladder enforcement
 * - Remote session management
 * - Device pairing flow
 *
 * @example
 * ```typescript
 * import { 
 *   TailscaleClient, 
 *   RemoteAccessManager,
 *   DevicePairing 
 * } from './tailscale';
 *
 * // List devices
 * const client = getTailscaleClient();
 * const devices = await client.listDevices();
 *
 * // Request remote access
 * const manager = getRemoteAccessManager();
 * const session = await manager.requestAccess({
 *   userId: 'user-123',
 *   deviceId: 'device-456',
 *   reason: 'Debug production issue',
 *   requestedDuration: 3600,
 *   trustLevel: 2
 * });
 *
 * // Pair new device
 * const pairing = new DevicePairing();
 * const { pairingUrl, pairingCode } = await pairing.generatePairingUrl();
 * ```
 *
 * @module tailscale
 */

export {
  TailscaleClient,
  TailscaleError,
  RemoteAccessManager,
  DevicePairing,
  getTailscaleClient,
  getRemoteAccessManager,
  type TailscaleConfig,
  type Device,
  type PeerConnection,
  type TrustLevel,
  type RemoteSession,
  type AccessRequest,
} from './client';

export { default as TailscaleClient } from './client';
