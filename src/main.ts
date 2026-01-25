/**
 * Oscilla v2 - Main Application Entry
 *
 * Single React root entry point.
 * Sets up the demo patch and animation loop.
 *
 * Sprint 2: Integrates runtime health monitoring
 * Uses registry defaults for all inputs
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { reaction, toJS } from 'mobx';
import { buildPatch, type Patch } from './graph';
import { migratePatch } from './graph/patchMigrations';
import { compile } from './compiler';
import {
  createSessionState,
  createRuntimeStateFromSession,
  extractSessionState,
  BufferPool,
  executeFrame,
  migrateState,
  createInitialState,
  type SessionState,
} from './runtime';
import { renderFrame } from './render';
import { App } from './ui/components';
import { StoreProvider, type RootStore } from './stores';
import { type BlockId, type ValueSlot } from './types';
import { recordFrameTime, recordFrameDelta, shouldEmitSnapshot, emitHealthSnapshot, computeFrameTimingStats, resetFrameTimingStats } from './runtime/HealthMonitor';
import type { RuntimeState } from './runtime/RuntimeState';
import { debugService } from './services/DebugService';
import { mapDebugMappings } from './services/mapDebugEdges';
import { patches, DEFAULT_PATCH_INDEX, type PatchBuilder } from './demo';

// =============================================================================
// Global State
// =============================================================================

let currentProgram: any = null;
let currentState: RuntimeState | null = null;
let sessionState: SessionState | null = null; // Long-lived, survives hot-swap
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let pool: BufferPool | null = null;

// Store reference - set via callback from React when StoreProvider mounts
let store: RootStore | null = null;

// =============================================================================
// Debug Probe Setup (Single Source of Truth)
// =============================================================================

/**
 * Wire DebugService to the runtime state and update debug mappings.
 * Called after every compile/recompile to ensure debug state stays in sync.
 *
 * This is the ONLY place debug probe setup should happen.
 * Called from compileAndSwap() after both initial and hot-swap compiles.
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

// =============================================================================
// Logging
// =============================================================================

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  // Log to diagnostics store (id and timestamp added by store)
  // Guard against early calls before store is ready
  store?.diagnostics.log({
    level,
    message: msg,
  });
}

let currentPatchIndex = DEFAULT_PATCH_INDEX;

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const STORAGE_KEY = 'oscilla-v2-patch-v10'; // Bumped to invalidate stale patches after block genericization (FieldSin->Sin, etc.)

/** Clear localStorage and reload - exposed globally for UI */
function clearStorageAndReload(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
(window as unknown as { clearStorageAndReload: typeof clearStorageAndReload }).clearStorageAndReload = clearStorageAndReload;

interface SerializedPatch {
  blocks: Array<{
    id: string;
    type: string;
    params: Record<string, unknown>;
    label?: string;
    displayName: string | null;
    domainId: string | null;
    role: { kind: string; meta: Record<string, unknown> };
    inputPorts: Array<{ id: string; defaultSource?: unknown }>;
    outputPorts: Array<{ id: string }>;
  }>;
  edges: Array<{
    id: string;
    from: { kind: 'port'; blockId: string; slotId: string };
    to: { kind: 'port'; blockId: string; slotId: string };
    enabled?: boolean;
    sortKey?: number;
  }>;
  presetIndex: number;
}

function serializePatch(patch: Patch, presetIndex: number): string {
  const serialized: SerializedPatch = {
    blocks: Array.from(patch.blocks.entries()).map(([, block]) => ({
      id: block.id,
      type: block.type,
      params: { ...block.params },
      ...(block.label && { label: block.label }),
      displayName: block.displayName,
      domainId: block.domainId,
      role: block.role as { kind: string; meta: Record<string, unknown> },
      inputPorts: Array.from(block.inputPorts.values()),
      outputPorts: Array.from(block.outputPorts.values()),
    })),
    edges: patch.edges.map(e => ({ ...e })),
    presetIndex,
  };
  return JSON.stringify(serialized);
}

function deserializePatch(json: string): { patch: Patch; presetIndex: number } | null {
  try {
    const data: SerializedPatch = JSON.parse(json);
    const blocks = new Map<BlockId, any>();
    for (const b of data.blocks) {
      blocks.set(b.id as BlockId, {
        ...b,
        inputPorts: new Map(b.inputPorts.map(p => [p.id, p])),
        outputPorts: new Map(b.outputPorts.map(p => [p.id, p])),
      });
    }
    const rawPatch = { blocks, edges: data.edges };

    // Apply patch migrations for removed/renamed blocks
    const { patch: migratedPatch, migrations } = migratePatch(rawPatch);

    // Log migrations to console for debugging
    if (migrations.length > 0) {
      console.warn(
        `[PatchMigration] Applied ${migrations.length} migrations to patch:`,
        migrations.map(m => `  - ${m.kind}: ${m.reason}`).join('\n'),
      );
    }

    return {
      patch: migratedPatch,
      presetIndex: data.presetIndex,
    };
  } catch {
    return null;
  }
}

function savePatchToStorage(patch: Patch, presetIndex: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializePatch(patch, presetIndex));
  } catch {
    // Storage full or unavailable - silently ignore
  }
}

