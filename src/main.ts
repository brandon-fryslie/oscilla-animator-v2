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
import { timeRootRole, type BlockId, type ValueSlot } from './types';
import { recordFrameTime, recordFrameDelta, shouldEmitSnapshot, emitHealthSnapshot, computeFrameTimingStats, resetFrameTimingStats } from './runtime/HealthMonitor';
import type { RuntimeState } from './runtime/RuntimeState';
import { debugService } from './services/DebugService';
import { mapDebugMappings } from './services/mapDebugEdges';

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

// =============================================================================
// Patch Builders
// =============================================================================

type PatchBuilder = (b: any) => void;

/**
 * Golden Spiral - Main demo patch
 *
 * 5000 ellipses in a golden angle spiral with animated rotation and jitter.
 * Classic phyllotaxis pattern with HSV color mapping.
 */
const patchGoldenSpiral: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,
    periodBMs: 120000,
  }, { role: timeRootRole() });

  const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  b.wire(ellipse, 'shape', array, 'element');

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', { spin: 2.0 });
  const totalAngle = b.addBlock('FieldAdd', {});

  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  const effectiveRadius = b.addBlock('FieldRadiusSqrt', { radius: 0.35 });
  b.wire(array, 't', effectiveRadius, 'id01');

  const pos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  const jitter = b.addBlock('FieldJitter2D', { amountX: 0.015, amountY: 0.015 });
  // Broadcast time (scalar) for jitter seed variation
  const timeBroadcast = b.addBlock('FieldBroadcast', { payloadType: 'float' });
  const jitterRand = b.addBlock('FieldAdd', {});

  b.wire(time, 'tMs', timeBroadcast, 'signal');
  b.wire(timeBroadcast, 'field', jitterRand, 'a');
  b.wire(array, 't', jitterRand, 'b');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(jitterRand, 'out', jitter, 'rand');

  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', { sat: 0.85, val: 0.9 });

  b.wire(array, 't', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(hue, 'hue', color, 'hue');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(jitter, 'out', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};

/**
 * Domain Test - Slow spiral for continuity testing
 *
 * 50 large ellipses for observing element identity during count changes.
 */
const patchDomainTest: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 8000,
    periodBMs: 8000,
  }, { role: timeRootRole() });

  const ellipse = b.addBlock('Ellipse', { rx: 0.025, ry: 0.025 });
  const array = b.addBlock('Array', { count: 50 });
  b.wire(ellipse, 'shape', array, 'element');

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 8 });
  const angularOffset = b.addBlock('FieldAngularOffset', { spin: 1.0 });
  const totalAngle = b.addBlock('FieldAdd', {});

  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  const effectiveRadius = b.addBlock('FieldRadiusSqrt', { radius: 0.35 });
  b.wire(array, 't', effectiveRadius, 'id01');

  const pos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  const hue = b.addBlock('FieldHueFromPhase', {});
  const color = b.addBlock('HsvToRgb', { sat: 1.0, val: 1.0 });

  b.wire(array, 't', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(hue, 'hue', color, 'hue');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};

/**
 * Tile Grid - Rectangle mosaic with wave animation
 *
 * Grid of rectangles with diagonal color gradient and wave motion.
 * Demonstrates Rect primitive with Expression-based positioning.
 */
const patchTileGrid: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 3000,
    periodBMs: 7000,
  }, { role: timeRootRole() });

  // Rectangles - wider than tall for tile effect
  const rect = b.addBlock('Rect', { width: 0.018, height: 0.012 });
  const array = b.addBlock('Array', { count: 400 }); // 20x20 grid
  b.wire(rect, 'shape', array, 'element');

  // Grid layout: arranges elements in a 20x20 grid
  const grid = b.addBlock('GridLayout', { rows: 20, cols: 20 });
  b.wire(array, 'elements', grid, 'elements');

  // Rainbow gradient color from element position + time
  const hue = b.addBlock('FieldHueFromPhase', {});
  b.wire(time, 'phaseB', hue, 'phase');
  b.wire(array, 't', hue, 'id01');

  const sat = b.addBlock('Const', { value: 0.7 });
  const val = b.addBlock('Const', { value: 0.95 });
  const color = b.addBlock('HsvToRgb', {});
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
};

