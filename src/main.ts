/**
 * Oscilla v2 - Main Application Entry
 *
 * Single React root entry point.
 * Sets up the demo patch and animation loop.
 *
 * Sprint 2: Integrates runtime health monitoring
 * Updated: Uses inputDefaults instead of separate Const blocks
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { reaction, toJS } from 'mobx';
import { rootStore } from './stores';
import { buildPatch } from './graph';
import { compile } from './compiler';
import { createRuntimeState, BufferPool, executeFrame } from './runtime';
import { renderFrame } from './render';
import { App } from './ui/components';
import { timeRootRole, defaultSourceConstant } from './types';
import { recordFrameTime, shouldEmitSnapshot, emitHealthSnapshot } from './runtime/HealthMonitor';
import type { RuntimeState } from './runtime/RuntimeState';

// =============================================================================
// Global State
// =============================================================================

let currentProgram: any = null;
let currentState: any = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let pool: BufferPool | null = null;

// =============================================================================
// Logging
// =============================================================================

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  console.log(`[${level}] ${msg}`);

  // Log to diagnostics store (id and timestamp added by store)
  rootStore.diagnostics.log({
    level,
    message: msg,
  });
}

// =============================================================================
// Helper: Create constant default
// =============================================================================

const constant = (value: number) => defaultSourceConstant(value);

// =============================================================================
// Patch Builders
// =============================================================================

type PatchBuilder = (b: any) => void;

// Original patch - using three-stage architecture: Circle → Array → GridLayout
// Now uses inputDefaults instead of separate Const blocks for cleaner patches
const patchOriginal: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 799, periodBMs: 32000 },
    { role: timeRootRole() }
  );

  // Three-stage architecture:
  // 1. Circle (primitive) → Signal<float>
  // 2. Array (cardinality) → Field<float>
  // 3. GridLayout (operation) → Field<vec2>
  const circle = b.addBlock('Circle', { radius: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });

  // Wire Circle → Array → GridLayout
  b.wire(circle, 'circle', array, 'element');
  b.wire(array, 'elements', layout, 'elements');

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });

  // FieldAngularOffset with spin override (default is 1.0, we want 2.0)
  const angularOffset = b.addBlock('FieldAngularOffset', {}, {
    inputDefaults: {
      spin: constant(2.0),
    },
  });

  const totalAngle = b.addBlock('FieldAdd', {});

  // FieldRadiusSqrt with radius override (default would come from registry)
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {}, {
    inputDefaults: {
      radius: constant(0.35),
    },
  });

  // FieldPolarToCartesian - centerX/centerY already have 0.5 defaults in registry
  const pos = b.addBlock('FieldPolarToCartesian', {});

  const hue = b.addBlock('FieldHueFromPhase', {});

  // HsvToRgb with sat/val overrides
  const color = b.addBlock('HsvToRgb', {}, {
    inputDefaults: {
      sat: constant(0.85),
      val: constant(0.9),
    },
  });

  // RenderInstances2D with size override
  const render = b.addBlock('RenderInstances2D', {}, {
    inputDefaults: {
      size: constant(3),
    },
  });

  // Wire phase to position and color (phaseA has rail default in registry)
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output (normalized index 0-1) to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire angle to polar to cartesian
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue to color
  b.wire(hue, 'hue', color, 'hue');

  // Wire pos, color to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
};

// Breathing patch - oscillating spin speed
const patchBreathing: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 2000, periodBMs: 8000 },
    { role: timeRootRole() }
  );

  // Three-stage architecture
  const circle = b.addBlock('Circle', { radius: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });

  b.wire(circle, 'circle', array, 'element');
  b.wire(array, 'elements', layout, 'elements');

  // Oscillating spin - speeds up and slows down
  const spinOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 1.5, offset: 1.0 });

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});

  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {}, {
    inputDefaults: {
      radius: constant(0.35),
    },
  });

  const pos = b.addBlock('FieldPolarToCartesian', {});
  const hue = b.addBlock('FieldHueFromPhase', {});

  const color = b.addBlock('HsvToRgb', {}, {
    inputDefaults: {
      sat: constant(0.9),
      val: constant(0.95),
    },
  });

  const render = b.addBlock('RenderInstances2D', {}, {
    inputDefaults: {
      size: constant(4),
    },
  });

  // Wire oscillators to time
  b.wire(time, 'phaseB', spinOsc, 'phase');

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire oscillating spin
  b.wire(spinOsc, 'out', angularOffset, 'spin');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire to polar to cartesian
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue to color
  b.wire(hue, 'hue', color, 'hue');

  // Wire pos, color to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
};

// Wobbly patch - fast spin
const patchWobbly: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 500, periodBMs: 3000 },
    { role: timeRootRole() }
  );

  // Three-stage architecture
  const circle = b.addBlock('Circle', { radius: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });

  b.wire(circle, 'circle', array, 'element');
  b.wire(array, 'elements', layout, 'elements');

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });

  const angularOffset = b.addBlock('FieldAngularOffset', {}, {
    inputDefaults: {
      spin: constant(3.0),
    },
  });

  const totalAngle = b.addBlock('FieldAdd', {});

  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {}, {
    inputDefaults: {
      radius: constant(0.35),
    },
  });

  const pos = b.addBlock('FieldPolarToCartesian', {});
  const hue = b.addBlock('FieldHueFromPhase', {});

  const color = b.addBlock('HsvToRgb', {}, {
    inputDefaults: {
      sat: constant(0.95),
      val: constant(0.95),
    },
  });

  const render = b.addBlock('RenderInstances2D', {}, {
    inputDefaults: {
      size: constant(4),
    },
  });

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire to polar to cartesian
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue to color
  b.wire(hue, 'hue', color, 'hue');

  // Wire pos, color to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
};

// Pulsing patch - slow spin
const patchPulsing: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 1000, periodBMs: 4000 },
    { role: timeRootRole() }
  );

  // Three-stage architecture
  const circle = b.addBlock('Circle', { radius: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });

  b.wire(circle, 'circle', array, 'element');
  b.wire(array, 'elements', layout, 'elements');

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });

  // spin = 1.0 is the registry default, so no override needed
  const angularOffset = b.addBlock('FieldAngularOffset', {});

  const totalAngle = b.addBlock('FieldAdd', {});

  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {}, {
    inputDefaults: {
      radius: constant(0.35),
    },
  });

  const pos = b.addBlock('FieldPolarToCartesian', {});
  const hue = b.addBlock('FieldHueFromPhase', {});

  const color = b.addBlock('HsvToRgb', {}, {
    inputDefaults: {
      sat: constant(0.8),
      val: constant(0.9),
    },
  });

  const render = b.addBlock('RenderInstances2D', {}, {
    inputDefaults: {
      size: constant(5),
    },
  });

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire to polar to cartesian
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue to color
  b.wire(hue, 'hue', color, 'hue');

  // Wire pos, color to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
};

const patches: { name: string; builder: PatchBuilder }[] = [
  { name: 'Original', builder: patchOriginal },
  { name: 'Breathing', builder: patchBreathing },
  { name: 'Wobbly', builder: patchWobbly },
  { name: 'Pulsing', builder: patchPulsing },
];

let currentPatchIndex = 0;

// =============================================================================
// Build and Compile
// =============================================================================

async function buildAndCompile(patchBuilder: PatchBuilder) {
  log(`Building patch...`);

  const patch = buildPatch(patchBuilder);

  log(`Patch built: ${patch.blocks.size} blocks, ${patch.edges.length} edges`);

  // Load patch into store
  rootStore.patch.loadPatch(patch);

  // Compile with event emission for diagnostics
  console.log('[main] Starting compilation with patch revision:', rootStore.getPatchRevision());
  const result = compile(patch, {
    events: rootStore.events,
    patchRevision: rootStore.getPatchRevision(),
    patchId: 'patch-0',
  });

  console.log('[main] Compile result:', result.kind);
  if (result.kind !== 'ok') {
    console.log('[main] Compile errors:', result.errors);
    log(`Compile failed: ${JSON.stringify(result.errors)}`, 'error');
    throw new Error('Compile failed');
  }

  const program = result.program;
  log(
    `Compiled: ${program.signalExprs.nodes.length} signals, ${program.fieldExprs.nodes.length} fields, ${program.slotMeta.length} slots`,
  );

  // Emit ProgramSwapped to update active revision for diagnostics
  rootStore.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: rootStore.getPatchRevision(),
    compileId: 'compile-0',
    swapMode: 'hard',
  });

  // Update global state
  currentProgram = program;
  currentState = createRuntimeState(program.slotMeta.length);

  // Initialize instance counts for domain change tracking (Sprint 2)
  const instances = program.schedule?.instances;
  if (instances) {
    for (const [id, decl] of instances) {
      const count = typeof decl.count === 'number' ? decl.count : 0;
      prevInstanceCounts.set(id, count);
    }
    log(`Initialized domain tracking: ${instances.size} instance(s)`);
  }
}

// =============================================================================
// Live Recompile (Continuity-UI Sprint 1)
// Continuity Logging (Continuity-UI Sprint 2)
// =============================================================================

let recompileTimeout: ReturnType<typeof setTimeout> | null = null;
const RECOMPILE_DEBOUNCE_MS = 150;

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
    log(`[Continuity] Domain change: ${instanceId} ${oldCount}→${newCount} (${deltaStr})`);

    // Log mapping stats (simplified - all existing elements map, delta are new/removed)
    if (delta > 0) {
      log(`[Continuity]   Mapped: ${oldCount}, New: ${delta}`);
    } else if (delta < 0) {
      log(`[Continuity]   Mapped: ${newCount}, Removed: ${-delta}`);
    }

    // Record to ContinuityStore for UI (Sprint 3)
    rootStore.continuity.recordDomainChange(
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
      if (oldCount > 0) {
        log(`[Continuity] Instance removed: ${id} (was ${oldCount} elements)`);
      }
      prevInstanceCounts.delete(id);
    }
  }
}

/**
 * Recompile the current patch from store, preserving continuity state.
 * Called when block params change in the UI.
 */
