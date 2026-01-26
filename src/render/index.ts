/**
 * Render - Convert RenderFrameIR to pixels
 */

// Canvas 2D renderer
export { renderFrame, renderDrawPathInstancesOp, renderDrawPrimitiveInstancesOp } from './canvas/Canvas2DRenderer';

// SVG renderer
export { SVGRenderer } from './svg/SVGRenderer';

// Re-export v2 types (now the only types)
export type {
  PathStyle,
  PathGeometry,
  PrimitiveGeometry,
  InstanceTransforms,
  DrawPathInstancesOp,
  DrawPrimitiveInstancesOp,
  RenderFrameIR,
  DrawOp,
} from './types';