/**
 * Orbital Rings - Concentric ellipse orbits
 *
 * Multiple rings of ellipses orbiting at different speeds.
 * Each ring has different rotation rate and color.
 */
const patchOrbitalRings: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 2000,
    periodBMs: 5000,
  }, { role: timeRootRole() });

  // Elongated ellipses for comet-like appearance
  const ellipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.008 });
  const array = b.addBlock('Array', { count: 300 });
  b.wire(ellipse, 'shape', array, 'element');

  // Golden spiral with fast spin for orbital motion
  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});

  const spin = b.addBlock('Const', { value: 1.5 }); // fast orbiting
  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radiusMax = b.addBlock('Const', { value: 0.4 });

  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(spin, 'out', angularOffset, 'spin');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');
  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radiusMax, 'out', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Color: hue varies by element position + time shift
  const hue = b.addBlock('FieldHueFromPhase', {});
  b.wire(time, 'phaseB', hue, 'phase');
  b.wire(array, 't', hue, 'id01');

  const sat = b.addBlock('Const', { value: 0.9 });
  const val = b.addBlock('Const', { value: 1.0 });
  const color = b.addBlock('HsvToRgb', {});
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};

/**
 * Rect Mosaic - Animated rectangle spiral with jitter and opacity
 *
 * Rectangles in a golden spiral with per-element jitter for organic feel.
 * Animated scale pulsing and opacity fade create depth illusion.
 * Demonstrates Rect topology + scale + opacity through shape2d pipeline.
 */
