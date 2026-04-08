'use client';

// ============================================================================
// useSWUpdate — Detects service worker updates and prompts user to reload.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';

export interface SWUpdateState {
  /** True when a new service worker version is waiting to activate. */
  updateAvailable: boolean;
  /** Reload the page to activate the new service worker. */
  reloadToUpdate: () => void;
  /** Dismiss the update notification. */
  dismissUpdate: () => void;
}

export function useSWUpdate(): SWUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Listen for the controlling SW changing (another tab activated a new SW)
    function handleControllerChange() {
      setUpdateAvailable(true);
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Also check if a waiting SW exists on the current registration
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        setUpdateAvailable(true);
      }

      // Listen for new SW entering waiting state
      reg?.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW?.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {
      // SW registration not available — ignore
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const reloadToUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, reloadToUpdate, dismissUpdate };
}
