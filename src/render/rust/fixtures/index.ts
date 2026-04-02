/**
 * Payload Tester Fixtures — Registry
 *
 * [LAW:one-source-of-truth] Each fixture is a complete PipelineInstallPayload
 * in its own file. This index collects them into the ordered fixture array.
 */

import type { PipelineInstallPayload } from '../boundary-contract';
import { helloTriangle } from './hello-triangle';
import { instancedWrite } from './instanced-write';
import { forLoopGradient } from './for-loop-gradient';
import { hashColor } from './hash-color';
import { vectorMath } from './vector-math';
import { varyingGradient } from './varying-gradient';
import { textureReadwrite } from './texture-readwrite';
import { sdfCircle } from './sdf-circle';
import { atomicCounter } from './atomic-counter';
import { audioReactive } from './audio-reactive';
import { hashPositions } from './hash-positions';
import { noiseTerrain } from './noise-terrain';
import {
  demoGridSquares,
  demoSpirographTrace,
  demoMouseReactiveField,
  demoColorRampPalette,
  demoTwoDomainScene,
  demoFillAndOutline,
  demoReactionDiffusionSurface,
  demoStrangeAttractor,
} from './demo-behaviors';
import {
  demoKaleidoscope,
  demoConditionalVisibility,
  demoAdditiveRippleRings,
  demoTwistedParametricRibbon,
  demoVelocityStretchedParticles,
  demoNoiseDisplacedGrid,
} from './demo-behaviors-extra';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: PipelineInstallPayload;
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  {
    id: 'hello-triangle',
    name: 'Visible Triangle',
    description: 'Minimal vertical slice: compute pass writes time-varying RGB, draw_prep fills indirect buffer, render pass draws a single colored triangle.',
    payload: helloTriangle,
  },
  {
    id: 'instanced-write',
    name: 'Instanced Ring',
    description: 'Gate 1: 64 instances placed in a ring via parallel compute (global_invocation_id). Tests domain dispatch, Cast, and instanced draw_indirect.',
    payload: instancedWrite,
  },
  {
    id: 'for-loop-gradient',
    name: 'Loop Gradient',
    description: 'Gate 2: 32 bars with brightness from a For loop accumulator. Tests Var, Assign, For, control flow.',
    payload: forLoopGradient,
  },
  {
    id: 'hash-color',
    name: 'Hash Colors',
    description: 'Gate 3: 64 instances in 8x8 grid with PCG-hash-derived colors. Tests bitwise XOR, shift, AND, multiply.',
    payload: hashColor,
  },
  {
    id: 'vector-math',
    name: 'Vector Lighting',
    description: 'Gate 4: Ring shading from dot/normalize/reflect/length with IndexAccess + multi-swizzle.',
    payload: vectorMath,
  },
  {
    id: 'varying-gradient',
    name: 'Gradient Triangle',
    description: 'Gate 5: Per-vertex color passed as varying, GPU-interpolated across triangle face. Tests vertex→fragment data passing.',
    payload: varyingGradient,
  },
  {
    id: 'texture-readwrite',
    name: 'Texture Pattern',
    description: 'Gate 6+7: Compute writes animated gradient to storage texture, render samples it through a sampler. Tests texture/sampler allocation and texture ops.',
    payload: textureReadwrite,
  },
  {
    id: 'sdf-circle',
    name: 'SDF Circle',
    description: 'Gate 8: Derivative antialiasing with fwidth in fragment shader.',
    payload: sdfCircle,
  },
  {
    id: 'atomic-counter',
    name: 'Atomic Counter',
    description: 'Gate 9: Atomic scalar increment across domain lanes, visualized as per-instance counter ramp.',
    payload: atomicCounter,
  },
  {
    id: 'audio-reactive',
    name: 'Audio Reactive',
    description: 'Gate 10: Data stream (FFT bins) drives bar heights. Worker sends UPDATE_DATA_STREAM frames.',
    payload: audioReactive,
  },
  {
    id: 'hash-positions',
    name: 'Hash Swarm',
    description: 'Gate 12+13: Deterministic hash_u32 swarm with preserveStateOnRecompile enabled for hot-swap blit.',
    payload: hashPositions,
  },
  {
    id: 'noise-terrain',
    name: 'Noise Terrain',
    description: 'Gate 13: Procedural fullscreen color from noise_simplex_2d and noise_simplex_3d.',
    payload: noiseTerrain,
  },
  {
    id: 'demo-grid-squares',
    name: 'Demo: Grid of Squares',
    description: 'DEMO-PATCHES #1: index/rank math drives 10x10 layout, per-instance rotation, and animated color.',
    payload: demoGridSquares,
  },
  {
    id: 'demo-spirograph-trace',
    name: 'Demo: Spirograph Trace',
    description: 'DEMO-PATCHES #2: rank phase offsets create Lissajous-like point trails with additive blending.',
    payload: demoSpirographTrace,
  },
  {
    id: 'demo-kaleidoscope',
    name: 'Demo: Kaleidoscope',
    description: 'DEMO-PATCHES #3: N-fold rotational symmetry from index-derived angles around a shared origin.',
    payload: demoKaleidoscope,
  },
  {
    id: 'demo-conditional-visibility',
    name: 'Demo: Conditional Visibility',
    description: 'DEMO-PATCHES #4: scalar threshold gates per-instance opacity from sampled noise.',
    payload: demoConditionalVisibility,
  },
  {
    id: 'demo-mouse-reactive-field',
    name: 'Demo: Mouse-Reactive Field',
    description: 'DEMO-PATCHES #5 analog: uniform input mixed with per-instance scatter to drive size and lightness.',
    payload: demoMouseReactiveField,
  },
  {
    id: 'demo-additive-ripple-rings',
    name: 'Demo: Additive Ripple Rings',
    description: 'DEMO-PATCHES #6: rank-staggered lifecycle drives ring scale/opacity with additive accumulation.',
    payload: demoAdditiveRippleRings,
  },
  {
    id: 'demo-color-ramp-palette',
    name: 'Demo: Color Ramp Palette',
    description: 'DEMO-PATCHES #7: palette texture sample by rank (color path from texture, not HSL math).',
    payload: demoColorRampPalette,
  },
  {
    id: 'demo-twisted-parametric-ribbon',
    name: 'Demo: Twisted Parametric Ribbon',
    description: 'DEMO-PATCHES #8 analog: parametric ribbon segments with time-driven twist and rank-driven hue.',
    payload: demoTwistedParametricRibbon,
  },
  {
    id: 'demo-velocity-stretched-particles',
    name: 'Demo: Velocity-Stretched Particles',
    description: 'DEMO-PATCHES #9 analog: velocity-derived orientation/stretch for motion blur style rendering.',
    payload: demoVelocityStretchedParticles,
  },
  {
    id: 'demo-noise-displaced-grid',
    name: 'Demo: Noise-Displaced Grid',
    description: 'DEMO-PATCHES #10 analog: regular grid displaced by animated noise field.',
    payload: demoNoiseDisplacedGrid,
  },
  {
    id: 'demo-two-domain-scene',
    name: 'Demo: Two-Domain Scene',
    description: 'DEMO-PATCHES #11: independent background and foreground domains composed in draw order.',
    payload: demoTwoDomainScene,
  },
  {
    id: 'demo-fill-and-outline',
    name: 'Demo: Fill and Outline',
    description: 'DEMO-PATCHES #12: one transformed source fanned out to separate fill and outline intents.',
    payload: demoFillAndOutline,
  },
  {
    id: 'demo-reaction-diffusion-surface',
    name: 'Demo: Reaction-Diffusion Surface',
    description: 'DEMO-PATCHES #13 analog: solver-like texture simulation driving a fullscreen render.',
    payload: demoReactionDiffusionSurface,
  },
  {
    id: 'demo-strange-attractor',
    name: 'Demo: Strange Attractor',
    description: 'DEMO-PATCHES #14: dense additive attractor cloud with color from velocity magnitude.',
    payload: demoStrangeAttractor,
  },
];