const patchRectMosaic: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,
    periodBMs: 7000,
  }, { role: timeRootRole() });

  // Rectangle shape
  const rect = b.addBlock('Rect', { width: 0.03, height: 0.015 });
  const array = b.addBlock('Array', { count: 400 });
  b.wire(rect, 'shape', array, 'element');

  // Position: golden spiral with jitter for organic randomness
  const centerX = b.addBlock('Const', { value: 0.5 });
  const centerY = b.addBlock('Const', { value: 0.5 });
  const radius = b.addBlock('Const', { value: 0.45 });
  const spin = b.addBlock('Const', { value: 0.2 });

  const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 80 });
  const angularOffset = b.addBlock('FieldAngularOffset', {});
  const totalAngle = b.addBlock('FieldAdd', {});
  const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});

  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');
  b.wire(spin, 'out', angularOffset, 'spin');

  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  b.wire(centerX, 'out', pos, 'centerX');
  b.wire(centerY, 'out', pos, 'centerY');
  b.wire(radius, 'out', effectiveRadius, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Add jitter for organic per-element randomness
  const jitter = b.addBlock('FieldJitter2D', { amountX: 0.02, amountY: 0.02 });
  const timeBroadcast = b.addBlock('FieldBroadcast', { payloadType: 'float' });
  const jitterRand = b.addBlock('FieldAdd', {});
  b.wire(time, 'tMs', timeBroadcast, 'signal');
  b.wire(timeBroadcast, 'field', jitterRand, 'a');
  b.wire(array, 't', jitterRand, 'b');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(jitterRand, 'out', jitter, 'rand');

  // Color from index + time
  const hue = b.addBlock('FieldHueFromPhase', {});
  b.wire(time, 'phaseB', hue, 'phase');
  b.wire(array, 't', hue, 'id01');

  const color = b.addBlock('HsvToRgb', {});
  const sat = b.addBlock('Const', { value: 0.85 });
  const val = b.addBlock('Const', { value: 0.95 });
  b.wire(hue, 'hue', color, 'hue');
  b.wire(sat, 'out', color, 'sat');
  b.wire(val, 'out', color, 'val');

  // Per-element animated opacity: wave that sweeps across elements
  const opacityPulse = b.addBlock('FieldPulse', {});
  const opacityBase = b.addBlock('Const', { value: 0.4 });
  const opacityAmp = b.addBlock('Const', { value: 0.6 });
  const opacitySpread = b.addBlock('Const', { value: 2.0 });
  b.wire(array, 't', opacityPulse, 'id01');
  b.wire(time, 'phaseB', opacityPulse, 'phase');
  b.wire(opacityBase, 'out', opacityPulse, 'base');
  b.wire(opacityAmp, 'out', opacityPulse, 'amplitude');
  b.wire(opacitySpread, 'out', opacityPulse, 'spread');

  const opacity = b.addBlock('ApplyOpacity', {});
  b.wire(color, 'color', opacity, 'color');
  b.wire(opacityPulse, 'value', opacity, 'opacity');

  // Animated scale: pulsing
  const scaleExpr = b.addBlock('Expression', {
    expression: '1.0 + 0.5 * sin(in0 * 6.28 + 1.57)', // quarter-phase offset from opacity
  });
  b.wire(time, 'phaseA', scaleExpr, 'in0');

  // Render with rect shape, animated scale and opacity
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(jitter, 'out', render, 'pos');
  b.wire(opacity, 'out', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
  b.wire(scaleExpr, 'out', render, 'scale');
};

/**
 * Shape Kaleidoscope - Dual topology demo
 *
 * Two interlocking spirals: ellipses rotating clockwise, rectangles counter-clockwise.
 * Both topologies render simultaneously in the same patch (two render passes).
 * Animated scale pulses shapes in and out. Spread out for visibility.
 * Demonstrates the full shape2d pipeline with multiple topologies.
 */
const patchShapeKaleidoscope: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 6000,
    periodBMs: 10000,
  }, { role: timeRootRole() });

  // Animated scale: pulsing between 0.6 and 1.8
  const eScaleExpr = b.addBlock('Expression', {
    expression: '1.2 + 0.6 * sin(in0 * 6.28)', // pulse with phaseA
  });
  b.wire(time, 'phaseA', eScaleExpr, 'in0');

  const rScaleExpr = b.addBlock('Expression', {
    expression: '1.5 + 0.8 * sin(in0 * 6.28 + 3.14)', // counter-pulse with phaseB
  });
  b.wire(time, 'phaseB', rScaleExpr, 'in0');

  // === LAYER 1: Ellipses (clockwise spiral) ===
  const ellipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });
  const ellipseArray = b.addBlock('Array', { count: 150 });
  b.wire(ellipse, 'shape', ellipseArray, 'element');

  // Ellipse positions: golden spiral spinning clockwise, wide spread
  const eGolden = b.addBlock('FieldGoldenAngle', { turns: 50 });
  const eAngular = b.addBlock('FieldAngularOffset', {});
  const eTotalAngle = b.addBlock('FieldAdd', {});
  const eRadius = b.addBlock('FieldRadiusSqrt', {});
  const ePos = b.addBlock('FieldPolarToCartesian', {});
  const eSpin = b.addBlock('Const', { value: 0.8 }); // clockwise

  b.wire(ellipseArray, 't', eGolden, 'id01');
  b.wire(ellipseArray, 't', eAngular, 'id01');
  b.wire(ellipseArray, 't', eRadius, 'id01');
  b.wire(time, 'phaseA', eAngular, 'phase');
  b.wire(eSpin, 'out', eAngular, 'spin');
  b.wire(eGolden, 'angle', eTotalAngle, 'a');
  b.wire(eAngular, 'offset', eTotalAngle, 'b');

  const eCenterX = b.addBlock('Const', { value: 0.5 });
  const eCenterY = b.addBlock('Const', { value: 0.5 });
  const eRadiusMax = b.addBlock('Const', { value: 0.45 }); // wider spread
  b.wire(eCenterX, 'out', ePos, 'centerX');
  b.wire(eCenterY, 'out', ePos, 'centerY');
  b.wire(eRadiusMax, 'out', eRadius, 'radius');
  b.wire(eTotalAngle, 'out', ePos, 'angle');
  b.wire(eRadius, 'out', ePos, 'radius');

  // Ellipse color: warm hues
  const eHue = b.addBlock('FieldHueFromPhase', {});
  b.wire(time, 'phaseA', eHue, 'phase');
  b.wire(ellipseArray, 't', eHue, 'id01');

  const eColor = b.addBlock('HsvToRgb', {});
  const eSat = b.addBlock('Const', { value: 1.0 });
  const eVal = b.addBlock('Const', { value: 1.0 });
  b.wire(eHue, 'hue', eColor, 'hue');
  b.wire(eSat, 'out', eColor, 'sat');
  b.wire(eVal, 'out', eColor, 'val');

  // Ellipse per-element opacity: wave sweeps across elements
  const eOpacityPulse = b.addBlock('FieldPulse', {});
  const eOpBase = b.addBlock('Const', { value: 0.3 });
  const eOpAmp = b.addBlock('Const', { value: 0.7 });
  const eOpSpread = b.addBlock('Const', { value: 1.5 });
  b.wire(ellipseArray, 't', eOpacityPulse, 'id01');
  b.wire(time, 'phaseA', eOpacityPulse, 'phase');
  b.wire(eOpBase, 'out', eOpacityPulse, 'base');
  b.wire(eOpAmp, 'out', eOpacityPulse, 'amplitude');
  b.wire(eOpSpread, 'out', eOpacityPulse, 'spread');

  const eOpacity = b.addBlock('ApplyOpacity', {});
  b.wire(eColor, 'color', eOpacity, 'color');
  b.wire(eOpacityPulse, 'value', eOpacity, 'opacity');

  const eRender = b.addBlock('RenderInstances2D', {});
  b.wire(ePos, 'pos', eRender, 'pos');
  b.wire(eOpacity, 'out', eRender, 'color'); // opacity-modulated color
  b.wire(ellipse, 'shape', eRender, 'shape');
  b.wire(eScaleExpr, 'out', eRender, 'scale'); // animated scale

  // === LAYER 2: Rectangles (counter-clockwise spiral) ===
  const rect = b.addBlock('Rect', { width: 0.025, height: 0.012 });
  const rectArray = b.addBlock('Array', { count: 100 });
  b.wire(rect, 'shape', rectArray, 'element');

  // Rect positions: golden spiral spinning counter-clockwise, wide spread
  const rGolden = b.addBlock('FieldGoldenAngle', { turns: 30 });
  const rAngular = b.addBlock('FieldAngularOffset', {});
  const rTotalAngle = b.addBlock('FieldAdd', {});
  const rRadius = b.addBlock('FieldRadiusSqrt', {});
  const rPos = b.addBlock('FieldPolarToCartesian', {});
  const rSpinConst = b.addBlock('Const', { value: -0.6 }); // counter-clockwise

  b.wire(rectArray, 't', rGolden, 'id01');
  b.wire(rectArray, 't', rAngular, 'id01');
  b.wire(rectArray, 't', rRadius, 'id01');
  b.wire(time, 'phaseB', rAngular, 'phase');
  b.wire(rSpinConst, 'out', rAngular, 'spin');
  b.wire(rGolden, 'angle', rTotalAngle, 'a');
  b.wire(rAngular, 'offset', rTotalAngle, 'b');

  const rCenterX = b.addBlock('Const', { value: 0.5 });
  const rCenterY = b.addBlock('Const', { value: 0.5 });
  const rRadiusMax = b.addBlock('Const', { value: 0.42 }); // wider spread
  b.wire(rCenterX, 'out', rPos, 'centerX');
  b.wire(rCenterY, 'out', rPos, 'centerY');
  b.wire(rRadiusMax, 'out', rRadius, 'radius');
  b.wire(rTotalAngle, 'out', rPos, 'angle');
  b.wire(rRadius, 'out', rPos, 'radius');

  // Rect color: complementary hues (offset by 0.5)
  const rPhaseOffset = b.addBlock('Expression', {
    expression: 'in0 + 0.5',
  });
  b.wire(time, 'phaseB', rPhaseOffset, 'in0');

  const rHue = b.addBlock('FieldHueFromPhase', {});
  b.wire(rPhaseOffset, 'out', rHue, 'phase');
  b.wire(rectArray, 't', rHue, 'id01');

  const rColor = b.addBlock('HsvToRgb', {});
  const rSat = b.addBlock('Const', { value: 0.7 });
  const rVal = b.addBlock('Const', { value: 0.95 });
  b.wire(rHue, 'hue', rColor, 'hue');
  b.wire(rSat, 'out', rColor, 'sat');
  b.wire(rVal, 'out', rColor, 'val');

  // Rect per-element opacity: counter-phase wave
  const rOpacityPulse = b.addBlock('FieldPulse', {});
  const rOpBase = b.addBlock('Const', { value: 0.4 });
  const rOpAmp = b.addBlock('Const', { value: 0.6 });
  const rOpSpread = b.addBlock('Const', { value: 2.5 });
  b.wire(rectArray, 't', rOpacityPulse, 'id01');
  b.wire(time, 'phaseB', rOpacityPulse, 'phase');
  b.wire(rOpBase, 'out', rOpacityPulse, 'base');
  b.wire(rOpAmp, 'out', rOpacityPulse, 'amplitude');
  b.wire(rOpSpread, 'out', rOpacityPulse, 'spread');

  const rOpacity = b.addBlock('ApplyOpacity', {});
  b.wire(rColor, 'color', rOpacity, 'color');
  b.wire(rOpacityPulse, 'value', rOpacity, 'opacity');

  const rRender = b.addBlock('RenderInstances2D', {});
  b.wire(rPos, 'pos', rRender, 'pos');
  b.wire(rOpacity, 'out', rRender, 'color'); // opacity-modulated color
  b.wire(rect, 'shape', rRender, 'shape');
  b.wire(rScaleExpr, 'out', rRender, 'scale'); // animated counter-pulse scale
};

