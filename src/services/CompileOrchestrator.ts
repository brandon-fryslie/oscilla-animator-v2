/**
 * Compile Orchestrator Service
 *
 * Handles patch compilation and program swapping with state migration,
 * continuity preservation, and debug probe setup.
 *
 * This is the SINGLE compile path - used for both initial and recompile.
 */

import { compileFromFrontend } from '../compiler';
import { compileFrontend } from '../compiler/frontend';
import type { FrontendError } from '../compiler/frontend';
import type { FrontendResult } from '../compiler/frontend';
import type { CompileResult } from '../compiler/compile';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { Diagnostic } from '../diagnostics/types';
import { convertFrontendErrorsToDiagnostics } from '../compiler/frontend/frontendDiagnosticConversion';
import { convertCompileErrorsToDiagnostics } from '../compiler/diagnosticConversion';
import type { CompileError } from '../compiler/types';
import { untracked } from 'mobx';
import { debugSettings } from '../settings/tokens/debug-settings';
import { compilerFlagsSettings } from '../settings/tokens/compiler-flags-settings';
import type { Patch } from '../graph';
import { blockId as toBlockId } from '../types';
import type { LogDetail } from '../stores/DiagnosticsStore';
import {
  createSessionState,
  createRuntimeStateFromSession,
  migrateState,
  createInitialState,
  prepareStateWriteBank,
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
import { getExprAddressTable } from '../runtime/ExprAddressTable';


/**
 * Wire DebugService to the runtime state and update debug mappings.
 * Called after every compile/recompile to ensure debug state stays in sync.
 */
function setupDebugProbe(
  store: RootStore,
  state: RuntimeState,
  patch: Patch,
  program: CompiledProgramIR,
): void {
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
    // [LAW:single-enforcer] Route debug probe warnings through diagnostics store
    // so all runtime compile diagnostics share one reporting channel.
    store.diagnostics.log({
      level: 'warn',
      message: `[DebugProbe] ${unmappedEdges.length} unmapped edges: ${mappedCount} resolved as constants, ${unmappedCount} remain unmapped`,
    });
  }
  
  debugService.setEdgeToSlotMap(edgeMap, constantValues);
  debugService.setPortToSlotMap(portMap);
  debugService.setUnmappedEdges(unmappedEdges);

  // [LAW:one-source-of-truth] Wire arena reference through the canonical slotToArena
  // address map so consumers do not directly index program.arenaLayout.
  const slotToArena = getExprAddressTable(program).slotToArena;
  debugService.setArenaRef(state.arena, slotToArena);
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

interface CompileReportBase {
  readonly store: RootStore;
  readonly compileId: string;
  readonly patchRevision: number;
  readonly durationMs: number;
}

function emitCompileFailure(
  args: CompileReportBase & {
    readonly patch: Patch;
    readonly phase: 'frontend' | 'backend';
    readonly diagnostics: readonly Diagnostic[];
    readonly details: readonly LogDetail[];
    readonly errorCount: number;
  },
): void {
  args.store.events.emit({
    type: 'CompileEnd',
    compileId: args.compileId,
    patchId: 'patch-0',
    patchRevision: args.patchRevision,
    status: 'failure',
    durationMs: args.durationMs,
    diagnostics: args.diagnostics,
  });

  args.store.diagnostics.log({
    level: 'error',
    message: `Compile failed (${args.phase}): ${args.errorCount} error(s)`,
    details: args.details as LogDetail[],
  });
}

function emitCompileSuccess(
  args: CompileReportBase & {
    readonly diagnostics: readonly Diagnostic[];
  },
): void {
  args.store.events.emit({
    type: 'CompileEnd',
    compileId: args.compileId,
    patchId: 'patch-0',
    patchRevision: args.patchRevision,
    status: 'success',
    durationMs: args.durationMs,
    diagnostics: args.diagnostics,
  });

  const warnCount = args.diagnostics.filter(d => d.severity === 'warn').length;
  const infoCount = args.diagnostics.filter(d => d.severity === 'info').length;
  const diagSuffix = (warnCount + infoCount) > 0
    ? ` (${warnCount} warning(s), ${infoCount} info)`
    : '';
  args.store.diagnostics.log({
    level: 'info',
    message: `Compile succeeded in ${args.durationMs}ms${diagSuffix}`,
  });
}

export interface CompileOrchestratorState {
  currentProgram: CompiledProgramIR | null;
  currentState: RuntimeState | null;
  sessionState: SessionState | null;
}

export interface PrecomputedCompileArtifacts {
  readonly sourcePatchRevision: number;
  readonly frontendResult: FrontendResult;
  readonly backendResult: CompileResult | null;
  readonly compileDurationMs: number;
}

export interface CompileOrchestratorDeps {
  store: RootStore;
  state: CompileOrchestratorState;
  onDomainChange?: (oldProgram: CompiledProgramIR, newProgram: CompiledProgramIR) => void;
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
export async function compileAndSwap(
  deps: CompileOrchestratorDeps,
  isInitial: boolean = false,
  precomputed?: PrecomputedCompileArtifacts,
): Promise<void> {
  const { store, state, onDomainChange } = deps;
  const patch = untracked(() => store.patch.patch);
  if (!patch) {
    return;
  }

  const currentPatchRevision = store.getPatchRevision();
  if (precomputed && precomputed.sourcePatchRevision !== currentPatchRevision) {
    // [LAW:no-silent-fallbacks] Dropped stale worker results must be visible;
    // otherwise the runtime appears to ignore user edits with no explanation.
    store.diagnostics.log({
      level: 'warn',
      message: `Recompile result dropped as stale (compiled r${precomputed.sourcePatchRevision}, current r${currentPatchRevision}); waiting for latest edit compile.`,
    });
    return;
  }

  const patchRevision = precomputed?.sourcePatchRevision ?? currentPatchRevision;
  const compileId = isInitial ? 'compile-0' : `compile-live-${Date.now()}`;
  const compileStartMs = Date.now();

  // Emit CompileBegin event
  store.events.emit({
    type: 'CompileBegin',
    compileId,
    patchId: 'patch-0',
    patchRevision,
    trigger: isInitial ? 'startup' : 'graphCommitted',
  });

  const debugValues = store.settings.get(debugSettings);
  const flagOverrides = store.settings.get(compilerFlagsSettings);
  const frontendResult = precomputed?.frontendResult ?? compileFrontend(patch, {
    traceCardinalitySolver: debugValues?.traceCardinalitySolver,
    diagnosticOverrides: flagOverrides ?? undefined,
  });
  let compileDurationMs = precomputed?.compileDurationMs ?? (Date.now() - compileStartMs);

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
    emitCompileFailure({
      store,
      patch,
      compileId,
      patchRevision,
      durationMs: compileDurationMs,
      phase: 'frontend',
      diagnostics: frontendDiagnostics,
      details: frontendErrorDetails(frontendResult.errors, patch),
      errorCount: frontendResult.errors.length,
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

  let result: CompileResult | null = precomputed?.backendResult ?? null;
  if (!result) {
    result = compileFromFrontend(frontendResult, {
      events: store.events,
      patchRevision,
      patchId: 'patch-0',
    });
    compileDurationMs = Date.now() - compileStartMs;
  }

  if (result.kind !== 'ok') {
    const errorMsg = result.errors.map(e => e.message).join(', ');
    emitCompileFailure({
      store,
      patch,
      compileId,
      patchRevision,
      durationMs: compileDurationMs,
      phase: 'backend',
      diagnostics: [
        ...convertCompileErrorsToDiagnostics(result.errors, patchRevision, compileId),
        ...frontendDiagnostics,
      ],
      details: backendErrorDetails(result.errors, patch),
      errorCount: result.errors.length,
    });

    if (isInitial) {
      throw new Error(`Initial compile failed (backend): ${errorMsg}`);
    }
    // For recompile, keep running with old program
    return;
  }

  const program = result.program;
  const runtimeAddressTable = program.runtimeAddressTable;
  if (!runtimeAddressTable?.slotLookup) {
    // [LAW:single-enforcer] Runtime slot cardinality comes from the compiler
    // runtime-address contract; orchestrator must not derive from legacy metadata.
    throw new Error('[compile] runtimeAddressTable.slotLookup is missing - compiler/runtime contract violation');
  }

  // Get schedule info
  const newSchedule = program.schedule as {
    stateSlotCount?: number;
    stateMappings?: readonly any[];
    instances?: ReadonlyMap<string, any>;
  };
  const newStateSlotCount = newSchedule?.stateSlotCount ?? 0;
  const newStateMappings = newSchedule?.stateMappings ?? [];
  const newEventSlotCount = (newSchedule as { eventSlotCount?: number })?.eventSlotCount ?? 0;
  const newEventCount = (newSchedule as { eventCount?: number })?.eventCount ?? 0;
  const newValueExprCount = program.valueExprs?.nodes.length ?? 0;
  // [LAW:one-source-of-truth] Shape2D bank sizing derives from the canonical
  // runtime address table rather than ad-hoc slot metadata scans.
  let newShape2DSlotCount = 0;
  for (const lookup of runtimeAddressTable.slotLookup.values()) {
    if (lookup.storage !== 'shape2d') continue;
    const end = lookup.offset + lookup.stride;
    if (end > newShape2DSlotCount) {
      newShape2DSlotCount = end;
    }
  }

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
    newStateSlotCount,
    newEventSlotCount,
    newEventCount,
    newValueExprCount,
    program.arenaTotalFloats,
    newShape2DSlotCount,
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
  // [LAW:one-source-of-truth] Keep read/write state banks synchronized at
  // compile boundary so first post-swap frame has deterministic bank ownership.
  prepareStateWriteBank(state.currentState);

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
  setupDebugProbe(store, state.currentState!, patch, program);

  // Update program
  state.currentProgram = program;

  // Extract instance counts for diagnostics
  const instanceCounts = new Map<string, number>();
  if (newSchedule?.instances) {
    for (const [id, decl] of newSchedule.instances) {
      const count = typeof decl.count === 'number' ? decl.count : 0;
      instanceCounts.set(id, count);
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

  const allDiagnostics = [...frontendDiagnostics, ...backendWarningDiagnostics];

  emitCompileSuccess({
    store,
    compileId,
    patchRevision,
    durationMs: compileDurationMs,
    diagnostics: allDiagnostics,
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
