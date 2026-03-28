'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ToastContainer, type ToastData } from '@/components/ui/Toast';

interface ToastContextValue {
  toast: (message: string, type?: ToastData['type']) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: addToast,
      success: (msg) => addToast(msg, 'success'),
      error: (msg) => addToast(msg, 'error'),
      info: (msg) => addToast(msg, 'info'),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
