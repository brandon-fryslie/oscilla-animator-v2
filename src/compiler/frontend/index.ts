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
import { compilationInspector } from '../../services/CompilationInspectorService';

// Frontend passes
import { pass1TypeConstraints, type TypeResolvedPatch, type Pass1Error, type TypeConstraintError } from './analyze-type-constraints';
import { pass2TypeGraph } from './analyze-type-graph';
import { analyzeCycles, type CycleSummary } from './analyze-cycles';
import { validateTypes, validateNoVarAxes, type AxisViolation } from './axis-validate';

// Re-export types for consumers
export type { TypeResolvedPatch, Pass1Error, TypeConstraintError } from './analyze-type-constraints';
export type { TypedPatch } from '../ir/patches';
export type { CycleSummary, ClassifiedSCC, CycleFix, SCCClassification, CycleLegality } from './analyze-cycles';
export type { AxisViolation } from './axis-validate';
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
export function compileFrontend(patch: Patch): FrontendCompileResult {
  const errors: FrontendError[] = [];

  // =========================================================================
  // Step 1: Normalization (passes 0-4)
  // =========================================================================
  const normResult = normalize(patch);

  if (normResult.kind === 'error') {
    const frontendErrors = normResult.errors.map(convertNormError);
    return {
      kind: 'error',
      errors: frontendErrors,
    };
  }

  const normalizedPatch = normResult.patch;

  try {
    compilationInspector.capturePass('frontend:normalization', patch, normalizedPatch);
  } catch (e) {
    // Ignore inspector errors
  }

  // =========================================================================
  // Step 2: Type Constraints (union-find solver)
  // =========================================================================
  const pass1Result = pass1TypeConstraints(normalizedPatch);

  if ('kind' in pass1Result && pass1Result.kind === 'error') {
    // Type resolution failed - but we might still have partial types
    const typeErrors = pass1Result.errors.map((e: TypeConstraintError) => ({
      kind: e.kind,
      message: `${e.message}\nSuggestions:\n${e.suggestions.map((s: string) => `  - ${s}`).join('\n')}`,
      blockId: normalizedPatch.blocks[e.blockIndex]?.id,
      portId: e.portName,
    }));
    errors.push(...typeErrors);

    // Return failure - can't produce TypedPatch without resolved types
    return {
      kind: 'error',
      errors,
      normalizedPatch,
    };
  }

  const typeResolved = pass1Result as TypeResolvedPatch;

  try {
    compilationInspector.capturePass('frontend:type-constraints', normalizedPatch, typeResolved);
  } catch (e) {
    // Ignore inspector errors
  }

  // =========================================================================
  // Step 3: Type Graph (produces TypedPatch)
  // =========================================================================
  const typedPatch = pass2TypeGraph(typeResolved);

  try {
    compilationInspector.capturePass('frontend:type-graph', typeResolved, typedPatch);
  } catch (e) {
    // Ignore inspector errors
  }

  // =========================================================================
  // Step 3.5: Axis Validation (Item #15)
  // =========================================================================
  // Collect all resolved CanonicalTypes from TypedPatch
  const allTypes: CanonicalType[] = Array.from(typeResolved.portTypes.values());

  // Run axis validation
  const axisViolations = validateTypes(allTypes);
  const varEscapeViolations = validateNoVarAxes(allTypes);
  const allViolations = [...axisViolations, ...varEscapeViolations];

  if (allViolations.length > 0) {
    // Map violations to FrontendErrors with context
    const axisErrors = allViolations.map((v) => convertAxisViolation(v, typeResolved));
    errors.push(...axisErrors);
  }

  try {
    compilationInspector.capturePass('frontend:axis-validation', typedPatch, {
      violations: allViolations,
      typeCount: allTypes.length,
    });
  } catch (e) {
    // Ignore inspector errors
  }

  // =========================================================================
  // Step 4: Cycle Classification (for UI)
  // =========================================================================
  const cycleSummary = analyzeCycles(typedPatch);

  try {
    compilationInspector.capturePass('frontend:cycle-analysis', typedPatch, cycleSummary);
  } catch (e) {
    // Ignore inspector errors
  }

  // =========================================================================
  // Determine if Backend can proceed
  // =========================================================================
  const backendReady = errors.length === 0 && !cycleSummary.hasIllegalCycles;

  return {
    kind: 'ok',
    result: {
      typedPatch,
      cycleSummary,
      errors,
      backendReady,
      normalizedPatch,
    },
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
