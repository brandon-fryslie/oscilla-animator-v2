/**
 * Payload Tester Fixtures — Registry
 *
 * [LAW:one-source-of-truth] Each fixture is a typed TypeScript module exporting
 * a GpuSpec (the source of truth) and a pre-compiled PipelineInstallPayload.
 * The DSL source is loaded as raw text for display in the editor.
 * Recompilation with canvas dimensions uses gpu(spec, ctx) directly.
 */

import type { PipelineInstallPayload } from '../boundary-contract';
import { gpu, type GpuSpec, type GpuContext } from '../../gpu-ir/compile';

// --- Typed fixture imports (payload + spec) ---
import { instancedWriteSpec, instancedWriteTyped } from './typed/instanced-write';
import { forLoopGradientSpec, forLoopGradientTyped } from './typed/for-loop-gradient';
import { hashColorSpec, hashColorTyped } from './typed/hash-color';
import { varyingGradientSpec, varyingGradientTyped } from './typed/varying-gradient';
import { textureReadwriteSpec, textureReadwriteTyped } from './typed/texture-readwrite';
import { sdfCircleSpec, sdfCircleTyped } from './typed/sdf-circle';
import { atomicBoidsSpec, atomicBoidsTyped } from './typed/atomic-boids';
import { spirographTraceSpec, spirographTraceTyped } from './typed/spirograph-trace';
import { conditionalRingSpec, conditionalRingTyped } from './typed/conditional-ring';
import { searchBreakSpec, searchBreakTyped } from './typed/search-break';
import { bitfieldPaletteSpec, bitfieldPaletteTyped } from './typed/bitfield-palette';
import { scalarAccumulatorSpec, scalarAccumulatorTyped } from './typed/scalar-accumulator';
import { mathZooSpec, mathZooTyped } from './typed/math-zoo';
import { vectorFieldSpec, vectorFieldTyped } from './typed/vector-field';
import { multiDomainSpec, multiDomainTyped } from './typed/multi-domain';
import { paletteLookupSpec, paletteLookupTyped } from './typed/palette-lookup';
import { constantSpiralSpec, constantSpiralTyped } from './typed/constant-spiral';
import { textureBlurSpec, textureBlurTyped } from './typed/texture-blur';
import { sampledTextureSpec, sampledTextureTyped } from './typed/sampled-texture';
import { auroraFieldSpec, auroraFieldTyped } from './typed/aurora-field';
import { galaxySwirlSpec, galaxySwirlTyped } from './typed/galaxy-swirl';
import { jellyfishBloomSpec, jellyfishBloomTyped } from './typed/jellyfish-bloom';
import { fireRainSpec, fireRainTyped } from './typed/fire-rain';
import { strangeAttractorSpec, strangeAttractorTyped } from './typed/strange-attractor';
import { atomicHistogramSpec, atomicHistogramTyped } from './typed/atomic-histogram';
import { quadCameraSpec, quadCameraTyped } from './typed/quad-camera';
import { simplexNoiseSpec, simplexNoiseTyped } from './typed/simplex-noise';
import { depthPrepassSpec, depthPrepassTyped } from './typed/depth-prepass';
import { mrtSplitSpec, mrtSplitTyped } from './typed/mrt-split';

