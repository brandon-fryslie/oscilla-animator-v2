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
import { convertFrontendErrorsToDiagnostics } from '../compiler/frontend/frontendDiagnosticConversion';
import { untracked } from 'mobx';
import { compilerFlagsSettings } from '../settings/tokens/compiler-flags-settings';
import type { Patch } from '../graph';
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
  const frontendResult = compileFrontend(patch);

  // Store frontend snapshot regardless of success/failure
  if (frontendResult.kind === 'ok') {
    store.frontend.updateFromFrontendResult(frontendResult.result, patchRevision);
  } else {
    store.frontend.updateFromFrontendFailure(frontendResult, patchRevision);
  }

  // If frontend failed or backend is not ready, emit diagnostics and bail early
  if (frontendResult.kind === 'error') {
    const errorMsg = frontendResult.errors.map((e: { message: string }) => e.message).join(', ');
    const diagnostics = convertFrontendErrorsToDiagnostics(frontendResult.errors, patchRevision, compileId);

    // Emit CompileEnd with frontend errors
    store.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: 'patch-0',
      patchRevision,
      status: 'failure',
      durationMs: Date.now() - startTime,
      diagnostics,
    });

    store.diagnostics.log({
      level: 'error',
      message: `Compile failed (frontend): ${isInitial ? JSON.stringify(frontendResult.errors) : errorMsg}`,
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

  // Frontend succeeded - check if backend can proceed
  if (!frontendResult.result.backendReady) {
    const errorMsg = frontendResult.result.errors.map((e: { message: string }) => e.message).join(', ');
    const diagnostics = convertFrontendErrorsToDiagnostics(frontendResult.result.errors, patchRevision, compileId);

    // Emit CompileEnd with partial frontend errors (backend not ready)
    store.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: 'patch-0',
      patchRevision,
      status: 'failure',
      durationMs: Date.now() - startTime,
      diagnostics,
    });

    store.diagnostics.log({
      level: 'error',
      message: `Compile failed (frontend not ready for backend): ${errorMsg}`,
    });

    if (isInitial) {
      throw new Error(`Initial compile failed (frontend not ready): ${errorMsg}`);
    }
    // For recompile, keep running with old program
    return;
  }

  // =========================================================================
  // Step 2: Run Backend Compilation (reuse precomputed frontend)
  // =========================================================================

  // Read compiler flag settings (severity overrides for diagnostic codes)
  const diagnosticFlags = store.settings.get(compilerFlagsSettings);

  // Compile the patch (with precomputed frontend result)
  const result = compile(patch, {
    events: store.events,
    patchRevision,
    patchId: 'patch-0',
    diagnosticFlags,
    precomputedFrontend: frontendResult.result,
  });

  if (result.kind !== 'ok') {
    const errorMsg = result.errors.map(e => e.message).join(', ');

    // Emit CompileEnd with backend errors (empty for now - backend errors not yet converted to Diagnostic)
    // TODO: Convert backend CompileErrors to Diagnostics using convertCompileErrorsToDiagnostics
    store.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: 'patch-0',
      patchRevision,
      status: 'failure',
      durationMs: Date.now() - startTime,
      diagnostics: [],
    });

    store.diagnostics.log({
      level: 'error',
      message: `Compile failed (backend): ${isInitial ? JSON.stringify(result.errors) : errorMsg}`,
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

  // Compilation succeeded - emit CompileEnd with success
  // Frontend errors (if any non-fatal warnings) should be included
  const frontendDiagnostics = frontendResult.result.errors.length > 0
    ? convertFrontendErrorsToDiagnostics(frontendResult.result.errors, patchRevision, compileId)
    : [];

  store.events.emit({
    type: 'CompileEnd',
    compileId,
    patchId: 'patch-0',
    patchRevision,
    status: 'success',
    durationMs: Date.now() - startTime,
    diagnostics: frontendDiagnostics,
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
