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
import type { CompiledProgramIR, SlotMetaEntry, ValueSlot } from './ir/program';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import type { EventHub } from '../events/EventHub';
import { signalType } from '../core/canonical-types';

// Import block registrations (side-effect imports to register blocks)
import '../blocks/time-blocks';
import '../blocks/signal-blocks';
import '../blocks/primitive-blocks'; // NEW - Sprint 9: Three-stage architecture (Stage 1)
import '../blocks/array-blocks'; // NEW - Sprint 9: Three-stage architecture (Stage 2)
import '../blocks/instance-blocks'; // NEW - Sprint 3 (replaces domain-blocks)
import '../blocks/field-blocks';
import '../blocks/math-blocks';
import '../blocks/color-blocks';
import '../blocks/geometry-blocks';
import '../blocks/identity-blocks';
import '../blocks/render-blocks';
import '../blocks/field-operations-blocks';
import '../blocks/test-blocks'; // Test blocks for signal evaluation in tests

// Import passes
import { pass2TypeGraph } from './passes-v2';
import { pass3Time } from './passes-v2';
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
  readonly patchRevision?: number;
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
  const compileId = options?.patchId ? `${options.patchId}:${options.patchRevision || 0}` : 'unknown';
  const startTime = performance.now();

  // Emit CompileBegin event
  if (options) {
    options.events.emit({
      type: 'CompileBegin',
      compileId,
      patchId: options.patchId || 'unknown',
      patchRevision: options.patchRevision || 0,
      trigger: 'manual',
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
    const timeResolvedPatch = pass3Time(typedPatch);

    // Pass 4: Dependency Graph
    const depGraphPatch = pass4DepGraph(timeResolvedPatch);

    // Pass 5: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    // Pass 6: Block Lowering
    const unlinkedIR = pass6BlockLowering(acyclicPatch);

    // Check for errors from pass 6
    if (unlinkedIR.errors.length > 0) {
      const compileErrors: CompileError[] = unlinkedIR.errors.map((e) => ({
        kind: e.code,
        message: e.message,
        blockId: e.where?.blockId,
      }));
      return emitFailure(options, startTime, compileId, compileErrors);
    }

    // Pass 7: Schedule Construction
    const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch);

    // Pass 8: Link Resolution
    // TODO: Implement pass8LinkResolution
    // const linkedIR = pass8LinkResolution(unlinkedIR, acyclicPatch);

    // Convert to CompiledProgramIR
    // TODO: Implement convertLinkedIRToProgram
    // const compiledIR = convertLinkedIRToProgram(linkedIR, scheduleIR);
    const compiledIR = convertLinkedIRToProgram(unlinkedIR, scheduleIR);

    // Emit CompileEnd event (success)
    if (options) {
      const durationMs = performance.now() - startTime;
      const successDiagnostic = {
        id: `compile-success:rev${options.patchRevision || 0}`,
        code: 'I_COMPILE_SUCCESS' as const,
        severity: 'info' as const,
        domain: 'compile' as const,
        primaryTarget: { kind: 'graphSpan' as const, blockIds: [] },
        title: 'Compilation Successful',
        message: `Compiled in ${durationMs.toFixed(1)}ms`,
        scope: { patchRevision: options.patchRevision || 0, compileId },
        metadata: {
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          occurrenceCount: 1,
        },
      };
      options.events.emit({
        type: 'CompileEnd',
        compileId,
        patchId: options.patchId || 'unknown',
        patchRevision: options.patchRevision || 0,
        status: 'success',
        durationMs,
        diagnostics: [successDiagnostic],
      });
    }

    return {
      kind: 'ok',
      program: compiledIR,
    };
  } catch (e) {
    // Catch errors from any pass
    const error = e as any;

    // Extract error code if available (from structured errors like Pass3Error)
    const errorKind = error.code || 'CompilationFailed';
    const errorMessage = error.message || 'Unknown compilation error';

    const compileErrors: CompileError[] = [{
      kind: errorKind,
      message: errorMessage,
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
    const diagnostics = convertCompileErrorsToDiagnostics(errors, options.patchRevision || 0, compileId);
    options.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: options.patchId || 'unknown',
      patchRevision: options.patchRevision || 0,
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
function createStubProgramIR(scheduleIR: any, unlinkedIR: any): CompiledProgramIR {
  // Extract actual signal nodes from the builder if available
  const builder = unlinkedIR?.builder;
  const signalNodes = builder?.getSigExprs?.() || [];
  const fieldNodes = builder?.getFieldExprs?.() || [];

  return {
    irVersion: 1,
    signalExprs: { nodes: signalNodes },
    fieldExprs: { nodes: fieldNodes },
    eventExprs: { nodes: [] },
    constants: { json: [] },
    schedule: scheduleIR as any,
    outputs: [],
    slotMeta: [],
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
    },
  };
}

/**
 * Convert LinkedIR and ScheduleIR to CompiledProgramIR.
 *
 * @param unlinkedIR - Unlinked IR fragments from Pass 6
 * @param scheduleIR - Execution schedule from Pass 7
 * @returns CompiledProgramIR
 */
function convertLinkedIRToProgram(
  unlinkedIR: any,
  scheduleIR: any
): CompiledProgramIR {
  // Extract data from the IR builder
  const builder = unlinkedIR.builder;
  const signalNodes = builder.getSigExprs();
  const fieldNodes = builder.getFieldExprs();
  const eventNodes = builder.getEventExprs();

  // Build slot metadata from slot types
  const slotTypes = builder.getSlotTypes();
  const slotMeta: SlotMetaEntry[] = [];

  // Track offsets per storage class
  const storageOffsets = {
    f64: 0,
    f32: 0,
    i32: 0,
    u32: 0,
    object: 0,
  };

  // Build slotMeta entries for all allocated slots
  // Slots are indexed from 0, so iterate through all slot IDs
  for (let slotId = 0; slotId < builder.getSlotCount?.() || 0; slotId++) {
    const slot = slotId as ValueSlot;
    const type = slotTypes.get(slot) || signalType('float'); // Default to float if no type info

    // Determine storage class from type
    // For now, simple mapping: all numbers go to f64
    const storage: SlotMetaEntry['storage'] = 'f64';

    const offset = storageOffsets[storage]++;

    slotMeta.push({
      slot,
      storage,
      offset,
      type,
    });
  }

  // Build output specs (TBD - for now return empty array)
  const outputs: any[] = [];

  // Build debug index
  const debugIndex = {
    stepToBlock: new Map(),
    slotToBlock: new Map(),
    ports: [],
    slotToPort: new Map(),
  };

  return {
    irVersion: 1,
    signalExprs: { nodes: signalNodes },
    fieldExprs: { nodes: fieldNodes },
    eventExprs: { nodes: eventNodes },
    constants: { json: [] },
    schedule: scheduleIR,
    outputs,
    slotMeta,
    debugIndex,
  };
}
