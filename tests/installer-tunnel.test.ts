/**
 * Tunnel-connect installer phase tests.
 *
 * Verifies the tunnel-connect phase handler:
 * - Skips gracefully when no tunnel token in state
 * - Returns boundary action for external service install
 * - Policy classifies binary install as auto-fix and service install as requires-confirmation
 * - Phase ordering: services → tunnel-connect → verification
 * - Binary install called when binary missing (mock cloudflared import)
 * - cloudflared install failure returns ok:false
 * - service install failure returns ok:false
 *
 * K001/K019: No better-sqlite3 dependency — no native module skip guard needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  INSTALLER_PHASE_ORDER,
  createInitialInstallerState,
  getNextPhase,
  type InstallerRunState,
  type InstallerPhase,
} from '../scripts/installer/types.js';
import { evaluateInstallerAction } from '../scripts/installer/policy.js';

// ---------------------------------------------------------------------------
// Mock cloudflared before importing the phase handler
// ---------------------------------------------------------------------------
const mockBin = '/fake/path/cloudflared';
const mockInstall = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);
const mockServiceInstall = vi.fn<[string], void>();

vi.mock('cloudflared', () => ({
  bin: mockBin,
  install: (...args: any[]) => mockInstall(...args),
  service: { install: (...args: any[]) => mockServiceInstall(...args) },
}));

// Mock fs.existsSync for binary detection
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
  };
});

// Mock child_process for service install
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

import { existsSync } from 'fs';
import { tunnelConnectHandler } from '../scripts/installer/phases/tunnel-connect.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeState(overrides: Partial<InstallerRunState> = {}): InstallerRunState {
  return {
    ...createInitialInstallerState({ runId: 'test-run' }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('tunnel-connect phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as any).mockReturnValue(false);
  });

  // ---- Phase ordering ----

  describe('phase ordering', () => {
    it('InstallerPhase includes tunnel-connect', () => {
      expect(INSTALLER_PHASE_ORDER).toContain('tunnel-connect');
    });

    it('tunnel-connect comes after services and before verification', () => {
      const idx = INSTALLER_PHASE_ORDER.indexOf('tunnel-connect');
      const servicesIdx = INSTALLER_PHASE_ORDER.indexOf('services');
      const verificationIdx = INSTALLER_PHASE_ORDER.indexOf('verification');

      expect(idx).toBeGreaterThan(servicesIdx);
      expect(idx).toBeLessThan(verificationIdx);
    });

    it('getNextPhase(services) returns tunnel-connect', () => {
      expect(getNextPhase('services')).toBe('tunnel-connect');
    });

    it('getNextPhase(tunnel-connect) returns verification', () => {
      expect(getNextPhase('tunnel-connect')).toBe('verification');
    });
  });

  // ---- No tunnel token (skip) ----

  describe('no tunnel token', () => {
    it('returns ok:true when tunnelToken is undefined', async () => {
      const state = makeState();
      const result = await tunnelConnectHandler(state);

      expect(result.ok).toBe(true);
      expect(result.boundary).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('does not call cloudflared install when no token', async () => {
      const state = makeState();
      await tunnelConnectHandler(state);

      expect(mockInstall).not.toHaveBeenCalled();
    });
  });

  // ---- Binary install ----

  describe('binary install', () => {
    it('calls install when binary is missing', async () => {
      (existsSync as any).mockReturnValue(false)
        // After install, simulate binary now exists
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const state = makeState({ tunnelToken: 'test-token-123' });
      await tunnelConnectHandler(state);

      expect(mockInstall).toHaveBeenCalledWith(mockBin);
    });

    it('skips install when binary already exists', async () => {
      (existsSync as any).mockReturnValue(true);

      const state = makeState({ tunnelToken: 'test-token-123' });
      await tunnelConnectHandler(state);

      expect(mockInstall).not.toHaveBeenCalled();
    });

    it('returns ok:false when install throws', async () => {
      (existsSync as any).mockReturnValue(false);
      mockInstall.mockRejectedValueOnce(new Error('Network timeout'));

      const state = makeState({ tunnelToken: 'test-token-123' });
      const result = await tunnelConnectHandler(state);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('binary install failed');
      expect(result.error).toContain('Network timeout');
    });

    it('returns ok:false when binary still missing after install', async () => {
      // existsSync returns false both before and after install
      (existsSync as any).mockReturnValue(false);

      const state = makeState({ tunnelToken: 'test-token-123' });
      const result = await tunnelConnectHandler(state);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ---- Boundary action (service connect) ----

  describe('service connect boundary', () => {
    it('returns boundary action when binary is installed and no prior blocked entry', async () => {
      (existsSync as any).mockReturnValue(true);

      const state = makeState({ tunnelToken: 'test-token-123' });
      const result = await tunnelConnectHandler(state);

      expect(result.ok).toBe(true);
      expect(result.boundary).toBeDefined();
      expect(result.boundary!.id).toBe('tunnel-service-install');
      expect(result.boundary!.scope).toBe('external');
      expect(result.boundary!.risk).toBe('account');
    });

    it('policy classifies binary install action as auto-fix', () => {
      const result = evaluateInstallerAction({
        id: 'tunnel-binary-install',
        description: 'Download cloudflared binary',
        scope: 'local',
        risk: 'safe',
      });

      expect(result.decision).toBe('auto-fix');
    });

    it('policy classifies service install action as requires-confirmation', () => {
      const result = evaluateInstallerAction({
        id: 'tunnel-service-install',
        description: 'Install cloudflared as system service and connect tunnel',
        scope: 'external',
        risk: 'account',
      });

      expect(result.decision).toBe('requires-confirmation');
    });
  });

  // ---- Post-confirmation service install ----

  describe('post-confirmation service install', () => {
    it('executes service install when last tunnel entry was blocked', async () => {
      (existsSync as any).mockReturnValue(true);
      mockExecSync.mockReturnValue(Buffer.from(''));

      const state = makeState({
        tunnelToken: 'test-token-abc',
        phaseHistory: [
          { phase: 'tunnel-connect' as InstallerPhase, result: 'blocked', timestamp: 1000, error: 'Requires confirmation' },
        ],
      });

      const result = await tunnelConnectHandler(state);

      expect(result.ok).toBe(true);
      expect(result.boundary).toBeUndefined();
      expect(mockExecSync).toHaveBeenCalledWith(
        'cloudflared service install test-token-abc',
        expect.objectContaining({ stdio: 'pipe', timeout: 60_000 }),
      );
    });

    it('returns ok:false when service install command fails', async () => {
      (existsSync as any).mockReturnValue(true);
      const err = new Error('Permission denied');
      (err as any).stderr = Buffer.from('permission denied: requires root');
      mockExecSync.mockImplementation(() => { throw err; });

      const state = makeState({
        tunnelToken: 'test-token-abc',
        phaseHistory: [
          { phase: 'tunnel-connect' as InstallerPhase, result: 'blocked', timestamp: 1000 },
        ],
      });

      const result = await tunnelConnectHandler(state);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('service install failed');
      expect(result.error).toContain('permission denied');
    });
  });
});