const patches: { name: string; builder: PatchBuilder }[] = [
  { name: 'Golden Spiral', builder: patchGoldenSpiral },
  { name: 'Domain Test', builder: patchDomainTest },
  { name: 'Tile Grid', builder: patchTileGrid },
  { name: 'Orbital Rings', builder: patchOrbitalRings },
  { name: 'Rect Mosaic', builder: patchRectMosaic },
  { name: 'Shape Kaleidoscope', builder: patchShapeKaleidoscope },
];

let currentPatchIndex = 0;

// =============================================================================
// Build and Compile
// =============================================================================

/**
 * Build a patch from a PatchBuilder and load it into the store.
 * Does NOT compile - call compileAndSwap() after this.
 */
function build(patchBuilder: PatchBuilder): Patch {
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
    log('No patch to compile', 'warn');
    return;
  }

  if (!isInitial) {
    log('Live recompile triggered...');
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
      throw new Error('Compile failed');
    }
    // For recompile, keep running with old program
    return;
  }

  const program = result.program;
  log(
    `Compiled: ${program.signalExprs.nodes.length} signals, ${program.fieldExprs.nodes.length} fields, ${program.slotMeta.length} slots`,
  );

  // Get schedule info
  const newSchedule = program.schedule as {
    stateSlotCount?: number;
    stateMappings?: readonly any[];
    instances?: ReadonlyMap<string, any>;
  };
  const newSlotCount = program.slotMeta.length;
  const newStateSlotCount = newSchedule?.stateSlotCount ?? 0;
  const newStateMappings = newSchedule?.stateMappings ?? [];

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
  if (!isInitial) {
    log(`Hot-swap: value slots ${oldSlotCount}→${newSlotCount}, state slots ${oldStateSlotCount}→${newStateSlotCount}`);
  }

  // Create new RuntimeState from preserved SessionState + fresh ProgramState
  currentState = createRuntimeStateFromSession(sessionState!, newSlotCount, newStateSlotCount);

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

    if (migrationResult.migrated) {
      log(`State migration: ${migrationResult.scalarsMigrated} scalar, ${migrationResult.fieldsMigrated} field states migrated, ${migrationResult.initialized} initialized, ${migrationResult.discarded} discarded`);
    }
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

  if (isInitial) {
    log(`Initialized domain tracking: ${instanceCounts.size} instance(s)`);
  }

  // Emit ProgramSwapped event
  store!.events.emit({
    type: 'ProgramSwapped',
    patchId: 'patch-0',
    patchRevision: store!.getPatchRevision(),
    compileId: isInitial ? 'compile-0' : `compile-live-${Date.now()}`,
    swapMode: isInitial ? 'hard' : 'soft',
    instanceCounts: isInitial ? undefined : instanceCounts,
  });

  if (!isInitial) {
    const instanceInfo = [...instanceCounts.entries()]
      .map(([id, count]) => `${id}=${count}`)
      .join(', ');
    log(`Recompiled: ${program.signalExprs.nodes.length} signals, ${program.fieldExprs.nodes.length} fields, instances: [${instanceInfo}]`);
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
      if (oldCount > 0) {
        log(`[Continuity] Instance removed: ${id} (was ${oldCount} elements)`);
      }
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

// Track initial hash to skip first reaction fire
let reactionDisposer: (() => void) | null = null;
let lastBlockParamsHash: string | null = null;
let reactionSetup = false;

/**
 * Set up MobX reaction to watch for patch changes.
 */
function setupLiveRecompileReaction() {
  if (reactionSetup) return;
  reactionSetup = true;

  // Initialize hash from current store state
  lastBlockParamsHash = hashBlockParams(store!.patch.blocks);

  // Watch for block changes (additions, removals, param changes)
  reactionDisposer = reaction(
    () => {
      // Track both structure and params
      const blocks = store!.patch.blocks;
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

    // Execute frame
    const execStart = performance.now();
    const frame = executeFrame(currentProgram, currentState, pool, tMs);
    execTime = performance.now() - execStart;

    // Render to canvas with zoom/pan transform from store
    const renderStart = performance.now();
    const { zoom, pan } = store!.viewport;
    ctx.save();
    ctx.translate(canvas.width / 2 + pan.x * zoom, canvas.height / 2 + pan.y * zoom);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    renderFrame(ctx, frame, canvas.width, canvas.height);
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
          log(`  Pass 0: count=${pass.count}, scale=${pass.scale}`);
          log(`  Pass 0: count=${pass.count}, scale=${pass.scale}`);
          log(`  Pass 0: count=${pass.count}, scale=${pass.scale}`);

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
  build(patches[index].builder);
  await compileAndSwap(true);
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

/**
 * Called when React's StoreProvider has mounted and store is available.
 * This is where we initialize the runtime that depends on the store.
 */
async function initializeRuntime(rootStore: RootStore) {
  // Set the module-level store reference
  store = rootStore;

  log('Store ready, initializing runtime...');

  // Initialize buffer pool
  pool = new BufferPool();

  // Create patch switcher UI
  createPatchSwitcherUI();

  // Build and compile with initial patch
  build(patches[currentPatchIndex].builder);
  await compileAndSwap(true);

  // Set up live recompile reaction (Continuity-UI Sprint 1)
  setupLiveRecompileReaction();

  // Subscribe to CompileEnd events for compilation statistics
  store.events.on('CompileEnd', (event) => {
    if (event.status === 'success') {
      store!.diagnostics.recordCompilation(event.durationMs);
    }
  });

  log('Runtime initialized');

  // Start animation loop
  log('Starting animation loop...');
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
            ctx = canvas.getContext('2d');
            log('Canvas ready');
          },
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
