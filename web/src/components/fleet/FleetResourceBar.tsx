'use client';

// ============================================================================
// FleetResourceBar — VPS headroom visualization bar.
// Shows running vs total instances and memory estimate within max capacity.
// ============================================================================

interface FleetResourceBarProps {
  running: number;
  total: number;
  /** Maximum instances the VPS can host. Defaults to 64 (MAX_INSTANCES). */
  maxInstances?: number;
}

const MEM_PER_INSTANCE_MB = 256;
const CONTAINERS_PER_INSTANCE = 2;

export function FleetResourceBar({
  running,
  total,
  maxInstances = 64,
}: FleetResourceBarProps) {
  const cap = Math.max(maxInstances, 1);
  const runningPct = (running / cap) * 100;
  const totalPct = (total / cap) * 100;
  const headroomPct = Math.max(0, 100 - totalPct);

  const runningMemMb = running * MEM_PER_INSTANCE_MB * CONTAINERS_PER_INSTANCE;
  const totalMemMb = total * MEM_PER_INSTANCE_MB * CONTAINERS_PER_INSTANCE;
  const maxMemMb = cap * MEM_PER_INSTANCE_MB * CONTAINERS_PER_INSTANCE;

  return (
    <div className="rounded-lg border border-white/[0.15] bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-white/70">Instance Capacity</span>
        <span className="text-white/50">
          {total} / {cap} slots used
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-4 w-full overflow-hidden rounded-full border border-white/[0.15] bg-white/[0.04]">
        {/* Total provisioned (includes stopped) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/10 transition-all duration-500"
          style={{ width: `${Math.min(totalPct, 100)}%` }}
        />
        {/* Running portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-cyan/60 transition-all duration-500"
          style={{ width: `${Math.min(runningPct, 100)}%` }}
        />
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-cyan/60" />
          Running: {running} ({formatMem(runningMemMb)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-white/10" />
          Provisioned: {total} ({formatMem(totalMemMb)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-white/[0.15]" />
          Max: {cap} ({formatMem(maxMemMb)})
        </span>
        <span className="text-white/30">
          Headroom: {headroomPct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}
