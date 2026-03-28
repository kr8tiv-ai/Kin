import clsx, { type ClassValue } from 'clsx';

/**
 * Merge class names with clsx. Handles conditional classes,
 * arrays, and falsy values.
 */
export function cn(...classes: ClassValue[]): string {
  return clsx(...classes);
}

/**
 * Format a date as "Mar 27, 2026".
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date as relative time: "5 minutes ago", "2 hours ago", "3 days ago".
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  if (diffYears === 1) return '1 year ago';
  return `${diffYears} years ago`;
}

/**
 * Format a number with abbreviated suffix: 1200 -> "1.2K", 3400000 -> "3.4M".
 */
export function formatNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) {
    const val = n / 1000;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}K`;
  }
  if (n < 1_000_000_000) {
    const val = n / 1_000_000;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  const val = n / 1_000_000_000;
  return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}B`;
}

/**
 * Format cents as a currency string: 1299 -> "$12.99".
 */
export function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}