async function recompileFromStore() {
  const patch = rootStore.patch.patch;
  if (!patch) {
    log('No patch to recompile', 'warn');
    return;
  }

  log('Live recompile triggered...');

  // Compile the patch from store
  const result = compile(patch, {
    events: rootStore.events,
    patchRevision: rootStore.getPatchRevision(),
    patchId: 'patch-0',
  });

  if (result.kind !== 'ok') {
    log(`Recompile failed: ${result.errors.map(e => e.message).join(', ')}`, 'error');
    // Keep running with old program
    return;
  }

  const program = result.program;
  const newSlotCount = program.slotMeta.length;
  const oldSlotCount = currentState?.values.f64.length ?? 0;

  // Detect and log domain changes (Sprint 2)
  detectAndLogDomainChanges(currentProgram, program);

  // Preserve continuity state during hot-swap
  const oldContinuity = currentState?.continuity;

  // Only recreate state if slot count changed
  if (newSlotCount !== oldSlotCount) {
    log(`Slot count changed: ${oldSlotCount} → ${newSlotCount}, resizing buffers`);
    currentState = createRuntimeState(newSlotCount);

    // Restore continuity state (it's independent of slot layout)
    if (oldContinuity) {
      currentState.continuity = oldContinuity;
    }
  }

  // Update program
  currentProgram = program;

  // Emit ProgramSwapped event
  rootStore.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: rootStore.getPatchRevision(),
    compileId: `compile-live-${Date.now()}`,
    swapMode: 'soft', // Continuity-preserving swap
  });

  log(`Recompiled: ${program.signalExprs.nodes.length} signals, ${program.fieldExprs.nodes.length} fields`);
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
      await recompileFromStore();
    } catch (err) {
      log(`Recompile error: ${err}`, 'error');
      console.error(err);
    }
  }, RECOMPILE_DEBOUNCE_MS);
}

