import { register as register_0_render_instances_2d } from './render-instances-2d';
import { register as register_1_camera } from './camera';
import { register as register_2_webgpu_type1_sink } from './webgpu-type1-sink';
import { register as register_3_cubic_bezier_ribbon_2d } from './cubic-bezier-ribbon-2d';
import { register as register_4_closed_blob_2d } from './closed-blob-2d';

export function registerRenderBlocks(): void {
  register_0_render_instances_2d();
  register_1_camera();
  register_2_webgpu_type1_sink();
  register_3_cubic_bezier_ribbon_2d();
  register_4_closed_blob_2d();
}
