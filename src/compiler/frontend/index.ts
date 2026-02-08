/**
 * Compiler Frontend
 *
 * Produces TypedPatch + CycleSummary for UI consumption.
 * Frontend is independent of Backend - can run and produce useful output
 * even when Backend would fail (unresolved types, illegal cycles, etc.)
 *
 * Pipeline (fixpoint engine):
 * 1. Composite expansion
 * 2. Build DraftGraph
 * 3. Fixpoint normalization (default sources, adapters, indexing, type solving, cardinality)
 * 4. Bridge → NormalizedPatch + TypeResolvedPatch
 * 5. Type graph (TypedPatch)
 * 6. Axis validation
 * 7. Cycle classification
 *
 * // [LAW:dataflow-not-control-flow] All steps execute unconditionally; errors are data.
 *
 * Output: FrontendResult with TypedPatch, CycleSummary, diagnostics, backendReady flag
 */

import type { Patch } from '../../graph';
import type { NormalizedPatch } from '../../graph/normalize';
import type { TypedPatch, TypeResolvedPatch } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';
// Frontend passes
import { pass2TypeGraphSafe, type Pass2Error } from './analyze-type-graph';
import { analyzeCycles, type CycleSummary } from './analyze-cycles';
import { validateTypes, validateNoVarAxes, type AxisViolation } from './axis-validate';

// Composite expansion
import { expandComposites, type ExpansionDiagnostic, type ExpansionProvenance } from './composite-expansion';

import { buildDraftGraph } from './draft-graph';
import { finalizeNormalizationFixpoint } from './final-normalization';
import { bridgeToNormalizedPatch, bridgePartialToNormalizedPatch } from './draft-graph-bridge';
import { BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';

// Re-export types for consumers
export type { TypeResolvedPatch, PortKey } from '../ir/patches';
export type { TypedPatch } from '../ir/patches';
export type { CycleSummary, ClassifiedSCC, CycleFix, SCCClassification, CycleLegality } from './analyze-cycles';
export type { AxisViolation } from './axis-validate';
export type { BindingMismatchError, BindingMismatchRemedy } from './axis-validate';
export { analyzeCycles } from './analyze-cycles';
export { pass2TypeGraph } from './analyze-type-graph';
export { validateTypes, validateNoVarAxes } from './axis-validate';

// =============================================================================
// Frontend Result Types
// =============================================================================

/**
 * Error from Frontend compilation.
 */
export interface FrontendError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
  readonly portId?: string;
}

/**
 * Result of Frontend compilation.
 * Contains everything UI needs, regardless of whether Backend will succeed.
 *
 * // [LAW:dataflow-not-control-flow] Always produced — backendReady is data, not control flow.
 */
export interface FrontendResult {
  /** The typed patch with resolved port types */
  readonly typedPatch: TypedPatch;
  /** Summary of cycles for UI display */
  readonly cycleSummary: CycleSummary;
  /** Any errors/warnings from Frontend passes */
  readonly errors: readonly FrontendError[];
  /** True if Backend can proceed with this result */
  readonly backendReady: boolean;
  /** The normalized patch (intermediate, for Backend) */
  readonly normalizedPatch: NormalizedPatch;
  /** Provenance from composite expansion (block/edge/boundary maps) */
  readonly expansionProvenance?: ExpansionProvenance;
}

// =============================================================================
// Main Frontend Entry Point
// =============================================================================

/**
 * Run the Frontend compiler pipeline.
 *
 * Produces TypedPatch + CycleSummary for UI, even if Backend would fail.
 * The `backendReady` flag indicates whether Backend can proceed.
 *
 * // [LAW:dataflow-not-control-flow] All passes execute unconditionally.
 * Every pass always runs; variability lives in the data (errors, partial types),
 * not in whether operations execute.
 *
 * @param patch - The patch to compile
 * @returns FrontendResult with typed graph and cycle info
 */
export interface FrontendOptions {
  readonly traceCardinalitySolver?: boolean;
}

