// ============================================================================
// PWA Install Hook — Unit tests for pure detection/dismiss functions.
// Manually sets up browser-like globals without requiring jsdom.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Setup minimal browser globals for Node test environment
// ---------------------------------------------------------------------------

function setupBrowserGlobals() {
  // Ensure window exists
  if (typeof globalThis.window === 'undefined') {
    (globalThis as Record<string, unknown>).window = globalThis;
  }
  // Ensure navigator exists
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as Record<string, unknown>).navigator = {
      userAgent: 'Mozilla/5.0 (Test)',
    };
  }
}

// Run before module import
setupBrowserGlobals();

// Now import the functions — they'll see window and navigator
import { isStandaloneMode, isIOSDevice, isDismissedRecently } from '../web/src/hooks/usePWAInstall';

// ---------------------------------------------------------------------------
// isStandaloneMode
// ---------------------------------------------------------------------------

describe('isStandaloneMode', () => {
  let originalMatchMedia: typeof globalThis.window.matchMedia | undefined;

  beforeEach(() => {
    originalMatchMedia = globalThis.window?.matchMedia;
    // Default: not standalone
    (globalThis.window as Record<string, unknown>).matchMedia = vi.fn().mockReturnValue({ matches: false });
    // Remove iOS standalone flag if present
    if ('standalone' in globalThis.navigator) {
      delete (globalThis.navigator as Record<string, unknown>).standalone;
    }
  });

  afterEach(() => {
    if (originalMatchMedia) {
      (globalThis.window as Record<string, unknown>).matchMedia = originalMatchMedia;
    } else {
      delete (globalThis.window as Record<string, unknown>).matchMedia;
    }
  });

  it('returns false when not in standalone mode', () => {
    expect(isStandaloneMode()).toBe(false);
  });

  it('returns true when matchMedia (display-mode: standalone) matches', () => {
    (globalThis.window as Record<string, unknown>).matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(isStandaloneMode()).toBe(true);
  });

  it('returns true when navigator.standalone is true (iOS Safari)', () => {
    (globalThis.navigator as Record<string, unknown>).standalone = true;
    expect(isStandaloneMode()).toBe(true);
    delete (globalThis.navigator as Record<string, unknown>).standalone;
  });
});

// ---------------------------------------------------------------------------
// isIOSDevice
// ---------------------------------------------------------------------------

describe('isIOSDevice', () => {
  let originalUA: string;

  beforeEach(() => {
    originalUA = globalThis.navigator.userAgent;
  });

  afterEach(() => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: originalUA,
      writable: true,
      configurable: true,
    });
  });

  it('returns true for iPhone user agent', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(isIOSDevice()).toBe(true);
  });

  it('returns true for iPad user agent', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(isIOSDevice()).toBe(true);
  });

  it('returns false for Android user agent', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      writable: true,
      configurable: true,
    });
    expect(isIOSDevice()).toBe(false);
  });

  it('returns false for desktop user agent', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      writable: true,
      configurable: true,
    });
    expect(isIOSDevice()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDismissedRecently — localStorage with 7-day expiry
// ---------------------------------------------------------------------------

describe('isDismissedRecently', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    const storage = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { mockStorage = {}; }),
      length: 0,
      key: vi.fn(() => null),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no dismiss key exists', () => {
    expect(isDismissedRecently()).toBe(false);
  });

  it('returns true when dismissed within 7 days', () => {
    mockStorage['kin-pwa-install-dismissed'] = String(Date.now() - 60 * 60 * 1000);
    expect(isDismissedRecently()).toBe(true);
  });

  it('returns false when dismissed more than 7 days ago', () => {
    mockStorage['kin-pwa-install-dismissed'] = String(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(isDismissedRecently()).toBe(false);
  });

  it('returns false when stored value is not a number', () => {
    mockStorage['kin-pwa-install-dismissed'] = 'invalid';
    expect(isDismissedRecently()).toBe(false);
  });

  it('returns false when localStorage throws', () => {
    (globalThis.localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(isDismissedRecently()).toBe(false);
  });
});
