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
  fixture('hello-triangle', 'Visible Triangle', 'Compute writes time-varying RGB, render draws a colored triangle.'),
  fixture('instanced-write', 'Instanced Ring', '64 instances in a ring via domain dispatch. Tests Cast, Intrinsic, instanced draw.'),
  fixture('for-loop-gradient', 'Loop Gradient', '32 bars with brightness from a For loop accumulator. Tests Var, Assign, For.'),
  fixture('hash-color', 'Hash Colors', '64 instances with PCG-hash-derived colors. Tests bitwise XOR, shift, AND.'),
  fixture('varying-gradient', 'Gradient Triangle', 'Per-vertex color as varying, GPU-interpolated. Tests vertex_index, varyings.'),
  fixture('texture-readwrite', 'Texture Pattern', 'Compute writes to storage texture, render reads via TextureLoad.'),
  fixture('sdf-circle', 'SDF Circle', 'Anti-aliased SDF circle. Tests dpdx, dpdy, fwidth, smoothstep.'),
  fixture('atomic-boids', 'Atomic Boids', '10,000 boids with atomic<u32> grid_cell. Tests AtomicOpField(Exchange).'),
  fixture('spirograph-trace', 'Spirograph Trace', '1000 points tracing a hypotrochoid. Rainbow color, alpha blending.'),
  fixture('conditional-ring', 'Conditional Ring', 'If, Var, Assign, LiteralBool, BinaryOp(==, !=, &&, ||, %), UnaryOp(!).'),
  fixture('search-break', 'Search Break', 'For+If+Break (nested early exit), Continue, BinaryOp(<=, >).'),
  fixture('bitfield-palette', 'Bitfield Palette', 'BinaryOp(|, <<, >=), UnaryOp(~). Bitfield manipulation for color.'),
  fixture('scalar-accumulator', 'Scalar Accumulator', 'LoadScalar + AtomicOpScalar(Add). Phase from scalar read, atomic counter.'),
  fixture('math-zoo', 'Math Zoo', 'Comprehensive builtins: tan, exp, log, sqrt, sign, fract, ceil, floor, round, pow, atan2, min, step, mix, asin, acos, atan.'),
  fixture('vector-field', 'Vector Field', 'Vector builtins: normalize, length, distance, dot, cross, reflect.'),
  fixture('multi-domain', 'Multi-Domain', 'Two domains, cross-domain reads, multiple draw calls in one render pass.'),
  fixture('palette-lookup', 'Palette Lookup', 'IndexAccess on vec4, nested Construct, computed index.'),
  fixture('constant-spiral', 'Constant Spiral', 'Constants map, LiteralI32, Cast(i32), deeply nested expressions.'),
  fixture('texture-blur', 'Texture Blur', 'Texture dispatch mode, 5-tap cross blur, multiple TextureLoad/TextureStore.'),
  fixture('sampled-texture', 'Sampled Texture', 'TextureSample with linear sampler. First sampler fixture.'),
  fixture('aurora-field', 'Aurora Field', '8192 rotating petals with curl dynamics. Inspired by aurora-petal-showcase.'),
  fixture('galaxy-swirl', 'Galaxy Swirl', '16384 stars in a rotating galaxy with spiral arms, Keplerian orbits, and core glow.'),
  fixture('jellyfish-bloom', 'Jellyfish Bloom', '6144 bioluminescent tendrils on 3 pulsing jellyfish with wave dynamics.'),
  fixture('fire-rain', 'Fire Rain', '12288 falling embers with heat color gradient, wind turbulence, and tumble rotation.'),
  fixture('strange-attractor', 'Strange Attractor', '4000-point Clifford attractor with velocity-driven color. From DEMO-PATCHES.md.'),
  fixture('grid-of-squares', 'Grid of Squares', '100 rotating squares with HSL rainbow color. From DEMO-PATCHES.md.'),
];
