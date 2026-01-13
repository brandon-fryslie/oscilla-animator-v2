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

// Original patch - constants only
const patchOriginal: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 799, periodBMs: 32000 },
    { role: timeRootRole() }
  );
  const domain = b.addBlock('DomainN', { n: 5000, seed: 42 });
  const id01 = b.addBlock('FieldFromDomainId', {});
  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusBase = b.addBlock('Const', { value: 0.35 });
  const radiusAmplitude = b.addBlock('Const', { value: 0.08 });
  const radiusSpread = b.addBlock('Const', { value: 3.0 });
  const radiusPulse = b.addBlock('FieldPulse', {});
  const spin = b.addBlock('Const', { value: 2.0 });
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const jitterX = b.addBlock('Const', { value: 0.012 });
  const jitterY = b.addBlock('Const', { value: 0.012 });
  const jitter = b.addBlock('FieldJitter2D', {});
  const sat = b.addBlock('Const', { value: 0.85 });
  const val = b.addBlock('Const', { value: 0.9 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});
  const sizeBase = b.addBlock('Const', { value: 3 });
  const sizeAmplitude = b.addBlock('Const', { value: 2 });
  const sizeSpread = b.addBlock('Const', { value: 1.0 });
  const sizePulse = b.addBlock('FieldPulse', {});
  const render = b.addBlock('RenderInstances2D', {});

  b.wire(domain, 'domain', id01, 'domain');
  b.wire(domain, 'domain', render, 'domain');
  b.wire(time, 'phaseA', radiusPulse, 'phase');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(id01, 'id01', radiusPulse, 'id01');
  b.wire(radiusBase, 'out', radiusPulse, 'base');
  b.wire(radiusAmplitude, 'out', radiusPulse, 'amplitude');
  b.wire(radiusSpread, 'out', radiusPulse, 'spread');
  b.wire(id01, 'id01', goldenAngle, 'id01');
  b.wire(id01, 'id01', angularOffset, 'id01');
  b.wire(id01, 'id01', hue, 'id01');
  b.wire(id01, 'id01', effectiveRadius, 'id01');
  b.wire(spin, 'out', angularOffset, 'spin');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusPulse, 'value', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'radius', pos, 'radius');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(domain, 'rand', jitter, 'rand');
  b.wire(jitterX, 'out', jitter, 'amountX');
  b.wire(jitterY, 'out', jitter, 'amountY');
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');
  b.wire(time, 'phaseA', sizePulse, 'phase');
  b.wire(id01, 'id01', sizePulse, 'id01');
  b.wire(sizeBase, 'out', sizePulse, 'base');
  b.wire(sizeAmplitude, 'out', sizePulse, 'amplitude');
  b.wire(sizeSpread, 'out', sizePulse, 'spread');
  b.wire(jitter, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(sizePulse, 'value', render, 'size');
};

