import { register as register_0_render_instances_2d } from './render-instances-2d';
import { register as register_1_camera } from './camera';
import { register as register_2_webgpu_type1_sink } from './webgpu-type1-sink';

export function registerRenderBlocks(): void {
  register_0_render_instances_2d();
  register_1_camera();
  register_2_webgpu_type1_sink();
}
