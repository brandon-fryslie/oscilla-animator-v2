/**
 * Layout Blocks
 *
 * Stage 3 blocks that apply spatial operations to fields.
 */

import { register as register_0_circle_layout_uv } from './circle-layout-uv';
import { register as register_1_line_layout_uv } from './line-layout-uv';
import { register as register_2_grid_layout_uv } from './grid-layout-uv';
import { register as register_3_spiral_layout } from './spiral-layout';
import { register as register_4_attractor_layout } from './attractor-layout';
import { register as register_5_path_layout } from './path-layout';

export function registerLayoutBlocks(): void {
  register_0_circle_layout_uv();
  register_1_line_layout_uv();
  register_2_grid_layout_uv();
  register_3_spiral_layout();
  register_4_attractor_layout();
  register_5_path_layout();
}
