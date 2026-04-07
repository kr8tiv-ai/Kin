import { existsSync } from 'fs';
import type { PhaseHandler, PhaseResult } from '../types.js';

/**
 * Tunnel-connect installer phase.
 *
 * Two-step phase:
 *   1. Binary install (local/safe → auto-fix): download cloudflared if missing
 *   2. Service connect (external/account → requires-confirmation): install as system service
 *
 * The engine calls this handler once for step 1 (returns boundary action),
 * then again after user confirmation for step 2 (executes service install).
 *
 * Reads `state.tunnelToken` — if absent, the phase is a no-op (not all users have tunnels).
 */

/**
 * Detect whether the cloudflared binary is already installed.
 * Separated for testability.
 */
export async function isBinaryInstalled(): Promise<{ installed: boolean; binPath: string }> {
  const { bin } = await import('cloudflared');
  return { installed: existsSync(bin), binPath: bin };
}

/**
 * Install the cloudflared binary using the cloudflared npm package.
 */
export async function installBinary(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { bin, install } = await import('cloudflared');
    await install(bin);
    if (!existsSync(bin)) {
      return { ok: false, error: `cloudflared binary not found at ${bin} after install` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `cloudflared binary install failed: ${err?.message || String(err)}` };
  }
}

/**
 * Execute `cloudflared service install <token>` as a system service.
 */
export async function installService(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { execSync } = await import('child_process');
    execSync(`cloudflared service install ${token}`, {
      stdio: 'pipe',
      timeout: 60_000,
    });
    return { ok: true };
  } catch (err: any) {
    const message = err?.stderr?.toString?.() || err?.message || 'cloudflared service install failed';
    return { ok: false, error: `Tunnel service install failed: ${message}` };
  }
}

export const tunnelConnectHandler: PhaseHandler = async (state) => {
  // No tunnel token → skip gracefully
  if (!state.tunnelToken) {
    return { ok: true };
  }

  // Check binary status
  let binaryReady = false;
  try {
    const { installed } = await isBinaryInstalled();
    binaryReady = installed;
  } catch {
    binaryReady = false;
  }

  // Step 1: Install binary if missing
  if (!binaryReady) {
    const result = await installBinary();
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
  }

  // Check if service is already being resumed after confirmation.
  // The engine calls the handler again after confirmExternalAction(true).
  // We detect the "post-confirmation" state by checking phaseHistory:
  // if the last entry for tunnel-connect was 'blocked', we're being re-invoked
  // after user confirmed the boundary action → execute service install.
  const lastTunnelEntry = [...state.phaseHistory]
    .reverse()
    .find(e => e.phase === 'tunnel-connect');

  if (lastTunnelEntry?.result === 'blocked') {
    // Post-confirmation: execute service install
    const result = await installService(state.tunnelToken);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }

  // First invocation with binary ready: return boundary for service connect
  return {
    ok: true,
    boundary: {
      id: 'tunnel-service-install',
      description: 'Install cloudflared as system service and connect tunnel',
      scope: 'external',
      risk: 'account',
    },
  };
};
