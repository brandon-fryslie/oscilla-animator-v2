/**
 * Graph Normalization Passes
 *
 * Orchestrates the normalization pipeline:
 * - Pass 0: Polymorphic type resolution
 * - Pass 1: Default source materialization
 * - Pass 2: Adapter insertion
 * - Pass 3: Block indexing
 */

import type { Patch } from '../Patch';
import { pass0PolymorphicTypes } from './pass0-polymorphic-types';
import { pass1DefaultSources } from './pass1-default-sources';
import { pass2Adapters, type AdapterError } from './pass2-adapters';
import { pass3Indexing, type IndexingError, type NormalizedPatch } from './pass3-indexing';

// =============================================================================
// Re-export Types
// =============================================================================

export type { NormalizedPatch, NormalizedEdge, BlockIndex } from './pass3-indexing';
export type { AdapterError } from './pass2-adapters';

// Unified error type
export type NormError = AdapterError | IndexingError;

export interface NormalizeResult {
  readonly kind: 'ok';
  readonly patch: NormalizedPatch;
}

export interface NormalizeError {
  readonly kind: 'error';
  readonly errors: readonly NormError[];
}

// =============================================================================
// Orchestration
// =============================================================================

/**
 * Run all normalization passes.
 *
 * Transforms a raw patch into a fully normalized patch with:
 * - Polymorphic types resolved
 * - Default sources materialized
 * - Type adapters inserted
 * - Dense block indices
 * - Canonical edge ordering
 *
 * @param patch - Raw patch to normalize
 * @returns NormalizedPatch or error list
 */
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 0: Polymorphic type resolution
  const p0 = pass0PolymorphicTypes(patch);

  // Pass 1: Default source materialization
  const p1 = pass1DefaultSources(p0);

  // Pass 2: Adapter insertion
  const p2Result = pass2Adapters(p1);
  if (p2Result.kind === 'error') {
    return { kind: 'error', errors: p2Result.errors };
  }

  // Pass 3: Block indexing
  const p3Result = pass3Indexing(p2Result.patch);
  if (p3Result.kind === 'error') {
    return { kind: 'error', errors: p3Result.errors };
  }

  return { kind: 'ok', patch: p3Result.patch };
}

// =============================================================================
// Re-export Individual Passes (for testing)
// =============================================================================

export { pass0PolymorphicTypes } from './pass0-polymorphic-types';
export { pass1DefaultSources } from './pass1-default-sources';
export { pass2Adapters } from './pass2-adapters';
export { pass3Indexing, getInputEdges, getOutputEdges } from './pass3-indexing';
