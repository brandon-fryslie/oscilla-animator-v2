/**
 * Shape Blocks
 *
 * Blocks that create and manipulate path shapes.
 */

import { register as register_0_ellipse } from './ellipse';
import { register as register_1_rect } from './rect';
import { register as register_2_procedural_polygon } from './procedural-polygon';
import { register as register_3_procedural_star } from './procedural-star';
import { register as register_4_shape_wobble_2d } from './shape-wobble-2d';
import { register as register_5_path_field } from './path-field';
import { register as register_6_make_shape2d } from './make-shape2d';
import { register as register_7_gpu_triangle_rigid } from './gpu-triangle-rigid';

export function registerShapeBlocks(): void {
  register_0_ellipse();
  register_1_rect();
  register_2_procedural_polygon();
  register_3_procedural_star();
  register_4_shape_wobble_2d();
  register_5_path_field();
  register_6_make_shape2d();
  register_7_gpu_triangle_rigid();
}
