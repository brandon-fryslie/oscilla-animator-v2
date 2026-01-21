/**
 * Render - Convert RenderFrameIR to pixels
 */

export type { RenderFrameIR, RenderPassIR } from './types';
export { renderFrame } from './Canvas2DRenderer';

// Future RenderIR types (Phase 6 prep - not yet used in production)
export type {
  PathStyle,
  PathGeometry,
  InstanceTransforms,
  DrawPathInstancesOp,
  RenderFrameIR_Future,
  DrawOp,
} from './future-types';
