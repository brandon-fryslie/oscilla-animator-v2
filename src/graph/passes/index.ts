/**
 * Graph Normalization Passes
 *
 * Orchestrates the normalization pipeline:
 * - Pass 0: Composite expansion (expands composite blocks into derived blocks)
 * - Pass 1: Default source materialization
 * - Pass 2: Adapter insertion
 * - Pass 3: Varargs validation
 * - Pass 4: Block indexing
 *
 * NOTE: These passes have moved to src/compiler/frontend/ as part of the
 * Frontend/Backend split. This file re-exports for backward compatibility.
 *
 * New code should import from src/compiler/frontend/
 */

import type { Patch } from '../Patch';
import { pass0CompositeExpansion, type ExpansionError } from '../../compiler/frontend/normalize-composites';
import { pass1DefaultSources } from '../../compiler/frontend/normalize-default-sources';
import { pass2Adapters, type AdapterError } from '../../compiler/frontend/normalize-adapters';
import { pass4Varargs, type VarargError } from '../../compiler/frontend/normalize-varargs';
import { pass3Indexing, type IndexingError, type NormalizedPatch } from '../../compiler/frontend/normalize-indexing';

// =============================================================================
// Re-export Types
// =============================================================================

export type { NormalizedPatch, NormalizedEdge, BlockIndex } from '../../compiler/frontend/normalize-indexing';
export type { AdapterError } from '../../compiler/frontend/normalize-adapters';
export type { VarargError } from '../../compiler/frontend/normalize-varargs';
export type { ExpansionError, CompositeExpansionResult } from '../../compiler/frontend/normalize-composites';
export type { CompositeExpansionInfo } from '../../blocks/composite-types';

// Unified error type
export type NormError = AdapterError | IndexingError | VarargError | ExpansionError;

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
 * - Composite blocks expanded
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
  // Pass 0: Composite expansion (expands composite blocks first)
  const p0Result = pass0CompositeExpansion(patch);
  if (p0Result.kind === 'error') {
    return { kind: 'error', errors: p0Result.errors };
  }

  // Pass 1: Default source materialization
  const p1 = pass1DefaultSources(p0Result.patch);

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

export { pass0CompositeExpansion } from '../../compiler/frontend/normalize-composites';
export { pass1DefaultSources } from '../../compiler/frontend/normalize-default-sources';
export { pass2Adapters } from '../../compiler/frontend/normalize-adapters';
export { pass4Varargs } from '../../compiler/frontend/normalize-varargs';
export { pass3Indexing, getInputEdges, getOutputEdges } from '../../compiler/frontend/normalize-indexing';
