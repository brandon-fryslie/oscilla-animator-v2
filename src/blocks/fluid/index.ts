import { register as register_0_fluid_dynamics_2d } from './fluid-dynamics-2d';
import { register as register_1_fluid_splat } from './fluid-splat';
import { register as register_2_fluid_curl } from './fluid-curl';
import { register as register_3_fluid_vorticity } from './fluid-vorticity';
import { register as register_4_fluid_divergence } from './fluid-divergence';
import { register as register_5_fluid_pressure_jacobi } from './fluid-pressure-jacobi';
import { register as register_6_fluid_gradient_subtract } from './fluid-gradient-subtract';
import { register as register_7_fluid_advect } from './fluid-advect';
import { register as register_8_fluid_present } from './fluid-present';

export function registerFluidBlocks(): void {
  register_0_fluid_dynamics_2d();
  register_1_fluid_splat();
  register_2_fluid_curl();
  register_3_fluid_vorticity();
  register_4_fluid_divergence();
  register_5_fluid_pressure_jacobi();
  register_6_fluid_gradient_subtract();
  register_7_fluid_advect();
  register_8_fluid_present();
}
