/**
 * Render - Convert RenderFrameIR to pixels
 */

// Canvas 2D renderer
export { renderFrame, renderDrawPathInstancesOp } from './canvas/Canvas2DRenderer';

// SVG renderer
export { SVGRenderer } from './svg/SVGRenderer';

// Re-export v2 types (now the only types)
export type {
  PathStyle,
  PathGeometry,
  InstanceTransforms,
  DrawPathInstancesOp,
  RenderFrameIR,
  DrawOp,
} from './types';

// RenderBufferArena for zero-allocation rendering
export {
  RenderBufferArena,
  initGlobalRenderArena,
  getGlobalRenderArena,
  isGlobalArenaInitialized,
  _resetGlobalArenaForTesting,
} from './RenderBufferArena';
