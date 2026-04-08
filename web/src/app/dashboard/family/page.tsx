'use client';

// ============================================================================
// Family Management Page — Create family, manage members, view activity.
// ============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useFamily, useSharedMemories, useFamilyActions } from '@/hooks/useFamily';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FamilyMemberCard } from '@/components/family/FamilyMemberCard';
import { SharedMemoryFeed } from '@/components/family/SharedMemoryFeed';

// ── Create Family Form ──────────────────────────────────────────────────────

function CreateFamilySection({ onCreated }: { onCreated: () => void }) {
  const { createFamily, loading, error } = useFamilyActions();
  const [name, setName] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    const result = await createFamily(name.trim());
    if (result) {
      setName('');
      onCreated();
    }
  };

  return (
    <div className="space-y-6">
      <EmptyState
        icon="👨‍👩‍👧‍👦"
        title="No Family Group"
        description="Create a family group to share companions with your family and manage child accounts with age-appropriate safety settings."
      />
      <GlassCard className="mx-auto max-w-sm p-5" hover={false}>
        <div className="flex flex-col items-center gap-3">
          <Input
            label="Family Name"
            placeholder="e.g. The Smiths"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button
            variant="primary"
            size="md"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Creating…' : 'Create Family'}
          </Button>
          {error && (
            <p className="text-xs text-magenta">{error}</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

// ── Add Child Form ──────────────────────────────────────────────────────────

function AddChildSection({ familyGroupId, onAdded }: { familyGroupId: string; onAdded: () => void }) {
  const { addChild, loading, error } = useFamilyActions();
  const [firstName, setFirstName] = useState('');
  const [ageBracket, setAgeBracket] = useState<'under_13' | 'teen'>('under_13');
  const [success, setSuccess] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!firstName.trim()) return;
    setSuccess(null);
    const result = await addChild(firstName.trim(), ageBracket, familyGroupId);
    if (result) {
      setSuccess(`${result.firstName} added as a ${result.ageBracket === 'under_13' ? 'child (under 13)' : 'teen'} with ${result.contentFilterLevel} content filtering.`);
      setFirstName('');
      onAdded();
    }
  };

  return (
    <GlassCard className="p-5" hover={false}>
      <h3 className="text-sm font-medium text-white mb-3">Add Child Account</h3>
      <div className="space-y-3">
        <Input
          label="Child's First Name"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            Age Bracket
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAgeBracket('under_13')}
              className={`rounded-pill border px-4 py-2 text-sm font-medium transition-colors ${
                ageBracket === 'under_13'
                  ? 'border-cyan bg-cyan/10 text-cyan'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              Under 13
            </button>
            <button
              type="button"
              onClick={() => setAgeBracket('teen')}
              className={`rounded-pill border px-4 py-2 text-sm font-medium transition-colors ${
                ageBracket === 'teen'
                  ? 'border-cyan bg-cyan/10 text-cyan'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              Teen (13–17)
            </button>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={loading || !firstName.trim()}
        >
          {loading ? 'Adding…' : 'Add Child'}
        </Button>
        {error && <p className="text-xs text-magenta">{error}</p>}
        {success && <p className="text-xs text-cyan">{success}</p>}
      </div>
    </GlassCard>
  );
}

// ── Invite Section ──────────────────────────────────────────────────────────

function InviteSection({ familyGroupId }: { familyGroupId: string }) {
  const { generateInvite, loading, error } = useFamilyActions();
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const handleGenerate = async () => {
    const result = await generateInvite(familyGroupId);
    if (result) {
      setInviteCode(result.code);
    }
  };

  return (
    <GlassCard className="p-5" hover={false}>
      <h3 className="text-sm font-medium text-white mb-3">Invite Family Member</h3>
      <p className="text-xs text-white/50 mb-3">
        Generate a single-use invite code that another user can redeem to join your family group. Codes expire after 7 days.
      </p>
      {inviteCode ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="rounded-md border border-cyan/20 bg-cyan/5 px-3 py-1.5 font-mono text-lg text-cyan tracking-wider">
              {inviteCode}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(inviteCode);
              }}
              className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
              title="Copy code"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-white/40">Share this code with a family member.</p>
          <button
            type="button"
            onClick={() => { setInviteCode(null); }}
            className="text-xs text-white/40 hover:text-white/60 underline"
          >
            Generate new code
          </button>
        </div>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating…' : 'Generate Invite Code'}
          </Button>
          {error && <p className="mt-2 text-xs text-magenta">{error}</p>}
        </>
      )}
    </GlassCard>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function FamilyPage() {
  const { user } = useAuth();
  const { family, loading, error, refresh } = useFamily();
  const { memories, loading: memoriesLoading } = useSharedMemories();
  const { removeMember } = useFamilyActions();

  const handleRemove = async (memberId: string) => {
    const ok = await removeMember(memberId);
    if (ok) refresh();
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  // No family — show create form
  if (error || !family) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-white">Family</h1>
          <p className="mt-1 text-sm text-white/50">
            Manage your family group, child accounts, and shared experiences.
          </p>
        </div>
        <CreateFamilySection onCreated={refresh} />
      </motion.div>
    );
  }

  const isParent = family.myRole === 'parent';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-8"
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-white">
            {family.familyName}
          </h1>
          <Badge color={isParent ? 'gold' : 'muted'}>
            {family.myRole}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-white/50">
          {family.members.length} member{family.members.length !== 1 ? 's' : ''} in your family group
        </p>
      </div>

      {/* Members */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-white/70">Members</h2>
        <div className="space-y-2">
          {family.members.map((member) => (
            <FamilyMemberCard
              key={member.memberId}
              member={member}
              isCurrentUser={member.userId === user?.id}
              onRemove={isParent ? handleRemove : undefined}
            />
          ))}
        </div>
      </section>

      {/* Parent-only management sections */}
      {isParent && (
        <div className="grid gap-6 md:grid-cols-2">
          <AddChildSection familyGroupId={family.familyGroupId} onAdded={refresh} />
          <InviteSection familyGroupId={family.familyGroupId} />
        </div>
      )}

      {/* Shared Memories — parent-only */}
      {isParent && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-white/70">Shared Memories</h2>
          <SharedMemoryFeed memories={memories} loading={memoriesLoading} />
        </section>
      )}
    </motion.div>
  );
}
