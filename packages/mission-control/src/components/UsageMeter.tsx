interface UsageMeterProps {
  /** Label for the meter */
  label: string;
  /** Current usage value */
  current: number;
  /** Maximum limit (-1 for unlimited) */
  limit: number;
  /** Unit suffix (e.g., "MB", "min") */
  unit?: string;
  /** Format style */
  format?: 'number' | 'decimal';
  /** Additional CSS classes */
  className?: string;
}

/**
 * UsageMeter - Progress bar visualization for usage metrics
 *
 * Features:
 * - Color-coded progress bar based on usage level
 * - Current/limit display
 * - Unlimited support (limit = -1)
 * - Animated transitions
 */
export function UsageMeter({
  label,
  current,
  limit,
  unit = '',
  format = 'decimal',
  className = '',
}: UsageMeterProps) {
  // Calculate percentage (handle unlimited)
  const isUnlimited = limit === -1 || limit === undefined;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);

  // Get color based on usage level
  const getBarColor = (): string => {
    if (isUnlimited) return 'bg-green-500';
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 75) return 'bg-yellow-500';
    if (percentage < 90) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Get text color for the percentage
  const getTextColor = (): string => {
    if (isUnlimited) return 'text-gray-600';
    if (percentage < 75) return 'text-gray-600';
    if (percentage < 90) return 'text-orange-600';
    return 'text-red-600';
  };

  // Format numbers
  const formatValue = (val: number): string => {
    if (format === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toString();
    }
    return val.toFixed(val % 1 === 0 ? 0 : 1);
  };

  // Format display text
  const formatDisplay = (): string => {
    const currentStr = formatValue(current);
    if (isUnlimited) {
      return `${currentStr}${unit} / Unlimited`;
    }
    const limitStr = formatValue(limit);
    return `${currentStr}${unit} / ${limitStr}${unit}`;
  };

  return (
    <div className={`${className}`}>
      {/* Label and values */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className={`text-xs font-medium ${getTextColor()}`}>
          {formatDisplay()}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor()} transition-all duration-300 ease-out`}
          style={{ width: isUnlimited ? '5%' : `${percentage}%` }}
        />
      </div>

      {/* Percentage indicator for high usage */}
      {!isUnlimited && percentage >= 75 && (
        <div className="mt-1 flex justify-end">
          <span className={`text-xs ${getTextColor()}`}>
            {percentage.toFixed(0)}% used
          </span>
        </div>
      )}
    </div>
  );
}

export default UsageMeter;
