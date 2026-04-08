'use client';

// ============================================================================
// usePWAInstall — Hook for PWA install prompt, standalone detection, and iOS
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const DISMISS_KEY = 'kin-pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Check if running in standalone (installed PWA) mode. */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari standalone
  if (typeof navigator !== 'undefined' && 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone) {
    return true;
  }
  // Standard display-mode media query
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

/** Detect iOS device via user agent. */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad/i.test(navigator.userAgent ?? '');
}

/** Check if dismiss timestamp is still within the 7-day window. */
export function isDismissedRecently(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAInstallState {
  /** True when the browser offers a native install prompt (non-iOS). */
  canInstall: boolean;
  /** True when already running as an installed PWA. */
  isInstalled: boolean;
  /** True when user is on iOS (needs manual Add to Home Screen). */
  isIOS: boolean;
  /** True when user dismissed the install prompt within the last 7 days. */
  isDismissed: boolean;
  /** Trigger the native install prompt (Chromium-based browsers). */
  promptInstall: () => Promise<void>;
  /** Dismiss the install banner for 7 days. */
  dismissInstall: () => void;
}

export function usePWAInstall(): PWAInstallState {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect current state
    setIsInstalled(isStandaloneMode());
    setIsIOS(isIOSDevice());
    setIsDismissed(isDismissedRecently());

    // Capture the beforeinstallprompt event
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    // Detect app installed event
    function handleAppInstalled() {
      deferredPrompt.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setCanInstall(false);
    }
    deferredPrompt.current = null;
  }, []);

  const dismissInstall = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage full or disabled — silently ignore
    }
    setIsDismissed(true);
  }, []);

  return { canInstall, isInstalled, isIOS, isDismissed, promptInstall, dismissInstall };
}
