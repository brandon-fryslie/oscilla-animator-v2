/**
 * Graph Normalization Passes
 *
 * Orchestrates the normalization pipeline:
 * - Pass 1: Default source materialization
 * - Pass 2: Adapter insertion
 * - Pass 3: Varargs validation
 * - Pass 4: Block indexing
 *
 * NOTE: Type resolution (payload and unit) happens in the compiler (pass1-type-constraints.ts)
 * AFTER normalization completes, so all derived blocks exist when types are resolved.
 */

import type { Patch } from '../Patch';
import { pass1DefaultSources } from './pass1-default-sources';
import { pass2Adapters, type AdapterError } from './pass2-adapters';
import { pass4Varargs, type VarargError } from './pass4-varargs';
import { pass3Indexing, type IndexingError, type NormalizedPatch } from './pass3-indexing';

// =============================================================================
// Re-export Types
// =============================================================================

export type { NormalizedPatch, NormalizedEdge, BlockIndex } from './pass3-indexing';
export type { AdapterError } from './pass2-adapters';
export type { VarargError } from './pass4-varargs';

// Unified error type
export type NormError = AdapterError | IndexingError | VarargError;

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
 * - Default sources materialized
 * - Type adapters inserted
 * - Varargs validated
 * - Dense block indices
 * - Canonical edge ordering
 *
 * NOTE: Type resolution (payload and unit) happens in the compiler AFTER normalization,
 * so all derived blocks exist when types are resolved.
 *
 * @param patch - Raw patch to normalize
 * @returns NormalizedPatch or error list
 */
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 1: Default source materialization
  const p1 = pass1DefaultSources(patch);

  // Pass 2: Adapter insertion
  const p2Result = pass2Adapters(p1);
  if (p2Result.kind === 'error') {
    return { kind: 'error', errors: p2Result.errors };
  }

  // Pass 3: Varargs validation (before indexing)
  const p3Result = pass4Varargs(p2Result.patch);
  if (p3Result.kind === 'error') {
    return { kind: 'error', errors: p3Result.errors };
  }

  // Pass 4: Block indexing
  const p4Result = pass3Indexing(p3Result.patch);
  if (p4Result.kind === 'error') {
    return { kind: 'error', errors: p4Result.errors };
  }

  return { kind: 'ok', patch: p4Result.patch };
}

// =============================================================================
// Re-export Individual Passes (for testing)
// =============================================================================

export { pass1DefaultSources } from './pass1-default-sources';
export { pass2Adapters } from './pass2-adapters';
export { pass4Varargs } from './pass4-varargs';
export { pass3Indexing, getInputEdges, getOutputEdges } from './pass3-indexing';