// Load typed fixture source as raw text for the DSL editor display
const rawSources = import.meta.glob('./typed/*.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

function sourceOf(name: string): string {
  const key = `./typed/${name}.ts`;
  return rawSources[key] ?? '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: PipelineInstallPayload;
  readonly dslSource: string;
  /** Recompile with canvas dimensions. Returns a fresh payload. */
  readonly recompile: (ctx: GpuContext) => PipelineInstallPayload;
}

function fixture(
  id: string,
  name: string,
  description: string,
  spec: GpuSpec,
  payload: PipelineInstallPayload,
): PayloadFixture {
  return {
    id,
    name,
    description,
    payload,
    dslSource: sourceOf(id),
    recompile: (ctx: GpuContext) => gpu(spec, ctx),
  };
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  fixture('instanced-write', 'Instanced Ring', '2048 instances in a breathing ring via domain dispatch. Tests Cast, Intrinsic, instanced draw.', instancedWriteSpec, instancedWriteTyped),
  fixture('for-loop-gradient', 'Loop Gradient', '64 bars with brightness from a For loop accumulator. Tests Var, Assign, For.', forLoopGradientSpec, forLoopGradientTyped),
  fixture('hash-color', 'Hash Colors', '64 instances with PCG-hash-derived colors. Tests bitwise XOR, shift, AND.', hashColorSpec, hashColorTyped),
  fixture('varying-gradient', 'Gradient Triangle', 'Per-vertex color as varying, GPU-interpolated. Tests vertex_index, varyings.', varyingGradientSpec, varyingGradientTyped),
  fixture('texture-readwrite', 'Texture Pattern', 'Compute writes to storage texture, render reads via TextureLoad.', textureReadwriteSpec, textureReadwriteTyped),
  fixture('sdf-circle', 'SDF Circle', 'Anti-aliased SDF circle. Tests dpdx, dpdy, fwidth, smoothstep.', sdfCircleSpec, sdfCircleTyped),
  fixture('atomic-boids', 'Atomic Boids', '10,000 boids with atomic<u32> grid_cell. Tests AtomicOpField(Exchange).', atomicBoidsSpec, atomicBoidsTyped),
  fixture('spirograph-trace', 'Spirograph Trace', '1000 points tracing a hypotrochoid. Rainbow color, alpha blending.', spirographTraceSpec, spirographTraceTyped),
  fixture('conditional-ring', 'Conditional Ring', 'If, Var, Assign, LiteralBool, BinaryOp(==, !=, &&, ||, %), UnaryOp(!).', conditionalRingSpec, conditionalRingTyped),
  fixture('search-break', 'Search Break', 'For+If+Break (nested early exit), Continue, BinaryOp(<=, >).', searchBreakSpec, searchBreakTyped),
  fixture('bitfield-palette', 'Bitfield Palette', 'BinaryOp(|, <<, >=), UnaryOp(~). Bitfield manipulation for color.', bitfieldPaletteSpec, bitfieldPaletteTyped),
  fixture('scalar-accumulator', 'Scalar Accumulator', 'LoadScalar + AtomicOpScalar(Add). Phase from scalar read, atomic counter.', scalarAccumulatorSpec, scalarAccumulatorTyped),
  fixture('math-zoo', 'Math Zoo', 'Comprehensive builtins: tan, exp, log, sqrt, sign, fract, ceil, floor, round, pow, atan2, min, step, mix, asin, acos, atan.', mathZooSpec, mathZooTyped),
  fixture('vector-field', 'Vector Field', 'Vector builtins: normalize, length, distance, dot, cross, reflect.', vectorFieldSpec, vectorFieldTyped),
  fixture('multi-domain', 'Multi-Domain', 'Two domains, cross-domain reads, multiple draw calls in one render pass.', multiDomainSpec, multiDomainTyped),
  fixture('palette-lookup', 'Palette Lookup', 'IndexAccess on vec4, nested Construct, computed index.', paletteLookupSpec, paletteLookupTyped),
  fixture('constant-spiral', 'Constant Spiral', 'Constants as Let bindings, LiteralI32, Cast(i32), deeply nested expressions.', constantSpiralSpec, constantSpiralTyped),
  fixture('texture-blur', 'Texture Blur', 'Texture dispatch mode, 5-tap cross blur, multiple TextureLoad/TextureStore.', textureBlurSpec, textureBlurTyped),
  fixture('sampled-texture', 'Sampled Texture', 'TextureSample with linear sampler. First sampler fixture.', sampledTextureSpec, sampledTextureTyped),
  fixture('aurora-field', 'Aurora Field', '76800 rotating petals with curl dynamics. R2 quasi-random placement.', auroraFieldSpec, auroraFieldTyped),
  fixture('galaxy-swirl', 'Galaxy Swirl', '16384 stars in a rotating galaxy with spiral arms, Keplerian orbits, and core glow.', galaxySwirlSpec, galaxySwirlTyped),
  fixture('jellyfish-bloom', 'Jellyfish Bloom', '6144 bioluminescent tendrils on 3 pulsing jellyfish with wave dynamics.', jellyfishBloomSpec, jellyfishBloomTyped),
  fixture('fire-rain', 'Fire Rain', '12288 falling embers with heat color gradient, wind turbulence, and tumble rotation.', fireRainSpec, fireRainTyped),
  fixture('strange-attractor', 'Strange Attractor', '4000-point Clifford attractor with velocity-driven color. From DEMO-PATCHES.md.', strangeAttractorSpec, strangeAttractorTyped),
  fixture('atomic-histogram', 'Atomic Histogram', 'AtomicLoadField, assignResultTo on AtomicOpField. Phase 3 walker gate.', atomicHistogramSpec, atomicHistogramTyped),
  fixture('quad-camera', 'Quad Camera', '4 cameras, 4 textures, composite. Tests render-to-texture, composite pass, texture sampling.', quadCameraSpec, quadCameraTyped),
  fixture('simplex-noise', 'Simplex Noise', '10000 dots displaced and colored by noise_simplex_2d. Tests WGSL function transplant.', simplexNoiseSpec, simplexNoiseTyped),
  fixture('depth-prepass', 'Depth Prepass', 'Depth-only pass (zero color attachments) followed by color pass reading the depth buffer.', depthPrepassSpec, depthPrepassTyped),
  fixture('mrt-split', 'MRT Split', 'Single render pass writing 2 color textures (MRT). Composite samples both.', mrtSplitSpec, mrtSplitTyped),
];
