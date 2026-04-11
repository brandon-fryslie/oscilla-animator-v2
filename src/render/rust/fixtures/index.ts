/**
 * Payload Tester Fixtures — Registry
 *
 * [LAW:one-source-of-truth] Each fixture file is pure DSL text (a gpu({...}) expression).
 * Loaded as raw strings via import.meta.glob, evaluated via evalDsl() to produce payloads.
 * The same text is displayed in the DSL editor.
 */

import type { PipelineInstallPayload } from '../boundary-contract';
import { evalDsl } from '../../../payload-tester/dsl-eval';

// Load all fixture files as raw text at build time
const rawSources = import.meta.glob('./*.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

function loadFixture(filename: string): { payload: PipelineInstallPayload; dslSource: string } {
  const key = `./${filename}.ts`;
  const dslSource = rawSources[key];
  if (!dslSource) throw new Error(`Fixture file not found: ${key}`);
  const result = evalDsl(dslSource);
  if (!result.ok) throw new Error(`Fixture '${filename}' failed to compile: ${result.error}`);
  return { payload: result.payload, dslSource };
}

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: PipelineInstallPayload;
  readonly dslSource: string;
}

function fixture(id: string, name: string, description: string): PayloadFixture {
  const { payload, dslSource } = loadFixture(id);
  return { id, name, description, payload, dslSource };
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  fixture('instanced-write', 'Instanced Ring', '64 instances in a ring via domain dispatch. Tests Cast, Intrinsic, instanced draw.'),
  fixture('for-loop-gradient', 'Loop Gradient', '32 bars with brightness from a For loop accumulator. Tests Var, Assign, For.'),
  fixture('hash-color', 'Hash Colors', '64 instances with PCG-hash-derived colors. Tests bitwise XOR, shift, AND.'),
  fixture('varying-gradient', 'Gradient Triangle', 'Per-vertex color as varying, GPU-interpolated. Tests vertex_index, varyings.'),
  fixture('texture-readwrite', 'Texture Pattern', 'Compute writes to storage texture, render reads via TextureLoad.'),
  fixture('sdf-circle', 'SDF Circle', 'Anti-aliased SDF circle. Tests dpdx, dpdy, fwidth, smoothstep.'),
  fixture('atomic-boids', 'Atomic Boids', '10,000 boids with atomic<u32> grid_cell. Tests AtomicOpField(Exchange).'),
  fixture('spirograph-trace', 'Spirograph Trace', '1000 points tracing a hypotrochoid. Rainbow color, alpha blending.'),
  fixture('conditional-ring', 'Conditional Ring', 'If, Var, Assign, LiteralBool, BinaryOp(==, !=, &&, ||, %), UnaryOp(!).'),
  fixture('depth-bias-compare', 'Depth Bias Compare', 'Visual validation for less-equal depth compare and non-default depth bias.'),
  fixture('front-face-cw', 'Front Face CW', 'Clockwise triangle with back-face culling. Validates frontFace primitive state.'),
  fixture('search-break', 'Search Break', 'For+If+Break (nested early exit), Continue, BinaryOp(<=, >).'),
  fixture('bitfield-palette', 'Bitfield Palette', 'BinaryOp(|, <<, >=), UnaryOp(~). Bitfield manipulation for color.'),
  fixture('bgra-offscreen', 'BGRA Offscreen', 'Offscreen bgra8unorm target composited back to canvas. Validates texture format parsing.'),
  fixture('offscreen-msaa', 'Offscreen MSAA', 'Multisampled named render target resolved and composited back to canvas.'),
  fixture('scalar-accumulator', 'Scalar Accumulator', 'LoadScalar + AtomicOpScalar(Add). Phase from scalar read, atomic counter.'),
  fixture('math-zoo', 'Math Zoo', 'Comprehensive builtins: tan, exp, log, sqrt, sign, fract, ceil, floor, round, pow, atan2, min, step, mix, asin, acos, atan.'),
  fixture('vector-field', 'Vector Field', 'Vector builtins: normalize, length, distance, dot, cross, reflect.'),
  fixture('multi-domain', 'Multi-Domain', 'Two domains, cross-domain reads, multiple draw calls in one render pass.'),
  fixture('mipmapped-texture', 'Mipmapped Texture', 'Named texture with mipLevelCount > 1 rendered and sampled through the payload tester.'),
  fixture('sampler-extended', 'Sampler Extended', 'Extended sampler descriptor fields on a sampled texture path.'),
  fixture('texture-array-alloc', 'Texture Array Alloc', 'Allocation proof for 2d-array and cube-array texture dimensions.'),
  fixture('vertex-float32x3', 'Vertex Float32x3', 'Shape position attribute uses float32x3 at shaderLocation 0.'),
  fixture('palette-lookup', 'Palette Lookup', 'IndexAccess on vec4, nested Construct, computed index.'),
  fixture('constant-spiral', 'Constant Spiral', 'Constants map, LiteralI32, Cast(i32), deeply nested expressions.'),
  fixture('texture-blur', 'Texture Blur', 'Texture dispatch mode, 5-tap cross blur, multiple TextureLoad/TextureStore.'),
  fixture('texture-load-mip', 'Texture Load Mip', 'Explicit mipLevel on TextureLoad for a sampled render target.'),
  fixture('sampled-texture', 'Sampled Texture', 'TextureSample with linear sampler. First sampler fixture.'),
  fixture('aurora-field', 'Aurora Field', '8192 rotating petals with curl dynamics. Inspired by aurora-petal-showcase.'),
  fixture('galaxy-swirl', 'Galaxy Swirl', '16384 stars in a rotating galaxy with spiral arms, Keplerian orbits, and core glow.'),
  fixture('jellyfish-bloom', 'Jellyfish Bloom', '6144 bioluminescent tendrils on 3 pulsing jellyfish with wave dynamics.'),
  fixture('fire-rain', 'Fire Rain', '12288 falling embers with heat color gradient, wind turbulence, and tumble rotation.'),
  fixture('strange-attractor', 'Strange Attractor', '4000-point Clifford attractor with velocity-driven color. From DEMO-PATCHES.md.'),
  fixture('atomic-histogram', 'Atomic Histogram', 'AtomicLoadField, assignResultTo on AtomicOpField. Phase 3 walker gate.'),
  fixture('quad-camera', 'Quad Camera', '4 cameras → 4 textures → composite. Tests render-to-texture, composite pass, texture sampling.'),
  fixture('simplex-noise', 'Simplex Noise', '10000 dots displaced and colored by noise_simplex_2d. Tests WGSL function transplant.'),
  fixture('store-op-store', 'Store Op Store', 'Explicit storeOp on an offscreen render target, then composite it back to canvas.'),
];
