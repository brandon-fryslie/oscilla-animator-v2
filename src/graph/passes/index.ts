/**
 * Graph Normalization Passes
 *
 * Orchestrates the normalization pipeline:
 * - Pass 0: Composite expansion (expands composite blocks into derived blocks)
 * - Pass 1: Default source materialization
 * - Pass 2: Adapter insertion
 * - Pass 3: Block indexing
 *
 * NOTE: These passes have moved to src/compiler/frontend/ as part of the
 * Frontend/Backend split. This file re-exports for backward compatibility.
 *
 * New code should import from src/compiler/frontend/
 */

import type { Patch } from '../Patch';
import { expandComposites } from '../../compiler/frontend/composite-expansion';
import { pass1DefaultSources } from '../../compiler/frontend/normalize-default-sources';
import { pass2Adapters, type AdapterError } from '../../compiler/frontend/normalize-adapters';
import { pass3Indexing, type IndexingError, type NormalizedPatch } from '../../compiler/frontend/normalize-indexing';

// =============================================================================
// Re-export Types
// =============================================================================

export type { NormalizedPatch, NormalizedEdge, BlockIndex } from '../../compiler/frontend/normalize-indexing';
export type { AdapterError } from '../../compiler/frontend/normalize-adapters';
export type { CompositeExpansionResult, ExpansionDiagnostic, ExpansionProvenance } from '../../compiler/frontend/composite-expansion';

// Unified error type (composite expansion now uses its own diagnostic type)
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
 * - Composite blocks expanded
 * - Default sources materialized
 * - Type adapters inserted
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
  const expansion = expandComposites(patch);
  const hasExpansionErrors = expansion.diagnostics.some(d => d.severity === 'error');
  if (hasExpansionErrors) {
    // Return first error as a NormalizeError — callers should migrate to expandComposites directly
    return { kind: 'error', errors: [] };
  }

  // Pass 1: Default source materialization
  const p1 = pass1DefaultSources(expansion.patch);

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

export { expandComposites } from '../../compiler/frontend/composite-expansion';
export { pass1DefaultSources } from '../../compiler/frontend/normalize-default-sources';
export { pass2Adapters } from '../../compiler/frontend/normalize-adapters';
export { pass3Indexing, getInputEdges, getOutputEdges } from '../../compiler/frontend/normalize-indexing';