function loadPatchFromStorage(): { patch: Patch; presetIndex: number } | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return deserializePatch(json);
  } catch {
    return null;
  }
}

// =============================================================================
// Build and Compile
// =============================================================================

/**
 * Build a patch from a PatchBuilder and load it into the store.
 * Does NOT compile - call compileAndSwap() after this.
 */
function build(patchBuilder: PatchBuilder): Patch {
  const patch = buildPatch(patchBuilder);


  // Load patch into store
  store!.patch.loadPatch(patch);

  return patch;
}

/**
 * Compile the current patch from store and swap to the new program.
 *
 * This is the SINGLE compile path - used for both initial compile and recompile.
 * Handles:
 * - State migration with stable StateIds
 * - Continuity preservation
 * - Debug probe setup
 * - Domain change detection
 *
 * @param isInitial - True for first compile (hard swap), false for recompile (soft swap)
 */
async function compileAndSwap(isInitial: boolean = false) {
  const patch = store!.patch.patch;
  if (!patch) {
    return;
  }


  // Compile the patch
  const result = compile(patch, {
    events: store!.events,
    patchRevision: store!.getPatchRevision(),
    patchId: 'patch-0',
  });

  if (result.kind !== 'ok') {
    const errorMsg = result.errors.map(e => e.message).join(', ');
    log(`Compile failed: ${isInitial ? JSON.stringify(result.errors) : errorMsg}`, 'error');
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

  // For recompile: detect domain changes
  if (!isInitial && currentProgram) {
    detectAndLogDomainChanges(currentProgram, program);
  }

  // Get old state info for migration
  const oldSchedule = currentProgram?.schedule as { stateSlotCount?: number; stateMappings?: readonly any[] } | undefined;
  const oldStateMappings = oldSchedule?.stateMappings ?? [];
  const oldPrimitiveState = currentState?.state;

  // Initialize session state on first compile
  if (isInitial) {
    sessionState = createSessionState();
  }

  // Always create fresh ProgramState on compile (this is the cleaner lifecycle)
  const oldSlotCount = currentState?.values.f64.length ?? 0;
  const oldStateSlotCount = oldSchedule?.stateSlotCount ?? 0;
  if (!isInitial) {  }

  // Create new RuntimeState from preserved SessionState + fresh ProgramState
  currentState = createRuntimeStateFromSession(sessionState!, newSlotCount, newStateSlotCount, newEventSlotCount, newEventExprCount);

  // Handle primitive state migration
  if (!isInitial && oldPrimitiveState && newStateMappings.length > 0) {
    // Migrate using stable StateIds (sessionState.continuity has lane mappings)
    const getLaneMapping = (instanceId: string) => {
      return sessionState!.continuity.mappings.get(instanceId) ?? null;
    };

    const migrationResult = migrateState(
      oldPrimitiveState,
      currentState.state,
      oldStateMappings,
      newStateMappings,
      getLaneMapping
    );

    if (migrationResult.migrated) {    }
  } else if (newStateMappings.length > 0) {
    // Initialize fresh (first compile or no old state)
    const initialState = createInitialState(newStateSlotCount, newStateMappings);
    currentState.state.set(initialState);
  }

  // Set RuntimeState reference in ContinuityStore
  store!.continuity.setRuntimeStateRef(currentState);

  // ALWAYS update debug probe (mappings can change even if slot count doesn't)
  setupDebugProbe(currentState!, patch, program);

  // Update program
  currentProgram = program;

  // Extract instance counts for diagnostics
  const instanceCounts = new Map<string, number>();
  if (newSchedule?.instances) {
    for (const [id, decl] of newSchedule.instances) {
      const count = typeof decl.count === 'number' ? decl.count : 0;
      instanceCounts.set(id, count);
      if (isInitial) {
        prevInstanceCounts.set(id, count);
      }
    }
  }

  if (isInitial) {  }


  // Emit ProgramSwapped event
  store!.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: store!.getPatchRevision(),
    compileId: isInitial ? 'compile-0' : `compile-live-${Date.now()}`,
    swapMode: isInitial ? 'hard' : 'soft',
    instanceCounts: isInitial ? undefined : instanceCounts,
  });

}

