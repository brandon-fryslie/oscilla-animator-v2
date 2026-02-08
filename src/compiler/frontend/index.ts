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
 * Output: FrontendResult with TypedPatch, CycleSummary, diagnostics, backendReady flag
 */

import type { Patch } from '../../graph';
import type { NormalizedPatch } from '../../graph/normalize';
import type { TypedPatch, TypeResolvedPatch } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';
// Frontend passes
import { pass2TypeGraph } from './analyze-type-graph';
import { analyzeCycles, type CycleSummary } from './analyze-cycles';
import { validateTypes, validateNoVarAxes, type AxisViolation } from './axis-validate';

// Composite expansion
import { expandComposites, type ExpansionDiagnostic, type ExpansionProvenance } from './composite-expansion';

import { buildDraftGraph } from './draft-graph';
import { finalizeNormalizationFixpoint } from './final-normalization';
import { bridgeToNormalizedPatch } from './draft-graph-bridge';
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

/**
 * Frontend failure (normalization or type resolution failed completely).
 */
export interface FrontendFailure {
  readonly kind: 'error';
  readonly errors: readonly FrontendError[];
  /** Partial results if available */
  readonly normalizedPatch?: NormalizedPatch;
  readonly typedPatch?: TypedPatch;
}

export type FrontendCompileResult =
  | { kind: 'ok'; result: FrontendResult }
  | FrontendFailure;

// =============================================================================
// Main Frontend Entry Point
// =============================================================================

/**
 * Run the Frontend compiler pipeline.
 *
 * Produces TypedPatch + CycleSummary for UI, even if Backend would fail.
 * The `backendReady` flag indicates whether Backend can proceed.
 *
 * @param patch - The patch to compile
 * @returns FrontendCompileResult with typed graph and cycle info
 */
export interface FrontendOptions {
  readonly traceCardinalitySolver?: boolean;
}

export function compileFrontend(patch: Patch, options?: FrontendOptions): FrontendCompileResult {
  // Step 1: Composite expansion
  const expansion = expandComposites(patch);
  const hasExpansionErrors = expansion.diagnostics.some(d => d.severity === 'error');
  if (hasExpansionErrors) {
    return { kind: 'error', errors: expansion.diagnostics.map(convertExpansionDiagnostic) };
  }
  const expandedPatch = expansion.patch;

  // Step 2: Build DraftGraph from expanded patch
  const draftGraph = buildDraftGraph(expandedPatch);

  // Step 3: Run fixpoint engine
  const fixpointResult = finalizeNormalizationFixpoint(
    draftGraph,
    BLOCK_DEFS_BY_TYPE,
    { maxIterations: 20 },
  );

  // Step 4: If strict resolution failed, return failure with diagnostics
  if (fixpointResult.strict === null) {
    const errors: FrontendError[] = fixpointResult.diagnostics.map((d) => ({
      kind: 'FixpointDiagnostic',
      message: typeof d === 'object' && d !== null && 'message' in d
        ? String((d as { message: string }).message)
        : String(d),
    }));

    // If no diagnostics were collected, provide a generic message
    if (errors.length === 0) {
      errors.push({
        kind: 'FixpointFailed',
        message: 'Fixpoint normalization could not fully resolve the graph',
      });
    }

    return { kind: 'error', errors };
  }

  // Step 5: Bridge StrictTypedGraph → NormalizedPatch + TypeResolvedPatch
  const { normalizedPatch, typeResolved } = bridgeToNormalizedPatch(
    fixpointResult.strict,
    expandedPatch,
    BLOCK_DEFS_BY_TYPE,
  );

  // Step 6: Shared tail (type graph → axis validation → cycle analysis)
  const errors: FrontendError[] = [];

  // Collect fixpoint diagnostics as non-fatal warnings
  for (const d of fixpointResult.diagnostics) {
    if (typeof d === 'object' && d !== null && 'kind' in d && (d as { kind: string }).kind === 'TypeConstraintError') {
      errors.push({
        kind: 'FixpointTypeError',
        message: typeof d === 'object' && 'message' in d ? String((d as { message: string }).message) : String(d),
      });
    }
  }

  return compileFrontendTail(typeResolved, normalizedPatch, errors, expansion.provenance);
}

// =============================================================================
// Shared Tail (pass2TypeGraph → axis validation → cycle analysis)
// =============================================================================

/**
 * Run type graph, axis validation, and cycle analysis.
 */
function compileFrontendTail(
  typeResolved: TypeResolvedPatch,
  normalizedPatch: NormalizedPatch,
  errors: FrontendError[],
  expansionProvenance?: ExpansionProvenance,
): FrontendCompileResult {
  // Type Graph (produces TypedPatch)
  let typedPatch;
  try {
    typedPatch = pass2TypeGraph(typeResolved);
  } catch (e) {
    // pass2TypeGraph throws on type mismatches — convert to structured error
    errors.push({
      kind: 'TypeGraphError',
      message: e instanceof Error ? e.message : String(e),
    });
    return { kind: 'error', errors };
  }

  // Axis Validation (Item #15)
  const allTypes: CanonicalType[] = Array.from(typeResolved.portTypes.values());
  const axisViolations = validateTypes(allTypes);
  const varEscapeViolations = validateNoVarAxes(allTypes);
  const allViolations = [...axisViolations, ...varEscapeViolations];

  if (allViolations.length > 0) {
    errors.push(...allViolations.map((v) => convertAxisViolation(v, typeResolved)));
  }

  // Cycle Classification (for UI)
  const cycleSummary = analyzeCycles(typedPatch);

  // Determine if Backend can proceed
  const backendReady = errors.length === 0 && !cycleSummary.hasIllegalCycles;

  return {
    kind: 'ok',
    result: { typedPatch, cycleSummary, errors, backendReady, normalizedPatch, expansionProvenance },
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
