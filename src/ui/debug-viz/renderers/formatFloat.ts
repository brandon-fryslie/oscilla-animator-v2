/**
 * Float formatting for debug value display.
 *
 * Rules:
 * - 4 significant digits for values in [0.001, 9999]
 * - Compact scientific notation outside that range
 * - Exact 0 as "0.000"
 * - NaN/Inf as special strings (caller handles badge styling)
 */

/**
 * Format a float value for display.
 *
 * @returns Formatted string representation
 */
export function formatFloat(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? '+Inf' : '-Inf';
  if (value === 0) return '0.000';

  const abs = Math.abs(value);

  if (abs >= 0.001 && abs < 10000) {
    // 4 significant digits
    return value.toPrecision(4);
  }

  // Scientific notation for very small/large values
  return value.toExponential(2);
}

/**
 * Check if a float value is "invalid" (NaN or Inf).
 */
export function isInvalidFloat(value: number): boolean {
  return Number.isNaN(value) || !Number.isFinite(value);
}
