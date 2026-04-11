/**
 * src/pillars/block-dsl/presentation/canvas-target.ts
 *
 * Constants for the canvas render target. Single source of truth — every
 * Intent that renders to the canvas imports from here so all canvas-bound
 * render passes share the same sample count, viewport, and scissor.
 *
 * The values match the renderer shell's canvas configuration (4x MSAA,
 * 640x480). If the canvas dimensions become dynamic in the future (e.g.
 * resize events, multiple viewports), this module is the single point of
 * change.
 *
 * This module is a leaf in the dependency graph — it has no imports.
 */

export const CANVAS_SAMPLE_COUNT = 4;
export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 480;

export const CANVAS_VIEWPORT = {
  x: 0,
  y: 0,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  minDepth: 0,
  maxDepth: 1,
} as const;

export const CANVAS_SCISSOR = {
  x: 0,
  y: 0,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
} as const;