/**
 * Create a hash of block params for change detection.
 * We need deep change detection since MobX only tracks shallow changes.
 */
function hashBlockParams(blocks: ReadonlyMap<string, any>): string {
  const parts: string[] = [];
  for (const [id, block] of blocks) {
    parts.push(`${id}:${JSON.stringify(block.params)}`);
  }
  return parts.join('|');
}

// Track initial hash to skip first reaction fire
let lastBlockParamsHash: string | null = null;
let reactionSetup = false;

/**
 * Set up MobX reaction to watch for patch changes.
 */
function setupLiveRecompileReaction() {
  if (reactionSetup) return;
  reactionSetup = true;

  // Initialize hash from current store state
  lastBlockParamsHash = hashBlockParams(rootStore.patch.blocks);

  // Watch for block changes (additions, removals, param changes)
  reaction(
    () => {
      // Track both structure and params
      const blocks = rootStore.patch.blocks;
      const hash = hashBlockParams(blocks);
      return { blockCount: blocks.size, hash };
    },
    ({ blockCount, hash }) => {
      // Skip if hash hasn't changed (no actual param change)
      if (hash === lastBlockParamsHash) {
        return;
      }
      lastBlockParamsHash = hash;

      log(`Block params changed, scheduling recompile...`);
      scheduleRecompile();
    },
    {
      fireImmediately: false,
      // Use structural comparison for the tracked values
      equals: (a, b) => a.blockCount === b.blockCount && a.hash === b.hash,
    }
  );

  log('Live recompile reaction initialized');
}

