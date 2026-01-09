/**
 * Oscilla v2 - Main Application Entry
 *
 * Sets up the UI layout and initializes the animated particles demo.
 */

import { buildPatch } from './graph';
import { compile } from './compiler';
import { createRuntimeState, BufferPool, executeFrame } from './runtime';
import { renderFrame } from './render';
import { getAppLayout, TabbedContent } from './ui';
import { TableView, BlockInspector, BlockLibrary, DomainsPanel } from './ui/components';
import type { Block } from './graph/Patch';

// =============================================================================
// Global State
// =============================================================================

let currentProgram: any = null;
let currentState: any = null;
let currentPatch: any = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let pool: BufferPool | null = null;
let logEl: HTMLElement | null = null;
let statsEl: HTMLElement | null = null;

// UI component instances
let tableView: TableView | null = null;
let blockInspector: BlockInspector | null = null;
let blockLibrary: BlockLibrary | null = null;
let domainsPanel: DomainsPanel | null = null;

// =============================================================================
// Zoom and Pan State
// =============================================================================

let zoom = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// =============================================================================
// Logging
// =============================================================================

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  if (!logEl) return;
  const line = document.createElement('div');
  line.className = `log-${level}`;
  line.textContent = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[${level}] ${msg}`);
}

// =============================================================================
// Canvas Setup
// =============================================================================

function setupCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = 800;
  canvasEl.height = 600;
  canvasEl.style.borderRadius = '4px';
  canvasEl.style.cursor = 'grab';
  container.appendChild(canvasEl);

  // Mouse wheel zoom
  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));

    const dx = mouseX - canvasEl.width / 2;
    const dy = mouseY - canvasEl.height / 2;
    panX += dx * (1 - zoomFactor) / zoom;
    panY += dy * (1 - zoomFactor) / zoom;

    zoom = newZoom;
  }, { passive: false });

  // Mouse drag pan
  canvasEl.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvasEl.style.cursor = 'grabbing';
  });

  canvasEl.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    panX += dx / zoom;
    panY += dy / zoom;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  canvasEl.addEventListener('mouseup', () => {
    isDragging = false;
    canvasEl.style.cursor = 'grab';
  });

  canvasEl.addEventListener('mouseleave', () => {
    isDragging = false;
    canvasEl.style.cursor = 'grab';
  });

  // Double-click to reset view
  canvasEl.addEventListener('dblclick', () => {
    zoom = 1;
    panX = 0;
    panY = 0;
  });

  return canvasEl;
}

// =============================================================================
// Build and Compile
// =============================================================================

async function buildAndCompile(particleCount: number) {
  log(`Building patch with ${particleCount} particles...`);

  const patch = buildPatch((b) => {
    // Time source - 16 second cycle (slower animation)
    const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 16000, periodBMs: 32000 });

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

  // Compile
  const result = compile(patch);

  if (result.kind !== 'ok') {
    log(`Compile failed: ${JSON.stringify(result.errors)}`, 'error');
    throw new Error('Compile failed');
  }

  const program = result.program;
  log(
    `Compiled: ${program.signalExprs.nodes.length} signals, ${program.fieldExprs.nodes.length} fields, ${program.slotMeta.length} slots`,
  );

  // Update global state
  currentProgram = program;
  currentState = createRuntimeState(program.slotMeta.length);
  currentPatch = patch;

  // Update UI components with new patch
  if (tableView) {
    tableView.setPatch(patch);
  }
  if (blockInspector) {
    blockInspector.setPatch(patch);
  }
  if (domainsPanel) {
    domainsPanel.setPatch(patch);
  }
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

    // Render to canvas with zoom/pan transform
    const renderStart = performance.now();
    ctx.save();
    ctx.translate(canvas.width / 2 + panX * zoom, canvas.height / 2 + panY * zoom);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    renderFrame(ctx, frame, canvas.width, canvas.height);
    ctx.restore();
    renderTime = performance.now() - renderStart;

    // Calculate frame time
    const frameTime = performance.now() - frameStart;

    // Track min/max
    minFrameTime = Math.min(minFrameTime, frameTime);
    maxFrameTime = Math.max(maxFrameTime, frameTime);
    frameTimeSum += frameTime;

    // Update FPS and performance metrics
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate > 500) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      if (statsEl) {
        statsEl.textContent = `FPS: ${fps} | ${execTime.toFixed(1)}/${renderTime.toFixed(1)}ms | Min/Max: ${minFrameTime.toFixed(1)}/${maxFrameTime.toFixed(1)}ms`;
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
// UI Setup
// =============================================================================

async function setupUI() {
  const appLayout = getAppLayout();

  try {
    await appLayout.init();
    log('UI framework initialized');
  } catch (err) {
    console.error('Failed to initialize UI framework:', err);
    // Fall back to simple layout
    setupFallbackUI();
    return;
  }

  // Get stats element
  statsEl = document.getElementById('stats');

  // Setup left sidebar with tabs (Library + Inspector)
  const leftRegion = appLayout.getRegionElement('left');
  new TabbedContent(leftRegion, [
    {
      id: 'library',
      label: 'Library',
      contentFactory: (container) => {
        blockLibrary = new BlockLibrary(container);
      },
    },
    {
      id: 'inspector',
      label: 'Inspector',
      contentFactory: (container) => {
        blockInspector = new BlockInspector(container);
      },
    },
  ], { initialTab: 'inspector' });

  // Setup center panel with Table View and Preview
  const centerRegion = appLayout.getRegionElement('center');
  new TabbedContent(centerRegion, [
    {
      id: 'table',
      label: 'Blocks',
      contentFactory: (container) => {
        tableView = new TableView(container);
      },
    },
    {
      id: 'canvas',
      label: 'Preview',
      contentFactory: (container) => {
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'canvas-container';
        canvas = setupCanvas(canvasWrapper);
        ctx = canvas.getContext('2d')!;
        container.appendChild(canvasWrapper);
      },
    },
  ], { initialTab: 'table' });

  // Setup right sidebar with Domains and Help
  const rightRegion = appLayout.getRegionElement('right');
  new TabbedContent(rightRegion, [
    {
      id: 'domains',
      label: 'Domains',
      contentFactory: (container) => {
        domainsPanel = new DomainsPanel(container);
      },
    },
    {
      id: 'help',
      label: 'Help',
      contentFactory: (container) => {
        container.innerHTML = `
          <div style="padding: 1rem; font-size: 0.875rem; color: #888;">
            <h3 style="color: #4ecdc4; margin-bottom: 0.5rem;">Controls</h3>
            <p><strong>Canvas:</strong></p>
            <ul style="margin-left: 1rem; margin-top: 0.5rem;">
              <li>Scroll to zoom</li>
              <li>Click and drag to pan</li>
              <li>Double-click to reset view</li>
            </ul>
            <p style="margin-top: 1rem;"><strong>Patch:</strong></p>
            <ul style="margin-left: 1rem; margin-top: 0.5rem;">
              <li>Click blocks in table to inspect</li>
              <li>Expand rows to see ports and connections</li>
              <li>Click connections to navigate</li>
            </ul>
          </div>
        `;
      },
    },
  ], { initialTab: 'domains' });

  // Setup bottom log panel
  const bottomRegion = appLayout.getRegionElement('bottom');
  const logContainer = document.createElement('div');
  logContainer.className = 'log-container';
  logEl = logContainer;
  bottomRegion.appendChild(logContainer);

  log('Layout initialized');
}

/**
 * Fallback UI if jsPanel fails to load.
 */
function setupFallbackUI() {
  console.warn('Using fallback UI');

  // Create simple containers
  const centerRegion = document.getElementById('region-center');
  const bottomRegion = document.getElementById('region-bottom');

  if (centerRegion) {
    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'canvas-container';
    canvasWrapper.style.height = '100%';
    canvas = setupCanvas(canvasWrapper);
    ctx = canvas.getContext('2d')!;
    centerRegion.appendChild(canvasWrapper);
  }

  if (bottomRegion) {
    const logContainer = document.createElement('div');
    logContainer.className = 'log-container';
    logEl = logContainer;
    bottomRegion.appendChild(logContainer);
  }

  statsEl = document.getElementById('stats');
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  try {
    // Setup UI first
    await setupUI();

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
    const logContainer = document.getElementById('region-bottom');
    if (logContainer) {
      logContainer.innerHTML = `<div style="padding: 1rem; color: #ff6b6b;">Error: ${err}</div>`;
    }
  }
}

// Run main
main();
