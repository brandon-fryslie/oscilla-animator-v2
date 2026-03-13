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
import { register as register_7_parametric_curve_2d } from './parametric-curve-2d';
import { register as register_8_shape_twist_2d } from './shape-twist-2d';
import { register as register_9_shape_polar_ripple_2d } from './shape-polar-ripple-2d';
import { register as register_10_shape_lissajous_2d } from './shape-lissajous-2d';
import { register as register_11_shape_radial_pulse_2d } from './shape-radial-pulse-2d';
import { register as register_12_shape_orbit_shift_2d } from './shape-orbit-shift-2d';
import { register as register_13_shape_squish_wave_2d } from './shape-squish-wave-2d';

export function registerShapeBlocks(): void {
  register_0_ellipse();
  register_1_rect();
  register_2_procedural_polygon();
  register_3_procedural_star();
  register_4_shape_wobble_2d();
  register_5_path_field();
  register_6_make_shape2d();
  register_7_parametric_curve_2d();
  register_8_shape_twist_2d();
  register_9_shape_polar_ripple_2d();
  register_10_shape_lissajous_2d();
  register_11_shape_radial_pulse_2d();
  register_12_shape_orbit_shift_2d();
  register_13_shape_squish_wave_2d();
}