export function compileFrontend(patch: Patch, options?: FrontendOptions): FrontendResult {
  const errors: FrontendError[] = [];

  // Step 1: Composite expansion (always)
  const expansion = expandComposites(patch);
  errors.push(
    ...expansion.diagnostics
      .filter(d => d.severity === 'error')
      .map(convertExpansionDiagnostic),
  );
  const expandedPatch = expansion.patch;

  // Step 2: Build DraftGraph from expanded patch (always)
  const draftGraph = buildDraftGraph(expandedPatch);

  // Step 3: Run fixpoint engine (always)
  const fixpointResult = finalizeNormalizationFixpoint(
    draftGraph,
    BLOCK_DEFS_BY_TYPE,
    { maxIterations: 20 },
  );

  // Collect fixpoint diagnostics as errors
  errors.push(...convertFixpointDiagnostics(fixpointResult.diagnostics));

  // If fixpoint didn't converge and no diagnostics explain why, add a generic message
  if (fixpointResult.strict === null && errors.length === 0) {
    errors.push({
      kind: 'FixpointFailed',
      message: 'Fixpoint normalization could not fully resolve the graph',
    });
  }

  // Step 4: Bridge (always — strict when available, partial otherwise)
  // [LAW:dataflow-not-control-flow] Both paths produce the same shape; variability is in the data.
  const { normalizedPatch, typeResolved } = fixpointResult.strict
    ? bridgeToNormalizedPatch(fixpointResult.strict, expandedPatch, BLOCK_DEFS_BY_TYPE)
    : bridgePartialToNormalizedPatch(fixpointResult.graph, fixpointResult.facts, expandedPatch, BLOCK_DEFS_BY_TYPE);

  // Step 5: Type graph (always — total, never throws)
  const { typedPatch, errors: tgErrors } = pass2TypeGraphSafe(typeResolved);
  errors.push(...tgErrors.map(convertPass2Error));

  // Step 6: Axis validation (always)
  const allTypes: CanonicalType[] = Array.from(typeResolved.portTypes.values());
  const axisViolations = validateTypes(allTypes);
  const varEscapeViolations = validateNoVarAxes(allTypes);
  errors.push(
    ...[...axisViolations, ...varEscapeViolations].map((v) => convertAxisViolation(v, typeResolved)),
  );

  // Step 7: Cycle classification (always)
  const cycleSummary = analyzeCycles(typedPatch);

  // Step 8: backendReady is data, not control flow
  const backendReady =
    errors.length === 0 &&
    fixpointResult.strict !== null &&
    !cycleSummary.hasIllegalCycles;

  return {
    typedPatch,
    cycleSummary,
    errors,
    backendReady,
    normalizedPatch,
    expansionProvenance: expansion.provenance,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function convertExpansionDiagnostic(d: ExpansionDiagnostic): FrontendError {
  return {
    kind: `CompositeExpansion/${d.code}`,
    message: d.message,
    blockId: d.at.instanceBlockId,
    portId: d.at.port,
  };
}

/**
 * Convert fixpoint diagnostics to FrontendErrors.
 */
function convertFixpointDiagnostics(diagnostics: readonly unknown[]): FrontendError[] {
  const result: FrontendError[] = [];
  for (const d of diagnostics) {
    if (typeof d === 'object' && d !== null && 'kind' in d) {
      const kind = (d as { kind: string }).kind;
      const message = 'message' in d ? String((d as { message: string }).message) : String(d);
      result.push({ kind: `Fixpoint/${kind}`, message });
    }
  }
  return result;
}

/**
 * Convert Pass2Error to FrontendError.
 */
function convertPass2Error(error: Pass2Error): FrontendError {
  return {
    kind: `TypeGraph/${error.kind}`,
    message: error.message,
  };
}

/**
 * Convert AxisViolation to FrontendError with block/port context.
 */
function convertAxisViolation(violation: AxisViolation, patch: TypeResolvedPatch): FrontendError {
  const portTypes = Array.from(patch.portTypes.entries());

  if (violation.nodeIndex < portTypes.length) {
    const [portKey, _type] = portTypes[violation.nodeIndex];
    const [blockIndexStr, portName, _direction] = portKey.split(':');
    const blockIndex = parseInt(blockIndexStr, 10);
    const block = patch.blocks[blockIndex];

    return {
      kind: 'AxisInvalid',
      message: violation.message,
      blockId: block?.id,
      portId: portName,
    };
  }

  return {
    kind: 'AxisInvalid',
    message: violation.message,
  };
}
