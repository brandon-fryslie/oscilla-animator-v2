/**
 * Compile Orchestrator Service
 *
 * Handles patch compilation and program swapping with state migration,
 * continuity preservation, and debug probe setup.
 *
 * This is the SINGLE compile path - used for both initial and recompile.
 */

import { compile } from '../compiler';
import type { Patch } from '../graph';
import {
  createSessionState,
  createRuntimeStateFromSession,
  migrateState,
  createInitialState,
  type SessionState,
} from '../runtime';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RootStore } from '../stores';
import { type ValueSlot } from '../types';
import { debugService } from './DebugService';
import { mapDebugMappings } from './mapDebugEdges';

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
  if (unmappedEdges.length > 0) {
    console.warn('[DebugProbe] Unmapped edges:', unmappedEdges.map(e => `${e.edgeId}: ${e.fromBlockId}.${e.fromPort} → ${e.toBlockId}.${e.toPort}`));
  }
  debugService.setEdgeToSlotMap(edgeMap);
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
 * - State migration with stable StateIds
 * - Continuity preservation
 * - Debug probe setup
 * - Domain change detection
 *
 * @param isInitial - True for first compile (hard swap), false for recompile (soft swap)
 */
export async function compileAndSwap(deps: CompileOrchestratorDeps, isInitial: boolean = false): Promise<void> {
  const { store, state, onDomainChange } = deps;
  const patch = store.patch.patch;
  if (!patch) {
    return;
  }

  // Compile the patch
  const result = compile(patch, {
    events: store.events,
    patchRevision: store.getPatchRevision(),
    patchId: 'patch-0',
  });

  if (result.kind !== 'ok') {
    const errorMsg = result.errors.map(e => e.message).join(', ');
    store.diagnostics.log({
      level: 'error',
      message: `Compile failed: ${isInitial ? JSON.stringify(result.errors) : errorMsg}`,
    });
    if (isInitial) {
      // INVARIANT: Initial compile MUST succeed. Failure means the demo patch
      // is structurally broken (e.g., missing required inputs, unknown block types).
      // This throw exists to surface those bugs immediately. Do NOT remove it or
      // wrap it in a try/catch - fix the underlying patch instead.
      // See: src/__tests__/initial-compile-invariant.test.ts
      throw new Error(`Initial compile failed: ${errorMsg}`);
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
  const newEventExprCount = (newSchedule as { eventExprCount?: number })?.eventExprCount ?? 0;
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
    newEventExprCount,
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

  // Emit ProgramSwapped event
  store.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: store.getPatchRevision(),
    compileId: isInitial ? 'compile-0' : `compile-live-${Date.now()}`,
    swapMode: isInitial ? 'hard' : 'soft',
    instanceCounts: isInitial ? undefined : instanceCounts,
  });
}