// =============================================================================
// Live Recompile (Continuity-UI Sprint 1)
// Continuity Logging (Continuity-UI Sprint 2)
// =============================================================================

let recompileTimeout: ReturnType<typeof setTimeout> | null = null;
const RECOMPILE_DEBOUNCE_MS = 16; // ~1 frame at 60fps for responsive parameter control

/** Track previous instance counts for domain change detection */
let prevInstanceCounts: Map<string, number> = new Map();

/** Throttle state for domain change logging */
const domainChangeLogThrottle = new Map<string, number>();
const DOMAIN_LOG_INTERVAL_MS = 200; // Max 5 logs/sec per instance

/**
 * Log domain change if not throttled.
 * Also records to ContinuityStore for UI display.
 */
function logDomainChange(instanceId: string, oldCount: number, newCount: number, tMs: number = 0) {
  const now = performance.now();
  const lastLog = domainChangeLogThrottle.get(instanceId) ?? 0;

  if (now - lastLog >= DOMAIN_LOG_INTERVAL_MS) {
    const delta = newCount - oldCount;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    // Log mapping stats (simplified - all existing elements map, delta are new/removed)
    if (delta > 0) {    } else if (delta < 0) {    }

    // Record to ContinuityStore for UI (Sprint 3)
    store!.continuity.recordDomainChange(
      instanceId,
      oldCount,
      newCount,
      tMs || now,
      oldCount > 0 ? 'byId' : 'none' // Simplified: assume byId mapping for existing elements
    );

    domainChangeLogThrottle.set(instanceId, now);
  }
}

/**
 * Detect domain changes by comparing old/new instance counts
 */
function detectAndLogDomainChanges(oldProgram: any, newProgram: any) {
  if (!oldProgram?.schedule?.instances || !newProgram?.schedule?.instances) {
    return;
  }

  const oldInstances = oldProgram.schedule.instances as Map<string, { count: number }>;
  const newInstances = newProgram.schedule.instances as Map<string, { count: number }>;

  // Check for changes in existing instances
  for (const [id, newDecl] of newInstances) {
    const oldCount = prevInstanceCounts.get(id) ?? 0;
    const newCount = typeof newDecl.count === 'number' ? newDecl.count : 0;

    if (oldCount !== newCount && oldCount > 0) {
      logDomainChange(id, oldCount, newCount);
    }

    // Update tracking
    prevInstanceCounts.set(id, newCount);
  }

  // Check for removed instances
  for (const [id, _oldDecl] of oldInstances) {
    if (!newInstances.has(id)) {
      const oldCount = prevInstanceCounts.get(id) ?? 0;
      if (oldCount > 0) {      }
      prevInstanceCounts.delete(id);
    }
  }
}

/**
 * Debounced recompile - waits for changes to settle before recompiling.
 */
function scheduleRecompile() {
  if (recompileTimeout) {
    clearTimeout(recompileTimeout);
  }
  recompileTimeout = setTimeout(async () => {
    try {
      await compileAndSwap(false); // false = recompile, not initial
    } catch (err) {
      log(`Recompile error: ${err}`, 'error');
      console.error(err);
    }
  }, RECOMPILE_DEBOUNCE_MS);
}

/**
 * Create a hash of block params and inputPorts for change detection.
 * We need deep change detection since MobX only tracks shallow changes.
 * Including inputPorts ensures defaultSource changes trigger recompilation.
 */
function hashBlockParams(blocks: ReadonlyMap<string, any>): string {
  const parts: string[] = [];
  for (const [id, block] of blocks) {
    // Hash both params and inputPorts (for defaultSource changes)
    const inputPortsData: Record<string, any> = {};
    if (block.inputPorts) {
      for (const [portId, port] of block.inputPorts) {
        inputPortsData[portId] = port;
      }
    }
    parts.push(`${id}:${JSON.stringify(block.params)}:${JSON.stringify(inputPortsData)}`);
  }
  return parts.join('|');
}

