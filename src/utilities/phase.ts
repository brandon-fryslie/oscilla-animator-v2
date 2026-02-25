/**
 * Phase math helpers.
 */

/**
 * Wrap a scalar to the canonical phase interval [0, 1).
 */
export function wrapToPhase01(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}
