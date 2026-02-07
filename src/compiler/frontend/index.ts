/**
 * Compiler Frontend
 *
 * Produces TypedPatch + CycleSummary for UI consumption.
 * Frontend is independent of Backend - can run and produce useful output
 * even when Backend would fail (unresolved types, illegal cycles, etc.)
 *
 * Pipeline:
 * 1. Normalize.Composites     - Expand composite blocks
 * 2. Normalize.DefaultSources - Wire up default sources
 * 3. Normalize.Adapters       - Auto-insert type adapters
 * 4. Normalize.Indexing       - Dense block/port indexing
 * 5. Normalize.Varargs        - Validate vararg configurations
 * 6. Analyze.TypeConstraints  - Union-find solver for types
 * 7. Analyze.TypeGraph        - Produce TypedPatch
 * 7.5 Analyze.AxisValidation  - Validate axis invariants (Item #15)
 * 8. Analyze.CycleClassify    - Classify cycles for UI
 *
 * Output: FrontendResult with TypedPatch, CycleSummary, diagnostics, backendReady flag
 *
 * References:
 * - .agent_planning/compiler-design-frontend-backend/ALIGNMENT.md §7
 * - .agent_planning/compiler-design-frontend-backend/PROPOSAL.md §2
 */

import type { Patch } from '../../graph';
import { normalize, type NormalizedPatch, type NormError } from '../../graph/normalize';
import type { TypedPatch } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';
// Frontend passes
import { pass1TypeConstraints, type TypeResolvedPatch, type TypeConstraintError } from './analyze-type-constraints';
import { pass2TypeGraph } from './analyze-type-graph';
import { analyzeCycles, type CycleSummary } from './analyze-cycles';
import { validateTypes, validateNoVarAxes, type AxisViolation } from './axis-validate';

// V2 fixpoint imports
import { pass0CompositeExpansion } from './normalize-composites';
import { pass4Varargs } from './normalize-varargs';
import { buildDraftGraph } from './draft-graph';
import { finalizeNormalizationFixpoint } from './final-normalization';
import { bridgeToNormalizedPatch } from './draft-graph-bridge';
import { BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';

// Re-export types for consumers
export type { TypeResolvedPatch, TypeConstraintError } from './analyze-type-constraints';
export type { TypedPatch } from '../ir/patches';
export type { CycleSummary, ClassifiedSCC, CycleFix, SCCClassification, CycleLegality } from './analyze-cycles';
export type { AxisViolation } from './axis-validate';
export type { BindingMismatchError, BindingMismatchRemedy } from './axis-validate';
export { analyzeCycles } from './analyze-cycles';
export { pass1TypeConstraints, getPortType } from './analyze-type-constraints';
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
  readonly useFixpointFrontend?: boolean;
}

export function compileFrontend(patch: Patch, options?: FrontendOptions): FrontendCompileResult {
  // [LAW:dataflow-not-control-flow] Gate at entrypoint, not buried in passes.
  if (options?.useFixpointFrontend) {
    return compileFrontendV2(patch, options);
  }
  return compileFrontendV1(patch, options);
}

// =============================================================================
// V1 Frontend (existing linear pass chain)
// =============================================================================

function compileFrontendV1(patch: Patch, options?: FrontendOptions): FrontendCompileResult {
  // Step 1: Normalization (passes 0-4)
  const normResult = normalize(patch);

  if (normResult.kind === 'error') {
    return { kind: 'error', errors: normResult.errors.map(convertNormError) };
  }

  return compileFrontendV1Internal(normResult.patch, options);
}

/**
 * V1 internal pipeline (post-normalization).
 * Takes an already-normalized patch and runs type solving + analysis.
 * Extracted so the V2 fallback can reuse it without re-running normalization.
 */
function compileFrontendV1Internal(
  normalizedPatch: NormalizedPatch,
  options?: FrontendOptions,
): FrontendCompileResult {
  const errors: FrontendError[] = [];

  // Type Constraints (union-find solver)
  const pass1Result = pass1TypeConstraints(normalizedPatch, {
    traceCardinalitySolver: options?.traceCardinalitySolver,
  });

  if (pass1Result.errors.length > 0) {
    const typeErrors = pass1Result.errors.map((e: TypeConstraintError) => ({
      kind: e.kind,
      message: `${e.message}\nSuggestions:\n${e.suggestions.map((s: string) => `  - ${s}`).join('\n')}`,
      blockId: normalizedPatch.blocks[e.blockIndex]?.id,
      portId: e.portName,
    }));
    errors.push(...typeErrors);
    return { kind: 'error', errors, normalizedPatch };
  }

  return compileFrontendTail(pass1Result, normalizedPatch, errors);
}

// =============================================================================
// V2 Frontend (fixpoint normalization engine)
// =============================================================================

