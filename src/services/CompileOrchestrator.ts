/**
 * Compile Orchestrator Service
 *
 * Handles patch compilation and program swapping with state migration,
 * continuity preservation, and debug probe setup.
 *
 * This is the SINGLE compile path - used for both initial and recompile.
 */

import { compile } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import type { FrontendError } from '../compiler/frontend';
import { convertFrontendErrorsToDiagnostics } from '../compiler/frontend/frontendDiagnosticConversion';
import { convertCompileErrorsToDiagnostics } from '../compiler/diagnosticConversion';
import type { CompileError } from '../compiler/types';
import { untracked } from 'mobx';
import { debugSettings } from '../settings/tokens/debug-settings';
import type { Patch } from '../graph';
import { blockId as toBlockId } from '../types';
import type { LogDetail } from '../stores/DiagnosticsStore';
import {
  createSessionState,
  createRuntimeStateFromSession,
  migrateState,
  createInitialState,
  reconcilePhaseOffsets,
  type SessionState,
} from '../runtime';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RootStore } from '../stores';
import { type ValueSlot } from '../types';
import { debugService } from './DebugService';
import { mapDebugMappings } from './mapDebugEdges';
import { extractConstantValues } from './ConstantValueTracker';
import { pruneStaleContinuity } from '../runtime/ContinuityState';


/**
 * Wire DebugService to the runtime state and update debug mappings.
 * Called after every compile/recompile to ensure debug state stays in sync.
 */
function setupDebugProbe(state: RuntimeState, patch: Patch, program: any): void {
  // Wire tap callbacks for runtime value observation
  state.tap = {
    recordSlotValue: (slotId: ValueSlot, value: number) => debugService.updateSlotValue(slotId, value),
    recordFieldValue: (slotId: ValueSlot, buffer: ArrayBufferView) => debugService.updateFieldValue(slotId, buffer),
    getTrackedFieldSlots: () => debugService.getTrackedFieldSlots(),
  };

  // Build and set debug mappings (edge→slot and port→slot)
  const { edgeMap, portMap, unmappedEdges } = mapDebugMappings(patch, program);
  
  // Extract constant values for unmapped edges from eliminated blocks
  const constantValues = extractConstantValues(patch, unmappedEdges);
  
  if (unmappedEdges.length > 0) {
    const mappedCount = constantValues.size;
    const unmappedCount = unmappedEdges.length - mappedCount;
    console.warn(
      `[DebugProbe] ${unmappedEdges.length} unmapped edges: ${mappedCount} resolved as constants, ${unmappedCount} remain unmapped`
    );
  }
  
  debugService.setEdgeToSlotMap(edgeMap, constantValues);
  debugService.setPortToSlotMap(portMap);
  debugService.setUnmappedEdges(unmappedEdges);
}

function frontendErrorDetails(errors: readonly FrontendError[], patch: Patch): LogDetail[] {
  return errors.map(e => ({
    message: e.message,
    blockId: e.blockId,
    blockType: e.blockId ? patch.blocks.get(toBlockId(e.blockId))?.type : undefined,
    portId: e.portId,
  }));
}

function backendErrorDetails(errors: readonly CompileError[], patch: Patch): LogDetail[] {
  return errors.map(e => ({
    message: e.message,
    blockId: e.where?.blockId,
    blockType: e.where?.blockId ? patch.blocks.get(toBlockId(e.where.blockId))?.type : undefined,
    portId: e.where?.port,
  }));
}

export interface CompileOrchestratorState {
  currentProgram: any | null;
  currentState: RuntimeState | null;
  sessionState: SessionState | null;
  prevInstanceCounts: Map<string, number>;
}

export interface CompileOrchestratorDeps {
  store: RootStore;
  state: CompileOrchestratorState;
  onDomainChange?: (oldProgram: any, newProgram: any) => void;
}

/**
 * Compile the current patch from store and swap to the new program.
 *
 * Handles:
 * - Frontend-first compilation with snapshot storage
 * - State migration with stable StateIds
 * - Continuity preservation
 * - Debug probe setup
 * - Domain change detection
 * - Phase continuity offset reconciliation
 *
 * @param isInitial - True for first compile (hard swap), false for recompile (soft swap)
 */
