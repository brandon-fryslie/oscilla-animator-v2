/**
 * Render - Runtime renderer boundary exports
 */

// [LAW:one-type-per-behavior] Runtime rendering uses a single renderer type:
// WebGPU. Alternative renderers are kept in module-local paths, not exported
// from the runtime render boundary.
export {
  createWebGPURenderer,
  assertWebGPUStartupContract,
} from './webgpu';
export type {
  WebGPURenderer,
  GpuFault,
  GpuFaultCallback,
  RuntimeInputChannelValues,
  WebGPURendererExecutionState,
} from './webgpu';
export { WEBGPU_RENDER_CONTRACT } from './webgpu/shaders';
export {
  setRenderIssueReporter,
  getRenderIssues,
  clearRenderIssues,
} from './render-issues';

// Re-export canonical runtime->renderer boundary types.
export type {
  DrawPrepRenderContract,
  MatrixViewportContract,
  RuntimeInputSignalContract,
} from './types';

// RenderBufferArena for zero-allocation rendering
export { RenderBufferArena } from './RenderBufferArena';

export function renderBoundaryName(): string {
  return 'webgpu-canonical-boundary';
}