/**
 * V2 pipeline: fixpoint engine → bridge → shared tail.
 *
 * Falls back to V1 when the fixpoint can't fully resolve
 * (e.g., cardinality vars unresolved, since that solver isn't adapted yet).
 */
function compileFrontendV2(patch: Patch, options?: FrontendOptions): FrontendCompileResult {
  // Step 1: Composite expansion (same as V1)
  const p0Result = pass0CompositeExpansion(patch);
  if (p0Result.kind === 'error') {
    return { kind: 'error', errors: p0Result.errors.map(convertNormError) };
  }
  const expandedPatch = p0Result.patch;

  // Step 2: Build DraftGraph from expanded patch
  const draftGraph = buildDraftGraph(expandedPatch);

  // Step 3: Run fixpoint engine
  const fixpointResult = finalizeNormalizationFixpoint(
    draftGraph,
    BLOCK_DEFS_BY_TYPE,
    { maxIterations: 20 },
  );

  // Step 4: If strict resolution failed, fall back to V1
  // Use the already-expanded patch to avoid re-running composite expansion.
  if (fixpointResult.strict === null) {
    // Collect fixpoint diagnostics as warnings
    const v2Errors: FrontendError[] = fixpointResult.diagnostics.map((d) => ({
      kind: 'FixpointDiagnostic',
      message: typeof d === 'object' && d !== null && 'message' in d
        ? String((d as { message: string }).message)
        : String(d),
    }));

    // Run V1 normalization on the expanded patch (skips composite expansion)
    const normResult = normalize(expandedPatch);
    if (normResult.kind === 'error') {
      return { kind: 'error', errors: [...v2Errors, ...normResult.errors.map(convertNormError)] };
    }
    return compileFrontendV1Internal(normResult.patch, options);
  }

  // Step 5: Bridge StrictTypedGraph → NormalizedPatch + TypeResolvedPatch
  const { normalizedPatch, typeResolved } = bridgeToNormalizedPatch(
    fixpointResult.strict,
    expandedPatch,
    BLOCK_DEFS_BY_TYPE,
  );

  // Step 6: Varargs validation on synthetic patch (has all elaborated blocks)
  const varargResult = pass4Varargs(normalizedPatch.patch);
  if (varargResult.kind === 'error') {
    return { kind: 'error', errors: varargResult.errors.map((e) => convertNormError(e)) };
  }

  // Step 7: Shared tail (type graph → axis validation → cycle analysis)
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

  return compileFrontendTail(typeResolved, normalizedPatch, errors);
}

// =============================================================================
// Shared Tail (pass2TypeGraph → axis validation → cycle analysis)
// =============================================================================

/**
 * Shared compilation tail used by both V1 and V2.
 * Takes a TypeResolvedPatch and runs type graph, axis validation, and cycle analysis.
 */
function compileFrontendTail(
  typeResolved: TypeResolvedPatch,
  normalizedPatch: NormalizedPatch,
  errors: FrontendError[],
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
    result: { typedPatch, cycleSummary, errors, backendReady, normalizedPatch },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function convertNormError(e: NormError): FrontendError {
  switch (e.kind) {
    case 'DanglingEdge':
      return {
        kind: e.kind,
        message: `Edge references missing block (${e.missing})`,
        blockId: e.edge.from.blockId,
      };
    case 'DuplicateBlockId':
      return {
        kind: e.kind,
        message: `Duplicate block ID: ${e.id}`,
        blockId: e.id,
      };
    case 'UnknownPort':
      return {
        kind: 'UnknownBlockType',
        message: `Port '${e.portId}' does not exist on block '${e.blockId}' (${e.direction})`,
        blockId: e.blockId,
        portId: e.portId,
      };
    case 'NoAdapterFound':
      return {
        kind: 'TypeMismatch',
        message: `No adapter found for type conversion: ${e.fromType} → ${e.toType}`,
        blockId: e.edge.to.blockId,
        portId: e.edge.to.slotId,
      };
    case 'vararg':
      return {
        kind: 'VarargError',
        message: e.message,
        blockId: e.where.blockId,
        portId: e.where.portId,
      };
    case 'CompositeExpansion':
      return {
        kind: 'CompositeExpansion',
        message: e.message,
        blockId: e.compositeBlockId,
      };
    default: {
      const _exhaustive: never = e;
      return {
        kind: 'UnknownError',
        message: `Unknown normalization error: ${JSON.stringify(_exhaustive)}`,
      };
    }
  }
}

/**
 * Convert AxisViolation to FrontendError with block/port context.
 * Item #15: Map violations to errors with source context.
 */
function convertAxisViolation(violation: AxisViolation, patch: TypeResolvedPatch): FrontendError {
  // Find the port that corresponds to this type index
  // PortKey format: `${blockIndex}:${portName}:${'in' | 'out'}`
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

  // Fallback if we can't find the port
  return {
    kind: 'AxisInvalid',
    message: violation.message,
  };
}
