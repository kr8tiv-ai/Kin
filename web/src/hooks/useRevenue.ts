'use client';

// ============================================================================
// useRevenue — Data-fetching hooks for revenue reports and distributions.
// ============================================================================

import { useApi } from '@/hooks/useApi';
import { kinApi } from '@/lib/api';
import type { RevenueReport, RevenueDistribution } from '@/lib/types';

// --- Admin hooks -----------------------------------------------------------

interface RevenueReportsResponse {
  reports: RevenueReport[];
  pagination: { total: number; limit: number; offset: number };
}

export function useRevenueReports() {
  return useApi<RevenueReportsResponse>('/admin/revenue/reports');
}

export function useRevenueReport(reportId: string | null) {
  return useApi<RevenueReport>(
    `/admin/revenue/reports/${reportId}`,
    { skip: !reportId },
  );
}

export async function generateReport(
  periodStart: number,
  periodEnd: number,
): Promise<RevenueReport> {
  return kinApi.post<RevenueReport>('/admin/revenue/generate', {
    periodStart,
    periodEnd,
  });
}

// --- Holder hooks ----------------------------------------------------------

interface MyDistributionsResponse {
  distributions: RevenueDistribution[];
  pagination: { total: number; limit: number; offset: number };
}

export function useMyDistributions() {
  return useApi<MyDistributionsResponse>('/revenue/my-distributions');
}
