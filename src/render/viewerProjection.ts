/**
 * Viewer-side 3D Projection
 *
 * Applies perspective projection to a RenderFrameIR as a viewer-only transform.
 * This does NOT modify runtime state, continuity, or compilation — it only
 * populates the screen-space fields (screenPosition, screenRadius, depth, visible)
 * on each render pass.
 *
 * Current position buffers are vec2 (stride 2). This function promotes them
 * to vec3 (z=0) before calling the projection kernel.
 */

import { projectInstances, type CameraParams } from '../runtime/RenderAssembler';
import type { RenderFrameIR } from '../runtime/ScheduleExecutor';

/**
 * Apply viewer-side perspective projection to all passes in a frame.
 *
 * Promotes vec2 positions to vec3 (z=0) and runs the projection kernel.
 * Original position buffers are NOT mutated.
 *
 * @param frame - The frame to project (passes are mutated with screen-space fields)
 * @param camera - Camera parameters for projection
 */
export function applyViewerProjection(frame: RenderFrameIR, camera: CameraParams): void {
  for (const pass of frame.passes) {
    const pos2d = pass.position as Float32Array;
    const count = pass.count;

    // Promote vec2 → vec3 (z=0)
    const worldPos3 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      worldPos3[i * 3] = pos2d[i * 2];
      worldPos3[i * 3 + 1] = pos2d[i * 2 + 1];
      // z stays 0 (Float32Array is zero-initialized)
    }

    const projection = projectInstances(worldPos3, pass.scale, count, camera);
    pass.screenPosition = projection.screenPosition;
    pass.screenRadius = projection.screenRadius;
    pass.depth = projection.depth;
    pass.visible = projection.visible;
  }
}