// Breathing patch - oscillating radius
const patchBreathing: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 2000, periodBMs: 8000 },
    { role: timeRootRole() }
  );
  const domain = b.addBlock('DomainN', { n: 5000, seed: 42 });
  const id01 = b.addBlock('FieldFromDomainId', {});
  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });

  // Oscillating radius base - breathes in and out
  const radiusOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 0.15, offset: 0.3 });
  const radiusAmplitude = b.addBlock('Const', { value: 0.05 });
  const radiusSpread = b.addBlock('Const', { value: 2.0 });
  const radiusPulse = b.addBlock('FieldPulse', {});

  // Oscillating spin - speeds up and slows down
  const spinOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 1.5, offset: 1.0 });

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const jitterX = b.addBlock('Const', { value: 0.008 });
  const jitterY = b.addBlock('Const', { value: 0.008 });
  const jitter = b.addBlock('FieldJitter2D', {});
  const sat = b.addBlock('Const', { value: 0.9 });
  const val = b.addBlock('Const', { value: 0.95 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});

  // Oscillating size
  const sizeOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 2, offset: 4 });
  const sizeAmplitude = b.addBlock('Const', { value: 1.5 });
  const sizeSpread = b.addBlock('Const', { value: 0.5 });
  const sizePulse = b.addBlock('FieldPulse', {});

  const render = b.addBlock('RenderInstances2D', {});

  // Wire oscillators to time
  b.wire(time, 'phaseA', radiusOsc, 'phase');
  b.wire(time, 'phaseB', spinOsc, 'phase');
  b.wire(time, 'phaseB', sizeOsc, 'phase');

  b.wire(domain, 'domain', id01, 'domain');
  b.wire(domain, 'domain', render, 'domain');
  b.wire(time, 'phaseA', radiusPulse, 'phase');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(id01, 'id01', radiusPulse, 'id01');
  b.wire(radiusOsc, 'out', radiusPulse, 'base');
  b.wire(radiusAmplitude, 'out', radiusPulse, 'amplitude');
  b.wire(radiusSpread, 'out', radiusPulse, 'spread');
  b.wire(id01, 'id01', goldenAngle, 'id01');
  b.wire(id01, 'id01', angularOffset, 'id01');
  b.wire(id01, 'id01', hue, 'id01');
  b.wire(id01, 'id01', effectiveRadius, 'id01');
  b.wire(spinOsc, 'out', angularOffset, 'spin');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusPulse, 'value', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'radius', pos, 'radius');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(domain, 'rand', jitter, 'rand');
  b.wire(jitterX, 'out', jitter, 'amountX');
  b.wire(jitterY, 'out', jitter, 'amountY');
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');
  b.wire(time, 'phaseA', sizePulse, 'phase');
  b.wire(id01, 'id01', sizePulse, 'id01');
  b.wire(sizeOsc, 'out', sizePulse, 'base');
  b.wire(sizeAmplitude, 'out', sizePulse, 'amplitude');
  b.wire(sizeSpread, 'out', sizePulse, 'spread');
  b.wire(jitter, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(sizePulse, 'value', render, 'size');
};