export async function compileAndSwap(deps: CompileOrchestratorDeps, isInitial: boolean = false): Promise<void> {
  const { store, state, onDomainChange } = deps;
  const patch = untracked(() => store.patch.patch);
  if (!patch) {
    return;
  }

  const patchRevision = store.getPatchRevision();
  const compileId = isInitial ? 'compile-0' : `compile-live-${Date.now()}`;
  const startTime = Date.now();

  // Emit CompileBegin event
  store.events.emit({
    type: 'CompileBegin',
    compileId,
    patchId: 'patch-0',
    patchRevision,
    trigger: isInitial ? 'startup' : 'graphCommitted',
  });

  // =========================================================================
  // Step 1: Run Frontend Compilation
  // =========================================================================
  const debugValues = store.settings.get(debugSettings);
  const frontendResult = compileFrontend(patch, {
    traceCardinalitySolver: debugValues?.traceCardinalitySolver,
  });

  // Store frontend snapshot (always available now)
  // [LAW:dataflow-not-control-flow] Frontend always produces a FrontendResult.
  store.frontend.updateFromFrontendResult(frontendResult, patchRevision);

  // [LAW:one-source-of-truth] Compute frontend diagnostics once for all paths.
  const frontendDiagnostics = frontendResult.errors.length > 0
    ? convertFrontendErrorsToDiagnostics(frontendResult.errors, patchRevision, compileId)
    : [];

  // If backend is not ready, emit diagnostics and bail early
  if (!frontendResult.backendReady) {
    const errorMsg = frontendResult.errors.map((e: { message: string }) => e.message).join(', ');

    // Emit CompileEnd with frontend errors
    store.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: 'patch-0',
      patchRevision,
      status: 'failure',
      durationMs: Date.now() - startTime,
      diagnostics: frontendDiagnostics,
    });

    store.diagnostics.log({
      level: 'error',
      message: `Compile failed (frontend): ${frontendResult.errors.length} error(s)`,
      details: frontendErrorDetails(frontendResult.errors, patch),
    });

    if (isInitial) {
      // INVARIANT: Initial compile MUST succeed. Failure means the demo patch
      // is structurally broken (e.g., missing required inputs, unknown block types).
      // This throw exists to surface those bugs immediately. Do NOT remove it or
      // wrap it in a try/catch - fix the underlying patch instead.
      // See: src/__tests__/initial-compile-invariant.test.ts
      throw new Error(`Initial compile failed (frontend): ${errorMsg}`);
    }
    // For recompile, keep running with old program
    return;
  }

  // =========================================================================
  // Step 2: Run Backend Compilation (reuse precomputed frontend)
  // =========================================================================

  // Compile the patch (with precomputed frontend result)
  const result = compile(patch, {
    events: store.events,
    patchRevision,
    patchId: 'patch-0',
    precomputedFrontend: frontendResult,
  });

  if (result.kind !== 'ok') {
    const errorMsg = result.errors.map(e => e.message).join(', ');

    // Emit CompileEnd with backend errors + frontend diagnostics
    store.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: 'patch-0',
      patchRevision,
      status: 'failure',
      durationMs: Date.now() - startTime,
      diagnostics: [
        ...convertCompileErrorsToDiagnostics(result.errors, patchRevision, compileId),
        ...frontendDiagnostics,
      ],
    });

    store.diagnostics.log({
      level: 'error',
      message: `Compile failed (backend): ${result.errors.length} error(s)`,
      details: backendErrorDetails(result.errors, patch),
    });

    if (isInitial) {
      throw new Error(`Initial compile failed (backend): ${errorMsg}`);
    }
    // For recompile, keep running with old program
    return;
  }

  const program = result.program;

  // Get schedule info
  const newSchedule = program.schedule as {
    stateSlotCount?: number;
    stateMappings?: readonly any[];
    instances?: ReadonlyMap<string, any>;
  };
  const newSlotCount = program.slotMeta.length;
  const newStateSlotCount = newSchedule?.stateSlotCount ?? 0;
  const newStateMappings = newSchedule?.stateMappings ?? [];
  const newEventSlotCount = (newSchedule as { eventSlotCount?: number })?.eventSlotCount ?? 0;
  const newEventCount = (newSchedule as { eventCount?: number })?.eventCount ?? 0;
  const newValueExprCount = program.valueExprs?.nodes.length ?? 0;

  // For recompile: detect domain changes
  if (!isInitial && state.currentProgram && onDomainChange) {
    onDomainChange(state.currentProgram, program);
  }

  // Get old state info for migration
  const oldSchedule = state.currentProgram?.schedule as { stateSlotCount?: number; stateMappings?: readonly any[] } | undefined;
  const oldStateMappings = oldSchedule?.stateMappings ?? [];
  const oldPrimitiveState = state.currentState?.state;

  // Initialize session state on first compile
  if (isInitial) {
    state.sessionState = createSessionState();
  }

  // Create new RuntimeState from preserved SessionState + fresh ProgramState
  state.currentState = createRuntimeStateFromSession(
    state.sessionState!,
    newSlotCount,
    newStateSlotCount,
    newEventSlotCount,
    newEventCount,
    newValueExprCount
  );

  // Handle primitive state migration
  if (!isInitial && oldPrimitiveState && newStateMappings.length > 0) {
    // Migrate using stable StateIds (sessionState.continuity has lane mappings)
    const getLaneMapping = (instanceId: string) => {
      return state.sessionState!.continuity.mappings.get(instanceId) ?? null;
    };

    migrateState(
      oldPrimitiveState,
      state.currentState.state,
      oldStateMappings,
      newStateMappings,
      getLaneMapping
    );
  } else if (newStateMappings.length > 0) {
    // Initialize fresh (first compile or no old state)
    const initialState = createInitialState(newStateSlotCount, newStateMappings);
    state.currentState.state.set(initialState);
  }

  // Reconcile phase offsets when time model periods change (hot-swap continuity)
  if (!isInitial && state.currentProgram?.schedule) {
    const oldTimeModel = state.currentProgram.schedule.timeModel;
    const newTimeModel = program.schedule.timeModel;
    const monotonicTMs = state.sessionState!.timeState.prevTMs ?? 0;

    if (oldTimeModel && newTimeModel) {
      reconcilePhaseOffsets(
        oldTimeModel,
        newTimeModel,
        monotonicTMs,
        state.sessionState!.timeState
      );
    }
  }

  // Set RuntimeState reference in ContinuityStore
  store.continuity.setRuntimeStateRef(state.currentState);

  // ALWAYS update debug probe (mappings can change even if slot count doesn't)
  setupDebugProbe(state.currentState!, patch, program);

  // Update program
  state.currentProgram = program;

  // Extract instance counts for diagnostics
  const instanceCounts = new Map<string, number>();
  if (newSchedule?.instances) {
    for (const [id, decl] of newSchedule.instances) {
      const count = typeof decl.count === 'number' ? decl.count : 0;
      instanceCounts.set(id, count);
      if (isInitial) {
        state.prevInstanceCounts.set(id, count);
      }
    }
  }

  // Prune stale continuity entries for instances removed from the graph
  if (!isInitial && state.sessionState) {
    pruneStaleContinuity(state.sessionState.continuity, new Set(instanceCounts.keys()));
  }

  // Compilation succeeded - emit CompileEnd with success
  // Include frontend diagnostics and backend warnings (unreachable block errors, flag downgrades)
  const backendWarningDiagnostics = result.warnings.length > 0
    ? convertCompileErrorsToDiagnostics(result.warnings, patchRevision, compileId, 'warn')
    : [];

  store.events.emit({
    type: 'CompileEnd',
    compileId,
    patchId: 'patch-0',
    patchRevision,
    status: 'success',
    durationMs: Date.now() - startTime,
    diagnostics: [...frontendDiagnostics, ...backendWarningDiagnostics],
  });

  // Emit ProgramSwapped event
  store.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision,
    compileId,
    swapMode: isInitial ? 'hard' : 'soft',
    instanceCounts: isInitial ? undefined : instanceCounts,
  });
}
