/**
 * Shared utilities for WebGPU matrix gate scripts.
 */

export function truncateForLog(value, maxLength = 240) {
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