// Wobbly patch - triangle wave jitter
const patchWobbly: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 500, periodBMs: 3000 },
    { role: timeRootRole() }
  );
  const domain = b.addBlock('DomainN', { n: 5000, seed: 42 });
  const id01 = b.addBlock('FieldFromDomainId', {});
  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusBase = b.addBlock('Const', { value: 0.35 });
  const radiusAmplitude = b.addBlock('Const', { value: 0.1 });
  const radiusSpread = b.addBlock('Const', { value: 4.0 });
  const radiusPulse = b.addBlock('FieldPulse', {});
  const spin = b.addBlock('Const', { value: 3.0 });
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});

  // Oscillating jitter amounts - triangle wave for snappy motion
  const jitterOscX = b.addBlock('Oscillator', { waveform: 'triangle', amplitude: 0.03, offset: 0.01 });
  const jitterOscY = b.addBlock('Oscillator', { waveform: 'triangle', amplitude: 0.03, offset: 0.01 });
  const jitter = b.addBlock('FieldJitter2D', {});

  // Oscillating saturation
  const satOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 0.3, offset: 0.7 });
  const val = b.addBlock('Const', { value: 0.95 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});

  const sizeBase = b.addBlock('Const', { value: 4 });
  const sizeAmplitude = b.addBlock('Const', { value: 2 });
  const sizeSpread = b.addBlock('Const', { value: 2.0 });
  const sizePulse = b.addBlock('FieldPulse', {});
  const render = b.addBlock('RenderInstances2D', {});

  // Wire oscillators
  b.wire(time, 'phaseA', jitterOscX, 'phase');
  b.wire(time, 'phaseB', jitterOscY, 'phase');
  b.wire(time, 'phaseB', satOsc, 'phase');

  b.wire(domain, 'domain', id01, 'domain');
  b.wire(domain, 'domain', render, 'domain');
  b.wire(time, 'phaseA', radiusPulse, 'phase');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(id01, 'id01', radiusPulse, 'id01');
  b.wire(radiusBase, 'out', radiusPulse, 'base');
  b.wire(radiusAmplitude, 'out', radiusPulse, 'amplitude');
  b.wire(radiusSpread, 'out', radiusPulse, 'spread');
  b.wire(id01, 'id01', goldenAngle, 'id01');
  b.wire(id01, 'id01', angularOffset, 'id01');
  b.wire(id01, 'id01', hue, 'id01');
  b.wire(id01, 'id01', effectiveRadius, 'id01');
  b.wire(spin, 'out', angularOffset, 'spin');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusPulse, 'value', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'radius', pos, 'radius');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(domain, 'rand', jitter, 'rand');
  b.wire(jitterOscX, 'out', jitter, 'amountX');
  b.wire(jitterOscY, 'out', jitter, 'amountY');
  b.wire(hue, 'hue', color, 'hue');
  b.wire(satOsc, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');
  b.wire(time, 'phaseA', sizePulse, 'phase');
  b.wire(id01, 'id01', sizePulse, 'id01');
  b.wire(sizeBase, 'out', sizePulse, 'base');
  b.wire(sizeAmplitude, 'out', sizePulse, 'amplitude');
  b.wire(sizeSpread, 'out', sizePulse, 'spread');
  b.wire(jitter, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(sizePulse, 'value', render, 'size');
};

// Pulsing patch - strong size oscillation with sawtooth
const patchPulsing: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot',
    { periodAMs: 1000, periodBMs: 4000 },
    { role: timeRootRole() }
  );
  const domain = b.addBlock('DomainN', { n: 5000, seed: 42 });
  const id01 = b.addBlock('FieldFromDomainId', {});
  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });

  // Sawtooth radius for sharp expand/contract
  const radiusOsc = b.addBlock('Oscillator', { waveform: 'sawtooth', amplitude: 0.2, offset: 0.25 });
  const radiusAmplitude = b.addBlock('Const', { value: 0.03 });
  const radiusSpread = b.addBlock('Const', { value: 5.0 });
  const radiusPulse = b.addBlock('FieldPulse', {});

  const spin = b.addBlock('Const', { value: 1.0 });
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});
  const jitterX = b.addBlock('Const', { value: 0.005 });
  const jitterY = b.addBlock('Const', { value: 0.005 });
  const jitter = b.addBlock('FieldJitter2D', {});
  const sat = b.addBlock('Const', { value: 0.8 });

  // Square wave brightness for strobe effect
  const valOsc = b.addBlock('Oscillator', { waveform: 'square', amplitude: 0.3, offset: 0.7 });
  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', {});

  // Big pulsing size
  const sizeOsc = b.addBlock('Oscillator', { waveform: 'sin', amplitude: 4, offset: 5 });
  const sizeAmplitude = b.addBlock('Const', { value: 2 });
  const sizeSpread = b.addBlock('Const', { value: 3.0 });
  const sizePulse = b.addBlock('FieldPulse', {});
  const render = b.addBlock('RenderInstances2D', {});

  b.wire(time, 'phaseA', radiusOsc, 'phase');
  b.wire(time, 'phaseA', valOsc, 'phase');
  b.wire(time, 'phaseB', sizeOsc, 'phase');

  b.wire(domain, 'domain', id01, 'domain');
  b.wire(domain, 'domain', render, 'domain');
  b.wire(time, 'phaseA', radiusPulse, 'phase');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(id01, 'id01', radiusPulse, 'id01');
  b.wire(radiusOsc, 'out', radiusPulse, 'base');
  b.wire(radiusAmplitude, 'out', radiusPulse, 'amplitude');
  b.wire(radiusSpread, 'out', radiusPulse, 'spread');
  b.wire(id01, 'id01', goldenAngle, 'id01');
  b.wire(id01, 'id01', angularOffset, 'id01');
  b.wire(id01, 'id01', hue, 'id01');
  b.wire(id01, 'id01', effectiveRadius, 'id01');
  b.wire(spin, 'out', angularOffset, 'spin');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusPulse, 'value', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'radius', pos, 'radius');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(domain, 'rand', jitter, 'rand');
  b.wire(jitterX, 'out', jitter, 'amountX');
  b.wire(jitterY, 'out', jitter, 'amountY');
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(valOsc, 'out', color, 'val');
  b.wire(time, 'phaseA', sizePulse, 'phase');
  b.wire(id01, 'id01', sizePulse, 'id01');
  b.wire(sizeOsc, 'out', sizePulse, 'base');
  b.wire(sizeAmplitude, 'out', sizePulse, 'amplitude');
  b.wire(sizeSpread, 'out', sizePulse, 'spread');
  b.wire(jitter, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(sizePulse, 'value', render, 'size');
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
