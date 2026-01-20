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
import { rootStore } from './stores';
import { buildPatch } from './graph';
import { compile } from './compiler';
import { createRuntimeState, BufferPool, executeFrame } from './runtime';
import { renderFrame } from './render';
import { App } from './ui/components';
import { timeRootRole, type BlockId } from './types';
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
  // Log to diagnostics store (id and timestamp added by store)
  rootStore.diagnostics.log({
    level,
    message: msg,
  });
}

// =============================================================================
// Patch Builders
// =============================================================================

type PatchBuilder = (b: any) => void;

// Original patch - using three-stage architecture: Circle → Array → GridLayout
// Explicit wiring for all inputs (adapter pass not implemented yet)
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

  // FieldAngularOffset with explicit spin value (default is 1.0, we want 2.0)
  const spinConst = b.addBlock('Const', { value: 2.0 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});

  const totalAngle = b.addBlock('FieldAdd', {});

  // FieldRadiusSqrt needs FIELD input - explicit Const → FieldBroadcast → radius
  const radiusConst = b.addBlock('Const', { value: 0.35, payloadType: 'float' });
  const radiusBroadcast = b.addBlock('FieldBroadcast', { payloadType: 'float' });
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});

  // FieldPolarToCartesian - centerX/centerY already have 0.5 defaults in registry (signals, not fields)
  const pos = b.addBlock('FieldPolarToCartesian', {});

  const hue = b.addBlock('FieldHueFromPhase', {});

  // HsvToRgb - sat/val are SIGNAL inputs, Const works directly
  const satConst = b.addBlock('Const', { value: 0.85, payloadType: 'float' });
  const valConst = b.addBlock('Const', { value: 0.9, payloadType: 'float' });
  const color = b.addBlock('HsvToRgb', {});

  // RenderInstances2D.size needs FIELD input - explicit Const → FieldBroadcast → size
  const sizeConst = b.addBlock('Const', { value: 3, payloadType: 'float' });
  const sizeBroadcast = b.addBlock('FieldBroadcast', { payloadType: 'float' });
  const render = b.addBlock('RenderInstances2D', {});

  // Wire phase to position and color (phaseA has rail default in registry)
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire explicit spin value
  b.wire(spinConst, 'out', angularOffset, 'spin');

  // Wire Array 't' output (normalized index 0-1) to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire radius: Const → FieldBroadcast → FieldRadiusSqrt
  b.wire(radiusConst, 'out', radiusBroadcast, 'signal');
  b.wire(radiusBroadcast, 'field', effectiveRadius, 'radius');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire angle to polar to cartesian
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue to color, plus explicit sat/val
  b.wire(hue, 'hue', color, 'hue');
  b.wire(satConst, 'out', color, 'sat');
  b.wire(valConst, 'out', color, 'val');

  // Wire size: Const → FieldBroadcast → RenderInstances2D
  b.wire(sizeConst, 'out', sizeBroadcast, 'signal');
  b.wire(sizeBroadcast, 'field', render, 'size');

  // Wire pos, color to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
};

