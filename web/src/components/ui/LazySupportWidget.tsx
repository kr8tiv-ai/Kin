'use client';

// ============================================================================
// LazySupportWidget — Lazy-loaded wrapper for SupportWidget.
// Uses next/dynamic with ssr:false to defer loading until client-side render,
// keeping the bundle smaller for initial page loads.
// ============================================================================

import dynamic from 'next/dynamic';

const SupportWidget = dynamic(
  () => import('@/components/ui/SupportWidget').then((m) => m.SupportWidget),
  { ssr: false },
);

export function LazySupportWidget() {
  return <SupportWidget />;
}
