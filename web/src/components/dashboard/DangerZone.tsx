'use client';

// ============================================================================
// DangerZone — Account deletion section with confirmation modal.
// ============================================================================

import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function DangerZone() {
  const [showModal, setShowModal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <>
      <GlassCard
        className="border-magenta/20 p-6"
        hover={false}
      >
        <h2 className="font-display text-lg font-semibold text-magenta">
          Danger Zone
        </h2>
        <p className="mt-2 text-sm text-white/50">
          Permanently delete your account and all associated data. This action
          is irreversible.
        </p>
        <div className="mt-4">
          <Button
            variant="outline"
            className="border-magenta/40 text-magenta hover:bg-magenta/10"
            onClick={() => setShowModal(true)}
          >
            Delete Account
          </Button>
        </div>
      </GlassCard>

      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setConfirmed(false);
        }}
        title="Delete Account"
      >
        {!confirmed ? (
          <>
            <div className="mb-6 space-y-3">
              <p className="text-sm text-white/60">
                This will permanently delete:
              </p>
              <ul className="space-y-1.5 text-sm text-white/50">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-magenta" />
                  All your conversations and chat history
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-magenta" />
                  Your companion memories and preferences
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-magenta" />
                  All projects and deployed websites
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-magenta" />
                  Your subscription (no refunds for remaining period)
                </li>
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowModal(false);
                  setConfirmed(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-magenta"
                onClick={() => setConfirmed(true)}
              >
                I understand, continue
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan/10">
              <svg
                className="h-6 w-6 text-cyan"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="mb-2 font-display text-lg font-semibold text-white">
              Contact Support
            </h3>
            <p className="mb-4 text-sm text-white/50">
              To delete your account, please contact our support team at{' '}
              <span className="text-cyan">support@meetyourkin.com</span>.
              We will process your request within 48 hours.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setShowModal(false);
                setConfirmed(false);
              }}
            >
              Close
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
