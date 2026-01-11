/**
 * Compiler Entry Point
 *
 * Main compilation pipeline:
 * 1. Normalization - Convert Patch to NormalizedPatch
 * 2. Pass 2: Type Graph - Resolve types for all connections
 * 3. Pass 3: Time Topology - Determine time model
 * 4. Pass 4: Dependency Graph - Build execution dependencies
 * 5. Pass 5: Cycle Validation (SCC) - Check for illegal cycles
 * 6. Pass 6: Block Lowering - Lower blocks to IR expressions
 * 7. Pass 7: Schedule Construction - Build execution schedule
 * 8. Pass 8: Link Resolution - Resolve all connections
 *
 * Integrated with event emission for diagnostics.
 */

import type { Patch } from '../graph';
import { normalize, type NormalizedPatch } from '../graph/normalize';
import type { CompiledProgramIR } from './ir/program';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import type { EventHub } from '../events/EventHub';

// Import passes
import { pass2TypeGraph } from './passes-v2';
import { pass3TimeTopology } from './passes-v2';
import { pass4DepGraph } from './passes-v2';
import { pass5CycleValidation } from './passes-v2';
import { pass6BlockLowering } from './passes-v2';
import { pass7Schedule } from './passes-v2';
// Pass 8 is not yet fully implemented
// import { pass8LinkResolution } from './passes-v2';

// =============================================================================
// Compile Errors & Results
// =============================================================================

export interface CompileError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
  readonly connectionId?: string;
  readonly portId?: string;
}

export type CompileSuccess = {
  readonly kind: 'ok';
  readonly program: CompiledProgramIR;
};

export type CompileFailure = {
  readonly kind: 'error';
  readonly errors: readonly CompileError[];
};

export type CompileResult = CompileSuccess | CompileFailure;

// =============================================================================
// Compile Options
// =============================================================================

export interface CompileOptions {
  readonly patchId?: string;
  readonly patchRevision?: string;
  readonly events: EventHub;
}

// =============================================================================
// Main Compile Function
// =============================================================================

/**
 * Compile a Patch into a CompiledProgramIR.
 *
 * @param patch - The patch to compile
 * @param options - Optional compile options for event emission
 * @returns CompileResult with either the compiled program or errors
 */
export function compile(patch: Patch, options?: CompileOptions): CompileResult {
  const compileId = options?.patchId ? `${options.patchId}:${options.patchRevision || 'latest'}` : 'unknown';
  const startTime = performance.now();

  // Emit CompileStart event
  if (options) {
    options.events.emit({
      type: 'CompileStart',
      compileId,
      patchId: options.patchId || 'unknown',
      patchRevision: options.patchRevision || 'latest',
    });
  }

  try {
    // Pass 1: Normalization
    const normResult = normalize(patch);

    if (normResult.kind === 'error') {
      const compileErrors: CompileError[] = normResult.errors.map((e) => ({
        kind: e.kind,
        message: e.kind === 'DanglingEdge'
          ? `Edge references missing block (${e.missing})`
          : `Duplicate block ID: ${(e as any).id}`,
      }));

      return emitFailure(options, startTime, compileId, compileErrors);
    }

    const normalized = normResult.patch;

    // Pass 2: Type Graph
    const typedPatch = pass2TypeGraph(normalized);

    // Pass 3: Time Topology
    const timeResolvedPatch = pass3TimeTopology(typedPatch);

    // Pass 4: Dependency Graph
    const depGraphPatch = pass4DepGraph(timeResolvedPatch);

    // Pass 5: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    // Pass 6: Block Lowering
    const unlinkedIR = pass6BlockLowering(acyclicPatch);

    // Pass 7: Schedule Construction
    const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch);

    // Pass 8: Link Resolution
    // TODO: Implement pass8LinkResolution
    // const linkedIR = pass8LinkResolution(unlinkedIR, acyclicPatch);

    // Convert to CompiledProgramIR
    // TODO: Implement convertLinkedIRToProgram
    // const compiledIR = convertLinkedIRToProgram(linkedIR, scheduleIR);
    const compiledIR = createStubProgramIR(scheduleIR);

    // Emit CompileEnd event (success)
    if (options) {
      const durationMs = performance.now() - startTime;
      options.events.emit({
        type: 'CompileEnd',
        compileId,
        patchId: options.patchId || 'unknown',
        patchRevision: options.patchRevision || 'latest',
        status: 'success',
        durationMs,
        diagnostics: [],
      });
    }

    return {
      kind: 'ok',
      program: compiledIR,
    };
  } catch (e) {
    // Catch errors from any pass
    const error = e as Error;
    const compileErrors: CompileError[] = [{
      kind: 'CompilationFailed',
      message: error.message || 'Unknown compilation error',
    }];

    return emitFailure(options, startTime, compileId, compileErrors);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function emitFailure(
  options: CompileOptions | undefined,
  startTime: number,
  compileId: string,
  errors: CompileError[]
): CompileFailure {
  if (options) {
    const durationMs = performance.now() - startTime;
    const diagnostics = convertCompileErrorsToDiagnostics(errors);
    options.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: options.patchId || 'unknown',
      patchRevision: options.patchRevision || 'latest',
      status: 'failure',
      durationMs,
      diagnostics,
    });
  }

  return {
    kind: 'error',
    errors,
  };
}

/**
 * Create a stub CompiledProgramIR for testing.
 * TODO: Replace with real convertLinkedIRToProgram implementation.
 */
function createStubProgramIR(scheduleIR: any): CompiledProgramIR {
  return {
    irVersion: 1,
    signalExprs: { nodes: [] },
    fieldExprs: { nodes: [] },
    eventExprs: { nodes: [] },
    constants: { json: [] },
    schedule: scheduleIR as any,
    outputs: [],
    slotMeta: new Map(),
    debugIndex: {
      blockIndex: new Map(),
      sigExprToBlock: new Map(),
    },
  };
}