// Track state to skip unnecessary reaction fires
let reactionDisposer: (() => void) | null = null;
let lastBlockParamsHash: string | null = null;
let lastBlockCount: number = 0;
let lastEdgeCount: number = 0;
let reactionSetup = false;

/**
 * Set up MobX reaction to watch for patch changes.
 */
function setupLiveRecompileReaction() {
  if (reactionSetup) return;
  reactionSetup = true;

  // Initialize tracking state from current store
  lastBlockParamsHash = hashBlockParams(store!.patch.blocks);
  lastBlockCount = store!.patch.blocks.size;
  lastEdgeCount = store!.patch.edges.length;

  // Watch for block AND edge changes (additions, removals, param changes)
  reactionDisposer = reaction(
    () => {
      // Track structure (blocks + edges) and params
      const blocks = store!.patch.blocks;
      const edgeCount = store!.patch.edges.length;
      const hash = hashBlockParams(blocks);
      return { blockCount: blocks.size, edgeCount, hash };
    },
    ({ blockCount, edgeCount, hash }) => {
      // Skip if nothing meaningful changed
      if (hash === lastBlockParamsHash && blockCount === lastBlockCount && edgeCount === lastEdgeCount) {
        return;
      }
      lastBlockParamsHash = hash;
      lastBlockCount = blockCount;
      lastEdgeCount = edgeCount;      scheduleRecompile();
    },
    {
      fireImmediately: false,
      // Use structural comparison for the tracked values
      equals: (a, b) => a.blockCount === b.blockCount && a.edgeCount === b.edgeCount && a.hash === b.hash,
    }
  );}

/**
 * Cleanup function for testing/hot reload.
 * Disposes the live recompile reaction.
 */
export function cleanupReaction() {
  reactionDisposer?.();
  reactionDisposer = null;
  reactionSetup = false;
}


// =============================================================================
// Animation Loop
// =============================================================================

let frameCount = 0;
let lastFpsUpdate = performance.now();
let lastElementCountLog: number | null = null;
let fps = 0;
let execTime = 0;
let renderTime = 0;
let minFrameTime = Infinity;
let maxFrameTime = 0;
let frameTimeSum = 0;

// Batched continuity store updates (5Hz - Sprint 3)
let lastContinuityStoreUpdate = 0;
const CONTINUITY_STORE_UPDATE_INTERVAL = 200; // 5Hz

function animate(tMs: number) {
  if (!currentProgram || !currentState || !ctx || !canvas || !pool) {
    requestAnimationFrame(animate);
    return;
  }

  try {
    // Record frame delta FIRST (using rAF timestamp for precision)
    recordFrameDelta(currentState, tMs);

    const frameStart = performance.now();

    // Execute frame (camera resolved from program.renderGlobals)
    const execStart = performance.now();
    const frame = executeFrame(currentProgram, currentState, pool, tMs);
    execTime = performance.now() - execStart;

    // Render to canvas with zoom/pan transform from store
    const renderStart = performance.now();
    const { zoom, pan } = store!.viewport;

    // Clear in device space (identity transform) to avoid ghosting/trails
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply camera transform and draw scene
    ctx.save();
    ctx.translate(canvas.width / 2 + pan.x * zoom, canvas.height / 2 + pan.y * zoom);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    renderFrame(ctx, frame, canvas.width, canvas.height, /* skipClear */ true);
    ctx.restore();
    renderTime = performance.now() - renderStart;

    // Release all buffers back to pool for reuse next frame
    pool.releaseAll();

    // Calculate frame time
    const frameTime = performance.now() - frameStart;

    // Record health metrics (Sprint 2)
    recordFrameTime(currentState, frameTime);

    // Emit health snapshot if throttle interval elapsed (Sprint 2)
    if (shouldEmitSnapshot(currentState)) {
      // Compute frame timing stats before emitting
      const timingStats = computeFrameTimingStats(currentState);

      // Update diagnostics store with timing stats
      store!.diagnostics.updateFrameTiming(timingStats);

      emitHealthSnapshot(
        currentState,
        store!.events,
        'patch-0',
        store!.getPatchRevision(),
        tMs
      );

      // Reset timing stats for next window
      resetFrameTimingStats(currentState);
    }

    // Update continuity store (batched at 5Hz - Sprint 3)
    if (tMs - lastContinuityStoreUpdate >= CONTINUITY_STORE_UPDATE_INTERVAL) {
      store!.continuity.updateFromRuntime(currentState.continuity, tMs);
      lastContinuityStoreUpdate = tMs;
    }

    // Track min/max
    minFrameTime = Math.min(minFrameTime, frameTime);
    maxFrameTime = Math.max(maxFrameTime, frameTime);
    frameTimeSum += frameTime;

    // Update FPS and performance metrics
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate > 500) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));

      // Calculate total elements being rendered
      const totalElements = frame.ops.reduce((sum: number, op) => sum + op.instances.count, 0);
      const statsText = `FPS: ${fps} | Elements: ${totalElements} | ${execTime.toFixed(1)}/${renderTime.toFixed(1)}ms`;

      // Update stats via global callback set by App component
      if (window.__setStats) {
        window.__setStats(statsText);
      }


      frameCount = 0;
      lastFpsUpdate = now;
      minFrameTime = Infinity;
      maxFrameTime = 0;
      frameTimeSum = 0;
    }

    requestAnimationFrame(animate);
  } catch (err) {
    log(`Runtime error: ${err}`, 'error');
    console.error(err);
  }
}

