/**
 * Compiler Backend
 *
 * Consumes TypedPatch from Frontend and produces CompiledProgramIR for execution.
 * Backend has NO knowledge of block origins (adapter, lens, user-created, etc.)
 *
 * Pipeline:
 * 1. Derive.DepGraph     - Build execution dependency graph
 * 2. Schedule.SCC        - SCC decomposition for execution ordering
 * 3. Lower.Blocks        - Convert blocks to IR fragments
 * 4. Schedule.Program    - Topological sort, produce execution order
 *
 * Output: CompiledProgramIR ready for runtime execution
 *
 * References:
 * - .agent_planning/compiler-design-frontend-backend/ALIGNMENT.md §7
 * - .agent_planning/compiler-design-frontend-backend/PROPOSAL.md §2
 */

import type { TypedPatch, AcyclicOrLegalGraph } from '../ir/patches';
import type { CompiledProgramIR } from '../ir/program';
import type { EventHub } from '../../events/EventHub';
import { compilationInspector } from '../../services/CompilationInspectorService';
import { buildAddressRegistryForCompilerGraph } from './address-registry-bridge';

// Backend passes
import { pass4DepGraph } from './derive-dep-graph';
import { pass5CycleValidation } from './schedule-scc';
import { pass6BlockLowering, type UnlinkedIRFragments, type Pass6Options } from './lower-blocks';
import { pass7Schedule, type ScheduleIR } from './schedule-program';
import { allocateContinuityPipeline } from './continuity-pipeline';

// Re-export for consumers
export { pass4DepGraph } from './derive-dep-graph';
export { pass5CycleValidation } from './schedule-scc';
export { pass6BlockLowering } from './lower-blocks';
export { pass7Schedule } from './schedule-program';
export type { UnlinkedIRFragments, Pass6Options } from './lower-blocks';
export type { ScheduleIR } from './schedule-program';
export type { DepGraphWithTimeModel, AcyclicOrLegalGraph } from '../ir/patches';

// =============================================================================
// Backend Options
// =============================================================================

export interface BackendOptions {
  readonly events?: EventHub;
  readonly compileId?: string;
  readonly patchRevision?: number;
}

// =============================================================================
// Backend Result Types
// =============================================================================

export interface BackendError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
}

export interface BackendResult {
  readonly program: CompiledProgramIR;
  readonly unlinkedIR: UnlinkedIRFragments;
  readonly scheduleIR: ScheduleIR;
  readonly acyclicPatch: AcyclicOrLegalGraph;
}

export type BackendCompileResult =
  | { kind: 'ok'; result: BackendResult }
  | { kind: 'error'; errors: readonly BackendError[] };

// =============================================================================
// Main Backend Entry Point
// =============================================================================

/**
 * Run the Backend compiler pipeline.
 *
 * PRECONDITION: Frontend must have completed successfully with backendReady=true.
 * Backend will throw if given incomplete/invalid TypedPatch.
 *
 * @param typedPatch - The typed patch from Frontend
 * @param convertToProgram - Function to convert IR to final program format
 * @param options - Backend compilation options
 * @returns BackendCompileResult with CompiledProgramIR
 */
export function compileBackend(
  typedPatch: TypedPatch,
  convertToProgram: (
    unlinkedIR: UnlinkedIRFragments,
    scheduleIR: ScheduleIR,
    acyclicPatch: AcyclicOrLegalGraph
  ) => CompiledProgramIR,
  options?: BackendOptions
): BackendCompileResult {
  try {
    // =========================================================================
    // Step 1: Dependency Graph
    // =========================================================================
    const depGraphPatch = pass4DepGraph(typedPatch);

    try {
      compilationInspector.capturePass('backend:depgraph', typedPatch, depGraphPatch);
    } catch (e) {
      // Ignore inspector errors
    }

    // =========================================================================
    // Step 2: SCC Scheduling (execution order validation)
    // =========================================================================
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    try {
      compilationInspector.capturePass('backend:scc', depGraphPatch, acyclicPatch);
    } catch (e) {
      // Ignore inspector errors
    }

    // =========================================================================
    const addressRegistry = buildAddressRegistryForCompilerGraph(typedPatch.graph);
    // Step 3: Block Lowering
    // =========================================================================
    const pass6Options: Pass6Options = {
      events: options?.events,
      compileId: options?.compileId,
      addressRegistry,
      patchRevision: options?.patchRevision,
    };
    const unlinkedIR = pass6BlockLowering(acyclicPatch, pass6Options);

    try {
      compilationInspector.capturePass('backend:block-lowering', acyclicPatch, unlinkedIR);
    } catch (e) {
      // Ignore inspector errors
    }

    // Check for lowering errors
    if (unlinkedIR.errors.length > 0) {
      const backendErrors: BackendError[] = unlinkedIR.errors.map((e) => ({
        kind: e.code,
        message: e.message,
        blockId: e.where?.blockId,
      }));
      return {
        kind: 'error',
        errors: backendErrors,
      };
    }

    // =========================================================================
    // Step 4a: Continuity Pipeline Allocation
    // =========================================================================
    const continuityPipeline = allocateContinuityPipeline(unlinkedIR, acyclicPatch);

    // =========================================================================
    // Step 4b: Schedule Construction (pure ordering, no allocation)
    // =========================================================================
    const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch, continuityPipeline);

    try {
      compilationInspector.capturePass('backend:schedule', unlinkedIR, scheduleIR);
    } catch (e) {
      // Ignore inspector errors
    }

    // =========================================================================
    // Step 5: Convert to CompiledProgramIR
    // =========================================================================
    const program = convertToProgram(unlinkedIR, scheduleIR, acyclicPatch);

    return {
      kind: 'ok',
      result: {
        program,
        unlinkedIR,
        scheduleIR,
        acyclicPatch,
      },
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return {
      kind: 'error',
      errors: [{
        kind: 'BackendCompilationFailed',
        message: error.message,
      }],
    };
  }
}
