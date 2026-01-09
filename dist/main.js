/**
 * Steel Thread - Animated Particles Demo
 *
 * Minimal viable pipeline: time → domain → fields → render
 */
import { buildPatch } from './graph';
import { compile } from './compiler';
import { createRuntimeState, BufferPool, executeFrame } from './runtime';
import { renderFrame } from './render';
// =============================================================================
// Logging
// =============================================================================
const logEl = document.getElementById('log');
const statsEl = document.getElementById('stats');
function log(msg, level = 'info') {
    const line = document.createElement('div');
    line.className = `log-${level}`;
    line.textContent = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    console.log(`[${level}] ${msg}`);
}
// =============================================================================
// Global State
// =============================================================================
let currentProgram = null;
let currentState = null;
// =============================================================================
// Build the Steel Thread Patch
// =============================================================================
function buildAndCompile(particleCount) {
    log(`Building patch with ${particleCount} particles...`);
    const patch = buildPatch((b) => {
        // Time source - 16 second cycle (slower animation)
        const time = b.addBlock('InfiniteTimeRoot', { periodMs: 16000 });
        // Domain: variable particle count
        const domain = b.addBlock('DomainN', { n: particleCount, seed: 42 });
        // Per-element ID (normalized 0..1)
        const id01 = b.addBlock('FieldFromDomainId', {});
        // Fixed center
        const centerX = b.addBlock('ConstFloat', { value: 0.5 });
        const centerY = b.addBlock('ConstFloat', { value: 0.5 });
        // Per-element pulsing radius using FieldPulse
        // Each particle pulses with a staggered phase based on its ID
        const radiusBase = b.addBlock('ConstFloat', { value: 0.35 });
        const radiusAmplitude = b.addBlock('ConstFloat', { value: 0.08 });
        const radiusSpread = b.addBlock('ConstFloat', { value: 3.0 }); // 3 full waves across all particles
        const radiusPulse = b.addBlock('FieldPulse', {});
        // Spin: 2 full rotations per cycle
        const spin = b.addBlock('ConstFloat', { value: 2.0 });
        // Position from composable primitives
        // Golden angle spread for nice particle distribution
        const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
        // Angular offset from phase (inner particles spin faster)
        const angularOffset = b.addBlock('FieldAngularOffset', {});
        // Add base angle + offset for total angle
        const totalAngle = b.addBlock('FieldAdd', {});
        // Square root distribution for even area coverage
        const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
        // Polar to cartesian conversion
        const pos = b.addBlock('FieldPolarToCartesian', {});
        // Per-element jitter for organic feel
        const jitterX = b.addBlock('ConstFloat', { value: 0.012 }); // Small X offset
        const jitterY = b.addBlock('ConstFloat', { value: 0.012 }); // Small Y offset
        const jitter = b.addBlock('FieldJitter2D', {});
        // Color parameters - slightly desaturated for softer look
        const sat = b.addBlock('ConstFloat', { value: 0.85 });
        const val = b.addBlock('ConstFloat', { value: 0.9 });
        // Rainbow color from composable primitives
        const hue = b.addBlock('FieldHueFromPhase', {});
        const color = b.addBlock('HsvToRgb', {});
        // Size with pulsing animation - each particle grows/shrinks over time
        const sizeBase = b.addBlock('ConstFloat', { value: 3 });
        const sizeAmplitude = b.addBlock('ConstFloat', { value: 2 }); // How much to pulse (±2px)
        const sizeSpread = b.addBlock('ConstFloat', { value: 1.0 }); // Phase spread across particles
        const sizePulse = b.addBlock('FieldPulse', {});
        // Render sink
        const render = b.addBlock('RenderInstances2D', {});
        // Wire domain
        b.wire(domain, 'domain', id01, 'domain');
        b.wire(domain, 'domain', render, 'domain');
        // Wire time/phase
        b.wire(time, 'phase', radiusPulse, 'phase');
        b.wire(time, 'phase', angularOffset, 'phase');
        b.wire(time, 'phase', hue, 'phase');
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
        // Wire position parameters - FIXED center
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
        // Wire size pulse: each particle pulses smoothly over time
        b.wire(time, 'phase', sizePulse, 'phase');
        b.wire(id01, 'id01', sizePulse, 'id01');
        b.wire(sizeBase, 'out', sizePulse, 'base');
        b.wire(sizeAmplitude, 'out', sizePulse, 'amplitude');
        b.wire(sizeSpread, 'out', sizePulse, 'spread');
        // Wire to render with pulsing per-particle size
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
    log(`Compiled: ${program.signals.size} signals, ${program.fields.size} fields, ${program.steps.length} steps`);
    // Update global state
    currentProgram = program;
    currentState = createRuntimeState(program.slotCount);
}
// =============================================================================
// Runtime Setup
// =============================================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const pool = new BufferPool();
// Initial build with 5000 particles
buildAndCompile(5000);
log('Runtime initialized');
// =============================================================================
// Animation Loop
// =============================================================================
let frameCount = 0;
let lastFpsUpdate = performance.now();
let fps = 0;
let frameTime = 0;
let lastFrameTime = 0;
let totalFrameTime = 0;
let execTime = 0;
let renderTime = 0;
let minFrameTime = Infinity;
let maxFrameTime = 0;
let frameTimeSum = 0;
function animate(tMs) {
    try {
        const frameStart = performance.now();
        // Execute frame
        const execStart = performance.now();
        const frame = executeFrame(currentProgram, currentState, pool, tMs);
        execTime = performance.now() - execStart;
        // Render to canvas
        const renderStart = performance.now();
        renderFrame(ctx, frame, canvas.width, canvas.height);
        renderTime = performance.now() - renderStart;
        // Calculate frame time
        totalFrameTime = performance.now() - frameStart;
        frameTime = totalFrameTime;
        // Track min/max for consistency
        minFrameTime = Math.min(minFrameTime, frameTime);
        maxFrameTime = Math.max(maxFrameTime, frameTime);
        frameTimeSum += frameTime;
        // Update FPS and performance metrics
        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate > 500) {
            fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
            // Calculate budget based on actual FPS
            const budget = 1000 / fps;
            const avgFrameTime = frameTimeSum / frameCount;
            const headroom = Math.max(0, Math.round((budget - maxFrameTime) / budget * 100));
            statsEl.textContent = `FPS: ${fps} | ${execTime.toFixed(1)}/${renderTime.toFixed(1)}ms | Min/Max: ${minFrameTime.toFixed(1)}/${maxFrameTime.toFixed(1)}ms`;
            frameCount = 0;
            lastFpsUpdate = now;
            minFrameTime = Infinity;
            maxFrameTime = 0;
            frameTimeSum = 0;
        }
        // Continue animation
        requestAnimationFrame(animate);
    }
    catch (err) {
        log(`Runtime error: ${err}`, 'error');
        console.error(err);
    }
}
// Start animation
log('Starting animation loop...');
requestAnimationFrame(animate);
// =============================================================================
// Slider Control
// =============================================================================
const particleSlider = document.getElementById('particleSlider');
const particleCountEl = document.getElementById('particleCount');
particleSlider.addEventListener('input', (e) => {
    const count = parseInt(e.target.value);
    particleCountEl.textContent = count.toString();
    buildAndCompile(count);
    log(`Particle count changed to ${count}`);
});
