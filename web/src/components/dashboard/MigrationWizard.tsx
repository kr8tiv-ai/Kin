'use client';

// ============================================================================
// MigrationWizard — Multi-step modal for export/import data migration.
//
// Export flow: confirm → executing → result
// Import flow: confirm → privacy → executing → result
//
// Uses direct fetch() for binary ZIP download and FormData upload since
// kinApi only handles JSON.
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useToast } from '@/providers/ToastProvider';
import { getAuthToken } from '@/lib/auth';
import type { ImportArchiveResult } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

type WizardMode = 'export' | 'import';
type WizardStep = 'confirm' | 'privacy' | 'executing' | 'result';

interface MigrationWizardProps {
  mode: WizardMode;
  open: boolean;
  onClose: () => void;
}

interface ExecutionResult {
  success: boolean;
  error?: string;
  importResult?: ImportArchiveResult;
}

// ============================================================================
// Pure Helpers (K023)
// ============================================================================

/** Determine the next step in the wizard based on current step and mode. */
export function getNextStep(current: WizardStep, mode: WizardMode): WizardStep {
  switch (current) {
    case 'confirm':
      return mode === 'import' ? 'privacy' : 'executing';
    case 'privacy':
      return 'executing';
    case 'executing':
      return 'result';
    case 'result':
      return 'result'; // terminal
  }
}

/** Build the API base URL for direct fetch calls (mirrors kinApi pattern). */
function getApiBase(): string {
  return typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_URL ?? '/api');
}

// ============================================================================
// Step Transition Animation
// ============================================================================

const stepVariants = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

// ============================================================================
// Component
// ============================================================================