// Domain Change Test patch - SLOW ROTATING spiral for testing continuity
// Instructions:
// 1. Let the spiral rotate slowly for ~5 seconds - memorize the shape
// 2. Select the Array block and change count from 50 → 60
// 3. Watch the spiral for ~5 seconds - does it maintain its shape while rotating?
// 4. Change count back from 60 → 50
// 5. Watch the spiral - does it still look like the original spiral from step 1?
//
// Expected: Spiral maintains perfect golden angle distribution throughout
// Bug: Elements drift from their correct spiral positions (gaps/clumps appear)
const patchDomainTest: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 8000, periodBMs: 8000 }, // 8 second rotation - slow enough to observe
    { role: timeRootRole() }
  );

  // Simple 3-stage: Circle → Array
  const circle = b.addBlock('Circle', { radius: 0.02 });
  const array = b.addBlock('Array', { count: 50 }); // Start with 50

  b.wire(circle, 'circle', array, 'element');

  // Golden angle spiral - very distinctive, easy to spot distortion
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 8 });

  // SLOW rotation via angular offset
  const spinConst = b.addBlock('Const', { value: 1.0, payloadType: 'float' });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});

  // Radius: sqrt distribution
  const radiusConst = b.addBlock('Const', { value: 0.35, payloadType: 'float' });
  const radiusBroadcast = b.addBlock('FieldBroadcast', { payloadType: 'float' });
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});

  // Position from polar coordinates
  const pos = b.addBlock('FieldPolarToCartesian', {});

  // Color based on index - makes individual elements trackable
  const hue = b.addBlock('FieldHueFromPhase', {});
  const satConst = b.addBlock('Const', { value: 1.0, payloadType: 'float' });
  const valConst = b.addBlock('Const', { value: 1.0, payloadType: 'float' });
  const color = b.addBlock('HsvToRgb', {});

  // Large particles for visibility
  const sizeConst = b.addBlock('Const', { value: 10, payloadType: 'float' });
  const sizeBroadcast = b.addBlock('FieldBroadcast', { payloadType: 'float' });
  const render = b.addBlock('RenderInstances2D', {});

  // Wire phase to angular offset and hue
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire spin
  b.wire(spinConst, 'out', angularOffset, 'spin');

  // Wire Array 't' to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire radius
  b.wire(radiusConst, 'out', radiusBroadcast, 'signal');
  b.wire(radiusBroadcast, 'field', effectiveRadius, 'radius');

  // Wire angles
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire to position
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire color
  b.wire(hue, 'hue', color, 'hue');
  b.wire(satConst, 'out', color, 'sat');
  b.wire(valConst, 'out', color, 'val');

  // Wire size
  b.wire(sizeConst, 'out', sizeBroadcast, 'signal');
  b.wire(sizeBroadcast, 'field', render, 'size');

  // Wire to render
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
  const circle = b.addBlock('Circle', { radius: 10 });
  const array = b.addBlock('Array', { count: 5000 });
  const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });

  b.wire(circle, 'circle', array, 'element');
  b.wire(array, 'elements', layout, 'elements');

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });

  // FieldAngularOffset with explicit spin value (default is 1.0, we want 3.0)
  const spinConst = b.addBlock('Const', { value: 3.0 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});

  const totalAngle = b.addBlock('FieldAdd', {});

  // Use registry defaults
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const render = b.addBlock('RenderInstances2D', {});

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire explicit spin value
  b.wire(spinConst, 'out', angularOffset, 'spin');

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

  // Use registry defaults
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const render = b.addBlock('RenderInstances2D', {});

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
  { name: 'Domain Test', builder: patchDomainTest },
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

  // Debug: Show Const blocks and their values
  for (const [id, block] of patch.blocks) {
    if (block.type === 'Const' || block.type === 'FieldBroadcast' || block.type === 'FieldRadiusSqrt') {
      log(`  ${block.type} ${id}: params=${JSON.stringify(block.params)}`);
    }
  }

  // Debug: Show edges involving radius blocks
  log(`  Edges involving radius, broadcast, or FieldRadiusSqrt:`);
  for (const edge of patch.edges) {
    const fromBlock = patch.blocks.get(edge.from.blockId as BlockId);
    const toBlock = patch.blocks.get(edge.to.blockId as BlockId);
    if (fromBlock?.type === 'Const' || fromBlock?.type === 'FieldBroadcast' ||
        toBlock?.type === 'FieldRadiusSqrt' || toBlock?.type === 'FieldBroadcast') {
      log(`    ${edge.from.blockId}:${edge.from.slotId} -> ${edge.to.blockId}:${edge.to.slotId}`);
    }
  }

  // Load patch into store
  rootStore.patch.loadPatch(patch);

  // Compile with event emission for diagnostics
  const result = compile(patch, {
    events: rootStore.events,
    patchRevision: rootStore.getPatchRevision(),
    patchId: 'patch-0',
  });

  if (result.kind !== 'ok') {
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

  // Set RuntimeState reference in ContinuityStore for config access
  rootStore.continuity.setRuntimeStateRef(currentState);

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

    // Set RuntimeState reference in ContinuityStore for config access
    rootStore.continuity.setRuntimeStateRef(currentState);
  }

  // Update program
  currentProgram = program;

  // Extract instance counts for diagnostic logging
  const schedule = program.schedule as unknown as { instances?: ReadonlyMap<string, { count: number }> };
  const instanceCounts = new Map<string, number>();
  if (schedule?.instances) {
    for (const [id, decl] of schedule.instances) {
      instanceCounts.set(id, decl.count);
    }
  }

  // Emit ProgramSwapped event with instance counts
  rootStore.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: rootStore.getPatchRevision(),
    compileId: `compile-live-${Date.now()}`,
    swapMode: 'soft', // Continuity-preserving swap
    instanceCounts,
  });

  // Log recompile with instance counts
  const instanceInfo = [...instanceCounts.entries()]
    .map(([id, count]) => `${id}=${count}`)
    .join(', ');
  log(`Recompiled: ${program.signalExprs.nodes.length} signals, ${program.fieldExprs.nodes.length} fields, instances: [${instanceInfo}]`);
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

      // Calculate total elements being rendered
      const totalElements = frame.passes.reduce((sum, pass) => sum + pass.count, 0);
      const statsText = `FPS: ${fps} | Elements: ${totalElements} | ${execTime.toFixed(1)}/${renderTime.toFixed(1)}ms`;

      // Update stats via global callback set by App component
      if ((window as any).__setStats) {
        (window as any).__setStats(statsText);
      }

      // Log element count to diagnostics (every 2 seconds)
      if (now - (lastElementCountLog ?? 0) > 2000) {
        log(`Rendering ${totalElements} elements across ${frame.passes.length} pass(es)`);

        // Debug: Show first pass details
        if (frame.passes.length > 0) {
          const pass = frame.passes[0];
          const pos = pass.position as Float32Array;
          const sizeVal = typeof pass.size === 'number' ? pass.size : (pass.size as Float32Array);
          const sizeStr = typeof pass.size === 'number' ? `uniform=${pass.size}` : `arr[0]=${(sizeVal as Float32Array)[0]?.toFixed(3)}`;
          log(`  Pass 0: count=${pass.count}, size=${sizeStr}`);

          // Check position range (sample first 1000)
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          const sampleSize = Math.min(pass.count, 1000);
          for (let i = 0; i < sampleSize; i++) {
            const x = pos[i * 2];
            const y = pos[i * 2 + 1];
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
          log(`  Position range (${sampleSize} samples): X=[${minX.toFixed(3)}, ${maxX.toFixed(3)}], Y=[${minY.toFixed(3)}, ${maxY.toFixed(3)}]`);

          // Sample some actual positions
          log(`  Sample positions: [0]=(${pos[0]?.toFixed(4)}, ${pos[1]?.toFixed(4)}), [100]=(${pos[200]?.toFixed(4)}, ${pos[201]?.toFixed(4)}), [500]=(${pos[1000]?.toFixed(4)}, ${pos[1001]?.toFixed(4)})`);
        }

        lastElementCountLog = now;
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

    // Subscribe to CompileEnd events for compilation statistics
    rootStore.events.on('CompileEnd', (event) => {
      if (event.status === 'success') {
        rootStore.diagnostics.recordCompilation(event.durationMs);
      }
    });

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
