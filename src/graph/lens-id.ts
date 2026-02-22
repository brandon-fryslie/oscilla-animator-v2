/**
 * Lens attachment ID helpers.
 *
 * // [LAW:one-source-of-truth] Lens ID generation rules are centralized.
 */

import type { LensAttachment } from './Patch';
import { generateLensId } from '../core/canonical-name';

/**
 * Generate a unique lens attachment ID for a port.
 * Deterministic for first insertion and stable with suffixes for additional lenses.
 */
export function nextLensAttachmentId(
  existingLenses: readonly LensAttachment[],
  sourceAddress: string,
  lensType: string,
): string {
  const existingIds = new Set(existingLenses.map((lens) => lens.id));
  const seed = `${sourceAddress}:${lensType}`;

  let candidate = generateLensId(seed);
  if (!existingIds.has(candidate)) return candidate;

  let suffix = 1;
  // [LAW:dataflow-not-control-flow] Uniqueness is resolved by deterministic data progression.
  while (existingIds.has(candidate)) {
    candidate = generateLensId(`${seed}:${suffix}`);
    suffix += 1;
  }
  return candidate;
}

