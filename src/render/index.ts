/**
 * Render - Runtime renderer boundary exports
 */

// [LAW:one-type-per-behavior] Runtime rendering uses a single renderer type:
// WebGPU. Alternative renderers are kept in module-local paths, not exported
// from the runtime render boundary.
export {
  WebGPURenderer,
  createWebGPURenderer,
  assertWebGPUStartupContract,
} from './webgpu';
export { WEBGPU_RENDER_CONTRACT } from './webgpu/shaders';
export {
  setRenderIssueReporter,
  getRenderIssues,
  clearRenderIssues,
} from './render-issues';

// Re-export v2 types (now the only types)
export type {
  DrawPrepRenderContract,
  PathStyle,
  PathGeometry,
  InstanceTransforms,
  DrawPathInstancesOp,
  LegacyRenderFrame,
  DrawOp,
} from './types';

// RenderBufferArena for zero-allocation rendering
export { RenderBufferArena } from './RenderBufferArena';