// =============================================================================
// Patch Switcher
// =============================================================================

async function switchPatch(index: number) {
  if (index < 0 || index >= patches.length) return;
  currentPatchIndex = index;
  window.__oscilla_currentPreset = String(index);  build(patches[index].builder);
  await compileAndSwap(true);
  savePatchToStorage(store!.patch.patch, currentPatchIndex);
}

function exposePresetsToUI() {
  // Expose preset data and switch function to React UI via window
  window.__oscilla_presets = patches.map((p, i) => ({ label: p.name, value: String(i) }));
  window.__oscilla_currentPreset = String(currentPatchIndex);
  window.__oscilla_defaultPreset = String(DEFAULT_PATCH_INDEX);
  window.__oscilla_switchPreset = (index: string) => switchPatch(Number(index));
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Called when React's StoreProvider has mounted and store is available.
 * This is where we initialize the runtime that depends on the store.
 */
async function initializeRuntime(rootStore: RootStore) {
  // Set the module-level store reference
  store = rootStore;

  // Initialize buffer pool
  pool = new BufferPool();

  // Try to restore from localStorage, otherwise use default preset
  const saved = loadPatchFromStorage();
  if (saved) {    currentPatchIndex = saved.presetIndex;
    store.patch.loadPatch(saved.patch);
    await compileAndSwap(true);
  } else {
    // Use settings-configured default patch index (falls back to DEFAULT_PATCH_INDEX)
    const { appSettings } = await import('./settings/tokens/app-settings');
    store.settings.register(appSettings);
    const appValues = store.settings.get(appSettings);
    const settingsIndex = appValues.defaultPatchIndex;
    if (settingsIndex >= 0 && settingsIndex < patches.length) {
      currentPatchIndex = settingsIndex;
    }
    build(patches[currentPatchIndex].builder);
    await compileAndSwap(true);
  }

  // Expose presets to React toolbar UI
  exposePresetsToUI();

  // Auto-persist patch to localStorage on changes (debounced by MobX)
  reaction(
    () => store!.patch.patch,
    (patch) => savePatchToStorage(patch, currentPatchIndex),
    { delay: 500 }
  );

  // Set up live recompile reaction (Continuity-UI Sprint 1)
  setupLiveRecompileReaction();

  // Subscribe to CompileEnd events for compilation statistics
  store.events.on('CompileEnd', (event) => {
    if (event.status === 'success') {
      store!.diagnostics.recordCompilation(event.durationMs);
    }
  });

  // Start animation loop
  requestAnimationFrame(animate);
}

async function main() {
  try {
    // Get app container
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
      throw new Error('App container not found');
    }

    // Create React root and render App wrapped in StoreProvider
    // StoreProvider creates and owns the store; App exposes it via onStoreReady callback
    const root = createRoot(appContainer);
    root.render(
      React.createElement(
        StoreProvider,
        null, // No store prop - StoreProvider creates its own
        React.createElement(App, {
          onCanvasReady: (canvasEl: HTMLCanvasElement) => {
            canvas = canvasEl;
            ctx = canvas.getContext('2d');          },
          onStoreReady: (rootStore: RootStore) => {
            // Initialize runtime once store is available
            initializeRuntime(rootStore).catch((err) => {
              console.error('Failed to initialize runtime:', err);
              console.error('Runtime error message:', err?.message);
              console.error('Runtime error stack:', err?.stack);
            });
          },
        })
      )
    );

  } catch (err) {
    console.error('Failed to initialize application:', err);
  }
}

// Run main
main();
