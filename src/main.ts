/**
 * Oscilla v2 - Main Application Entry
 *
 * Single React root entry point.
 * Sets up the demo patch and animation loop.
 *
 * Sprint 2: Integrates runtime health monitoring
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { rootStore } from './stores';
import { buildPatch } from './graph';
import { compile } from './compiler';
import { createRuntimeState, BufferPool, executeFrame } from './runtime';
import { renderFrame } from './render';
import { App } from './ui/components';
import { timeRootRole } from './types';
import { recordFrameTime, shouldEmitSnapshot, emitHealthSnapshot } from './runtime/HealthMonitor';

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
// Patch Builders
// =============================================================================

type PatchBuilder = (b: any) => void;

// Original patch - using three-stage architecture: Circle → Array → GridLayout
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

  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusBase = b.addBlock('Const', { value: 0.35 });
  const spin = b.addBlock('Const', { value: 2.0 });
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const sat = b.addBlock('Const', { value: 0.85 });
  const val = b.addBlock('Const', { value: 0.9 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const size = b.addBlock('Const', { value: 3 });
  const render = b.addBlock('RenderInstances2D', {});

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output (normalized index 0-1) to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire spin to angular offset
  b.wire(spin, 'out', angularOffset, 'spin');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire center, radius, angle to polar to cartesian
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusBase, 'out', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue and sat/val to color
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  // Wire pos, color, size to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(size, 'out', render, 'size');
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

  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusBase = b.addBlock('Const', { value: 0.35 });

  // Oscillating spin - speeds up and slows down
  const spinOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 1.5, offset: 1.0 });

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const sat = b.addBlock('Const', { value: 0.9 });
  const val = b.addBlock('Const', { value: 0.95 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const size = b.addBlock('Const', { value: 4 });
  const render = b.addBlock('RenderInstances2D', {});

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

  // Wire center, radius, angle to polar to cartesian
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusBase, 'out', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue and sat/val to color
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  // Wire pos, color, size to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(size, 'out', render, 'size');
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

  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusBase = b.addBlock('Const', { value: 0.35 });
  const spin = b.addBlock('Const', { value: 3.0 });
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const sat = b.addBlock('Const', { value: 0.95 });
  const val = b.addBlock('Const', { value: 0.95 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const size = b.addBlock('Const', { value: 4 });
  const render = b.addBlock('RenderInstances2D', {});

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire spin
  b.wire(spin, 'out', angularOffset, 'spin');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire center, radius, angle to polar to cartesian
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusBase, 'out', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue and sat/val to color
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  // Wire pos, color, size to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(size, 'out', render, 'size');
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

  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusBase = b.addBlock('Const', { value: 0.35 });
  const spin = b.addBlock('Const', { value: 1.0 });
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const sat = b.addBlock('Const', { value: 0.8 });
  const val = b.addBlock('Const', { value: 0.9 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const size = b.addBlock('Const', { value: 5 });
  const render = b.addBlock('RenderInstances2D', {});

  // Wire phase to position and color
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');

  // Wire Array 't' output to field blocks
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', hue, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  // Wire spin
  b.wire(spin, 'out', angularOffset, 'spin');

  // Wire golden angle + offset to total angle
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  // Wire center, radius, angle to polar to cartesian
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusBase, 'out', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Wire hue and sat/val to color
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  // Wire pos, color, size to render
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(size, 'out', render, 'size');
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