// =============================================================================
// Animation Loop
// =============================================================================

let frameCount = 0;
let lastFpsUpdate = performance.now();
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
    const frameStart = performance.now();

    // Execute frame
    const execStart = performance.now();
    const frame = executeFrame(currentProgram, currentState, pool, tMs);
    execTime = performance.now() - execStart;

    // Render to canvas with zoom/pan transform from store
    const renderStart = performance.now();
    const { zoom, pan } = rootStore.viewport;
    ctx.save();
    ctx.translate(canvas.width / 2 + pan.x * zoom, canvas.height / 2 + pan.y * zoom);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    renderFrame(ctx, frame, canvas.width, canvas.height);
    ctx.restore();
    renderTime = performance.now() - renderStart;

    // Calculate frame time
    const frameTime = performance.now() - frameStart;

    // Record health metrics (Sprint 2)
    recordFrameTime(currentState, frameTime);

    // Emit health snapshot if throttle interval elapsed (Sprint 2)
    if (shouldEmitSnapshot(currentState)) {
      emitHealthSnapshot(
        currentState,
        rootStore.events,
        'patch-0',
        rootStore.getPatchRevision(),
        tMs
      );
    }

    // Update continuity store (batched at 5Hz - Sprint 3)
    if (tMs - lastContinuityStoreUpdate >= CONTINUITY_STORE_UPDATE_INTERVAL) {
      rootStore.continuity.updateFromRuntime(currentState.continuity, tMs);
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
      const statsText = `FPS: ${fps} | ${execTime.toFixed(1)}/${renderTime.toFixed(1)}ms | Min/Max: ${minFrameTime.toFixed(1)}/${maxFrameTime.toFixed(1)}ms`;

      // Update stats via global callback set by App component
      if ((window as any).__setStats) {
        (window as any).__setStats(statsText);
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
  log(`Switching to patch: ${patches[index].name}`);
  await buildAndCompile(patches[index].builder);
  updateButtonStyles();
}

function updateButtonStyles() {
  const buttons = document.querySelectorAll('.patch-btn');
  buttons.forEach((btn, i) => {
    if (i === currentPatchIndex) {
      (btn as HTMLButtonElement).style.background = '#4a9eff';
      (btn as HTMLButtonElement).style.color = '#fff';
    } else {
      (btn as HTMLButtonElement).style.background = '#333';
      (btn as HTMLButtonElement).style.color = '#ccc';
    }
  });
}

function createPatchSwitcherUI() {
  const container = document.createElement('div');
  container.id = 'patch-switcher';
  container.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 1000;
    display: flex;
    gap: 8px;
    font-family: system-ui, sans-serif;
  `;

  patches.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'patch-btn';
    btn.textContent = p.name;
    btn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    `;
    btn.onclick = () => switchPatch(i);
    container.appendChild(btn);
  });

  document.body.appendChild(container);
  updateButtonStyles();
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  try {
    // Get app container
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
      throw new Error('App container not found');
    }

    // Create React root and render App
    const root = createRoot(appContainer);
    root.render(
      React.createElement(App, {
        onCanvasReady: (canvasEl: HTMLCanvasElement) => {
          canvas = canvasEl;
          ctx = canvas.getContext('2d');
          log('Canvas ready');
        },
      })
    );

    log('React root initialized');

    // Initialize buffer pool
    pool = new BufferPool();

    // Create patch switcher UI
    createPatchSwitcherUI();

    // Build and compile with initial patch
    await buildAndCompile(patches[currentPatchIndex].builder);

    // Set up live recompile reaction (Continuity-UI Sprint 1)
    setupLiveRecompileReaction();

    log('Runtime initialized');

    // Start animation loop
    log('Starting animation loop...');
    requestAnimationFrame(animate);

  } catch (err) {
    console.error('Failed to initialize application:', err);
    log(`Failed to initialize: ${err}`, 'error');
  }
}

// Run main
main();