export function MigrationWizard({ mode, open, onClose }: MigrationWizardProps) {
  const [step, setStep] = useState<WizardStep>('confirm');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const reset = useCallback(() => {
    setStep('confirm');
    setPrivacyConsent(false);
    setProgress(0);
    setStatusText('');
    setResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const advance = useCallback(() => {
    setStep((s) => getNextStep(s, mode));
  }, [mode]);

  // --------------------------------------------------------------------------
  // Export: GET /export/archive → blob → download
  // --------------------------------------------------------------------------
  const executeExport = useCallback(async () => {
    setProgress(10);
    setStatusText('Preparing archive…');

    const token = getAuthToken();
    if (!token) {
      setResult({ success: false, error: 'Not authenticated. Please log in again.' });
      setStep('result');
      return;
    }

    try {
      setProgress(30);
      setStatusText('Downloading archive…');

      const res = await fetch(`${getApiBase()}/export/archive`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Server returned ${res.status}`);
      }

      setProgress(70);
      setStatusText('Saving file…');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kin-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setProgress(100);
      setResult({ success: true });
      setStep('result');
      toastSuccess('Export complete — archive downloaded.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setResult({ success: false, error: message });
      setStep('result');
      toastError(`Export failed: ${message}`);
    }
  }, [toastSuccess, toastError]);

  // --------------------------------------------------------------------------
  // Import: file input → POST /import/archive as FormData → parse result
  // --------------------------------------------------------------------------
  const executeImport = useCallback(async (file: File) => {
    setProgress(10);
    setStatusText('Uploading archive…');

    const token = getAuthToken();
    if (!token) {
      setResult({ success: false, error: 'Not authenticated. Please log in again.' });
      setStep('result');
      return;
    }

    try {
      setProgress(30);
      setStatusText('Processing archive…');

      const form = new FormData();
      form.append('archive', file);

      const res = await fetch(`${getApiBase()}/import/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      setProgress(70);
      setStatusText('Parsing results…');

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Server returned ${res.status}`);
      }

      let importResult: ImportArchiveResult;
      try {
        importResult = await res.json();
      } catch {
        throw new Error('Server returned an invalid response.');
      }

      setProgress(100);
      setResult({ success: importResult.success, importResult });
      setStep('result');

      if (importResult.success) {
        toastSuccess(`Import complete — ${importResult.totalImported} records restored.`);
      } else {
        toastError(`Import completed with errors (${importResult.totalErrors} errors).`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setResult({ success: false, error: message });
      setStep('result');
      toastError(`Import failed: ${message}`);
    }
  }, [toastSuccess, toastError]);

  // --------------------------------------------------------------------------
  // Step: Confirm
  // --------------------------------------------------------------------------
  const renderConfirm = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        {mode === 'export' ? (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">📦</span>
              <h3 className="font-display text-sm font-semibold text-cyan">
                Export Your Data
              </h3>
            </div>
            <p className="text-sm text-white/60">
              Download a complete archive of your KIN data including conversations,
              memories, companion configurations, and training data. The archive is
              a standard ZIP file you can keep as a backup or use to move your KIN
              to another device.
            </p>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">📥</span>
              <h3 className="font-display text-sm font-semibold text-cyan">
                Import Your Data
              </h3>
            </div>
            <p className="text-sm text-white/60">
              Upload a KIN archive to restore your data. This will import your
              conversations, memories, companion configurations, and other settings
              from a previously exported archive.
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={advance}>
          {mode === 'export' ? 'Start Export' : 'Continue'}
        </Button>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // Step: Privacy Warning (import only)
  // --------------------------------------------------------------------------
  const renderPrivacy = () => (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        Importing data changes how your KIN works. Please review what happens:
      </p>

      {/* Local / safe card */}
      <div className="rounded-lg border border-cyan/20 bg-cyan/[0.04] p-4">
        <h4 className="mb-1.5 text-sm font-semibold text-cyan">
          🔒 What stays on your device
        </h4>
        <ul className="space-y-1 text-sm text-white/60">
          <li>• Your companion&apos;s personality and memory remain local</li>
          <li>• Private conversations stay in your local database</li>
          <li>• You keep full control of when data leaves your device</li>
        </ul>
      </div>

      {/* Cloud / warning card */}
      <div className="rounded-lg border border-magenta/20 bg-magenta/[0.04] p-4">
        <h4 className="mb-1.5 text-sm font-semibold text-magenta">
          ⚠️ What changes with imported data
        </h4>
        <ul className="space-y-1 text-sm text-white/60">
          <li>• Imported data replaces existing records where IDs overlap</li>
          <li>• If the archive came from a cloud instance, your local KIN
              will now hold data that previously lived on a server</li>
          <li>• Privacy mode settings in the archive will be applied — check
              your preferences after import</li>
        </ul>
      </div>

      {/* Consent checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]">
        <input
          type="checkbox"
          checked={privacyConsent}
          onChange={(e) => setPrivacyConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/30 bg-transparent accent-cyan"
        />
        <span className="text-sm text-white/70">
          I understand these changes and want to proceed with the import.
        </span>
      </label>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => setStep('confirm')}>
          Back
        </Button>
        <Button
          variant="primary"
          disabled={!privacyConsent}
          onClick={advance}
        >
          Proceed to Import
        </Button>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // Step: Executing
  // --------------------------------------------------------------------------
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        executeImport(file);
      }
    },
    [executeImport],
  );

  const renderExecuting = () => {
    // Trigger export immediately on entering this step
    if (mode === 'export' && progress === 0) {
      // Use microtask to avoid setState during render
      queueMicrotask(() => executeExport());
    }

    return (
      <div className="space-y-6 py-2">
        {mode === 'import' && progress === 0 ? (
          // File selection for import
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan/10">
              <span className="text-2xl">📁</span>
            </div>
            <p className="mb-4 text-sm text-white/60">
              Select a KIN archive (.zip) to import.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
          </div>
        ) : (
          // Progress display
          <div className="space-y-3">
            <ProgressBar
              value={progress}
              color="cyan"
              label={statusText}
              showPercent
            />
            <p className="text-center text-xs text-white/40">
              {mode === 'export'
                ? 'Packaging your data for download…'
                : 'Restoring your data from the archive…'}
            </p>
          </div>
        )}
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // Step: Result
  // --------------------------------------------------------------------------
  const renderResult = () => {
    if (!result) return null;

    return (
      <div className="space-y-4">
        {result.success ? (
          // Success state
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <svg
                className="h-7 w-7 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="font-display text-lg font-semibold text-white">
              {mode === 'export' ? 'Export Complete' : 'Import Complete'}
            </h3>
            <p className="mt-1 text-sm text-white/50">
              {mode === 'export'
                ? 'Your archive has been downloaded successfully.'
                : `${result.importResult?.totalImported ?? 0} records imported successfully.`}
            </p>
          </div>
        ) : (
          // Error state
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-magenta/10">
              <svg
                className="h-7 w-7 text-magenta"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h3 className="font-display text-lg font-semibold text-white">
              {mode === 'export' ? 'Export Failed' : 'Import Failed'}
            </h3>
            <p className="mt-1 text-sm text-magenta/80">
              {result.error ?? 'An unexpected error occurred.'}
            </p>
          </div>
        )}

        {/* Import category breakdown */}
        {result.importResult && result.importResult.categories.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Import Details
            </h4>
            <div className="space-y-1.5">
              {result.importResult.categories.map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="capitalize text-white/60">{cat.category}</span>
                  <div className="flex gap-3 text-xs">
                    {cat.imported > 0 && (
                      <span className="text-emerald-400">
                        +{cat.imported} imported
                      </span>
                    )}
                    {cat.skipped > 0 && (
                      <span className="text-gold">
                        {cat.skipped} skipped
                      </span>
                    )}
                    {cat.errors.length > 0 && (
                      <span className="text-magenta">
                        {cat.errors.length} errors
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* File artifacts summary */}
            {result.importResult.fileArtifacts && (
              <div className="mt-3 border-t border-white/5 pt-3">
                <div className="flex justify-between text-xs text-white/40">
                  <span>Files restored</span>
                  <span>
                    {result.importResult.fileArtifacts.restored} /{' '}
                    {result.importResult.fileArtifacts.restored +
                      result.importResult.fileArtifacts.failed}
                  </span>
                </div>
              </div>
            )}

            {/* Model restoration summary */}
            {result.importResult.modelRestoration &&
              result.importResult.modelRestoration.attempted > 0 && (
                <div className="mt-2 flex justify-between text-xs text-white/40">
                  <span>Models restored</span>
                  <span>
                    {result.importResult.modelRestoration.succeeded} /{' '}
                    {result.importResult.modelRestoration.attempted}
                  </span>
                </div>
              )}

            {/* Duration */}
            <div className="mt-2 text-right text-xs text-white/30">
              Completed in {(result.importResult.durationMs / 1000).toFixed(1)}s
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  const stepTitle: Record<WizardStep, string> = {
    confirm: mode === 'export' ? 'Export Data' : 'Import Data',
    privacy: 'Privacy Notice',
    executing: mode === 'export' ? 'Exporting…' : 'Importing…',
    result: result?.success ? 'Complete' : 'Result',
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={stepTitle[step]}
      className="max-w-md"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {step === 'confirm' && renderConfirm()}
          {step === 'privacy' && renderPrivacy()}
          {step === 'executing' && renderExecuting()}
          {step === 'result' && renderResult()}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
