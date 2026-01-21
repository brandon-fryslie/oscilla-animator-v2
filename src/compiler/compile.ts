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
 *
 * Integrated with event emission for diagnostics.
 */

import type { Patch } from '../graph';
import { normalize, type NormalizedPatch } from '../graph/normalize';
import type { CompiledProgramIR, SlotMetaEntry, ValueSlot } from './ir/program';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import type { EventHub } from '../events/EventHub';
import { signalType } from '../core/canonical-types';
import { debugService } from '../services/DebugService';
import { compilationInspector } from '../services/CompilationInspectorService';

// Import block registrations (side-effect imports to register blocks)
import '../blocks/time-blocks';
import '../blocks/signal-blocks';
import '../blocks/primitive-blocks'; // NEW - Sprint 9: Three-stage architecture (Stage 1)
import '../blocks/array-blocks'; // NEW - Sprint 9: Three-stage architecture (Stage 2)
import '../blocks/instance-blocks'; // NEW - Sprint 3 (replaces domain-blocks)
import '../blocks/field-blocks';
import '../blocks/math-blocks';
import '../blocks/expression-blocks'; // NEW - Expression DSL Integration Sprint 3
import '../blocks/color-blocks';
import '../blocks/geometry-blocks';
import '../blocks/identity-blocks';
import '../blocks/render-blocks';
import '../blocks/field-operations-blocks';
import '../blocks/path-blocks'; // NEW - Path foundation sprint

import '../blocks/test-blocks'; // Test blocks for signal evaluation in tests

// Import passes
import { pass2TypeGraph } from './passes-v2';
import { pass3Time } from './passes-v2';
import { pass4DepGraph } from './passes-v2';
import { pass5CycleValidation } from './passes-v2';
import { pass6BlockLowering } from './passes-v2';
import { pass7Schedule } from './passes-v2';

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

  // Begin compilation inspection
  try {
    compilationInspector.beginCompile(compileId);
  } catch (e) {
    console.warn('[CompilationInspector] Failed to begin compile:', e);
  }

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
      const compileErrors: CompileError[] = normResult.errors.map((e) => {
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
          default: {
            const _exhaustive: never = e;
            return {
              kind: 'UnknownBlockType',
              message: `Unknown normalization error: ${JSON.stringify(_exhaustive)}`,
            };
          }
        }
      });

      return emitFailure(options, startTime, compileId, compileErrors);
    }

    const normalized = normResult.patch;

    // Capture normalization pass
    try {
      compilationInspector.capturePass('normalization', patch, normalized);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture normalization:', e);
    }

    // Pass 2: Type Graph
    const typedPatch = pass2TypeGraph(normalized);

    try {
      compilationInspector.capturePass('type-graph', normalized, typedPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture type-graph:', e);
    }

    // Pass 3: Time Topology
    const timeResolvedPatch = pass3Time(typedPatch);

    try {
      compilationInspector.capturePass('time', typedPatch, timeResolvedPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture time:', e);
    }

    // Pass 4: Dependency Graph
    const depGraphPatch = pass4DepGraph(timeResolvedPatch);

    try {
      compilationInspector.capturePass('depgraph', timeResolvedPatch, depGraphPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture depgraph:', e);
    }

    // Pass 5: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    try {
      compilationInspector.capturePass('scc', depGraphPatch, acyclicPatch);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture scc:', e);
    }

    // Pass 6: Block Lowering
    const unlinkedIR = pass6BlockLowering(acyclicPatch, {
      events: options?.events,
      compileId,
      patchRevision: options?.patchRevision,
    });

    try {
      compilationInspector.capturePass('block-lowering', acyclicPatch, unlinkedIR);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture block-lowering:', e);
    }

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

    try {
      compilationInspector.capturePass('schedule', unlinkedIR, scheduleIR);
    } catch (e) {
      console.warn('[CompilationInspector] Failed to capture schedule:', e);
    }

    // Convert to CompiledProgramIR
    const compiledIR = convertLinkedIRToProgram(unlinkedIR, scheduleIR);

    // Build edge-to-slot map for debug service (Sprint 1: Debug Probe)
    buildEdgeToSlotMap(patch, typedPatch, unlinkedIR);

    // End compilation inspection (success)
    try {
      compilationInspector.endCompile('success');
    } catch (e) {
      console.warn('[CompilationInspector] Failed to end compile:', e);
    }

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

    console.error('[Compile] Exception caught:', error);
    const compileErrors: CompileError[] = [{
      kind: errorKind,
      message: errorMessage,
    }];

    // End compilation inspection (failure)
    try {
      compilationInspector.endCompile('failure');
    } catch (e2) {
      console.warn('[CompilationInspector] Failed to end compile:', e2);
    }

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
  // End compilation inspection (failure) if not already called
  try {
    if (compilationInspector['currentSnapshot']) {
      compilationInspector.endCompile('failure');
    }
  } catch (e) {
    console.warn('[CompilationInspector] Failed to end compile:', e);
  }

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

/**
 * Build edge-to-slot map for DebugService (Sprint 1: Debug Probe)
 *
 * Maps each edge to its corresponding slot in the runtime ValueStore.
 * This enables UI to query runtime values by hovering edges.
 *
 * Algorithm:
 * 1. For each edge in the patch
 * 2. Look up the target port in the IR's debugIndex
 * 3. Find the slot assigned to that port
 * 4. Get the signal type from typedPatch
 * 5. Store mapping: edge.id → { slotId, type }
 *
 * @param patch - Original patch with edges
 * @param typedPatch - Typed patch from pass2 (has type info)
 * @param unlinkedIR - IR from pass6 (has debugIndex with port→slot mapping)
 */
function buildEdgeToSlotMap(patch: Patch, typedPatch: any, unlinkedIR: any): void {
  const edgeMetaMap = new Map<string, { slotId: ValueSlot; type: any }>();
  const debugIndex = unlinkedIR.builder?.debugIndex;

  // If no debugIndex, we can't build the map
  if (!debugIndex || !debugIndex.slotToPort) {
    console.warn('[DebugService] No debugIndex available, edge-to-slot map will be empty');
    debugService.setEdgeToSlotMap(edgeMetaMap);
    return;
  }

  // Build reverse map: port → slot
  const portToSlot = new Map<string, ValueSlot>();
  for (const [slot, portKey] of debugIndex.slotToPort.entries()) {
    portToSlot.set(portKey, slot as ValueSlot);
  }

  // For each edge, resolve its target port to a slot
  for (const edge of patch.edges) {
    // Build port key: "blockId:portId"
    const targetPortKey = `${edge.to.blockId}:${edge.to.slotId}`;
    const slotId = portToSlot.get(targetPortKey);

    if (slotId !== undefined) {
      // Get type from typedPatch (or default to float)
      // typedPatch should have a typeGraph with edge types
      const edgeType = typedPatch.typeGraph?.edges?.get(edge.id)?.type || signalType('float');

      edgeMetaMap.set(edge.id, {
        slotId,
        type: edgeType,
      });
    }
  }

  // Pass to DebugService
  debugService.setEdgeToSlotMap(edgeMetaMap);
}
