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
// Build and Compile
// =============================================================================

async function buildAndCompile(particleCount: number) {
  log(`Building patch with ${particleCount} particles...`);

  const patch = buildPatch((b) => {
    // Time source - 16 second cycle (slower animation)
    const time = b.addBlock('InfiniteTimeRoot',
      { periodAMs: 16000, periodBMs: 32000 },
      { role: timeRootRole() }
    );

    // Domain: variable particle count
    const domain = b.addBlock('DomainN', { n: particleCount, seed: 42 });

    // Per-element ID (normalized 0..1)
    const id01 = b.addBlock('FieldFromDomainId', {});

    // Fixed center
    const centerX = b.addBlock('ConstFloat', { value: 0.5 });
    const centerY = b.addBlock('ConstFloat', { value: 0.5 });

    // Per-element pulsing radius using FieldPulse
    const radiusBase = b.addBlock('ConstFloat', { value: 0.35 });
    const radiusAmplitude = b.addBlock('ConstFloat', { value: 0.08 });
    const radiusSpread = b.addBlock('ConstFloat', { value: 3.0 });
    const radiusPulse = b.addBlock('FieldPulse', {});

    // Spin: 2 full rotations per cycle
    const spin = b.addBlock('ConstFloat', { value: 2.0 });

    // Golden angle spread for nice particle distribution
    const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });

    // Angular offset from phase
    const angularOffset = b.addBlock('FieldAngularOffset', {});

    // Add base angle + offset for total angle
    const totalAngle = b.addBlock('FieldAdd', {});

    // Square root distribution for even area coverage
    const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});

    // Polar to cartesian conversion
    const pos = b.addBlock('FieldPolarToCartesian', {});

    // Per-element jitter for organic feel
    const jitterX = b.addBlock('ConstFloat', { value: 0.012 });
    const jitterY = b.addBlock('ConstFloat', { value: 0.012 });
    const jitter = b.addBlock('FieldJitter2D', {});

    // Color parameters
    const sat = b.addBlock('ConstFloat', { value: 0.85 });
    const val = b.addBlock('ConstFloat', { value: 0.9 });

    // Rainbow color from composable primitives
    const hue = b.addBlock('FieldHueFromPhase', {});
    const color = b.addBlock('HsvToRgb', {});

    // Size with pulsing animation
    const sizeBase = b.addBlock('ConstFloat', { value: 3 });
    const sizeAmplitude = b.addBlock('ConstFloat', { value: 2 });
    const sizeSpread = b.addBlock('ConstFloat', { value: 1.0 });
    const sizePulse = b.addBlock('FieldPulse', {});

    // Render sink
    const render = b.addBlock('RenderInstances2D', {});

    // Wire domain
    b.wire(domain, 'domain', id01, 'domain');
    b.wire(domain, 'domain', render, 'domain');

    // Wire time/phase
    b.wire(time, 'phaseA', radiusPulse, 'phase');
    b.wire(time, 'phaseA', angularOffset, 'phase');
    b.wire(time, 'phaseA', hue, 'phase');

    // Wire per-element pulsing radius
    b.wire(id01, 'id01', radiusPulse, 'id01');
    b.wire(radiusBase, 'out', radiusPulse, 'base');
    b.wire(radiusAmplitude, 'out', radiusPulse, 'amplitude');
    b.wire(radiusSpread, 'out', radiusPulse, 'spread');

    // Wire id01
    b.wire(id01, 'id01', goldenAngle, 'id01');
    b.wire(id01, 'id01', angularOffset, 'id01');
    b.wire(id01, 'id01', hue, 'id01');
    b.wire(id01, 'id01', effectiveRadius, 'id01');

    // Wire spin to angular offset
    b.wire(spin, 'out', angularOffset, 'spin');

    // Wire golden angle + offset to total angle
    b.wire(goldenAngle, 'angle', totalAngle, 'a');
    b.wire(angularOffset, 'offset', totalAngle, 'b');

    // Wire position parameters
    b.wire(centerX, 'out', pos, 'centerX');
    b.wire(centerY, 'out', pos, 'centerY');
    b.wire(radiusPulse, 'value', effectiveRadius, 'radius');
    b.wire(totalAngle, 'out', pos, 'angle');
    b.wire(effectiveRadius, 'radius', pos, 'radius');

    // Wire jitter
    b.wire(pos, 'pos', jitter, 'pos');
    b.wire(domain, 'rand', jitter, 'rand');
    b.wire(jitterX, 'out', jitter, 'amountX');
    b.wire(jitterY, 'out', jitter, 'amountY');

    // Wire hue and color parameters
    b.wire(hue, 'hue', color, 'hue');
    b.wire(sat, 'out', color, 'sat');
    b.wire(val, 'out', color, 'val');

    // Wire size pulse
    b.wire(time, 'phaseA', sizePulse, 'phase');
    b.wire(id01, 'id01', sizePulse, 'id01');
    b.wire(sizeBase, 'out', sizePulse, 'base');
    b.wire(sizeAmplitude, 'out', sizePulse, 'amplitude');
    b.wire(sizeSpread, 'out', sizePulse, 'spread');

    // Wire to render
    b.wire(jitter, 'pos', render, 'pos');
    b.wire(color, 'color', render, 'color');
    b.wire(sizePulse, 'value', render, 'size');
  });

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

    // Build and compile with initial particle count
    await buildAndCompile(5000);

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
