/**
 * Render - Convert RenderFrameIR to pixels
 */

// Canvas 2D renderer
export { renderFrame, renderFrameV2, renderDrawPathInstancesOp, renderDrawPrimitiveInstancesOp } from './Canvas2DRenderer';

// SVG renderer
export { SVGRenderer } from './SVGRenderer';

// Re-export v2 types (now the only types)
export type {
  PathStyle,
  PathGeometry,
  PrimitiveGeometry,
  InstanceTransforms,
  DrawPathInstancesOp,
  DrawPrimitiveInstancesOp,
  RenderFrameIR_Future,
  DrawOp,
} from './future-types';
