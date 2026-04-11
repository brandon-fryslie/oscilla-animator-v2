/**
 * Typed DSL — verify all typed fixtures compile to valid PipelineInstallPayloads.
 *
 * Each fixture is imported as a real TypeScript module (statically typed),
 * then validated at runtime against the Zod schema from boundary-contract.ts.
 * Visual validation (rendering) is a separate gate via screenshot scripts.
 */

import { describe, test, expect } from 'vitest';
import { PipelineInstallPayloadSchema } from '../../rust/boundary-contract';

// --- Batch 1: original steel thread + first migration wave ---
import { instancedWriteTyped } from '../../rust/fixtures/typed/instanced-write';
import { varyingGradientTyped } from '../../rust/fixtures/typed/varying-gradient';
import { hashColorTyped } from '../../rust/fixtures/typed/hash-color';
import { spirographTraceTyped } from '../../rust/fixtures/typed/spirograph-trace';
import { sdfCircleTyped } from '../../rust/fixtures/typed/sdf-circle';
import { scalarAccumulatorTyped } from '../../rust/fixtures/typed/scalar-accumulator';
import { conditionalRingTyped } from '../../rust/fixtures/typed/conditional-ring';
import { bitfieldPaletteTyped } from '../../rust/fixtures/typed/bitfield-palette';
import { searchBreakTyped } from '../../rust/fixtures/typed/search-break';
import { forLoopGradientTyped } from '../../rust/fixtures/typed/for-loop-gradient';
import { mathZooTyped } from '../../rust/fixtures/typed/math-zoo';
import { constantSpiralTyped } from '../../rust/fixtures/typed/constant-spiral';

// --- Batch 2: remaining 17 fixtures ---
import { textureReadwriteTyped } from '../../rust/fixtures/typed/texture-readwrite';
import { vectorFieldTyped } from '../../rust/fixtures/typed/vector-field';
import { sampledTextureTyped } from '../../rust/fixtures/typed/sampled-texture';
import { simplexNoiseTyped } from '../../rust/fixtures/typed/simplex-noise';
import { atomicBoidsTyped } from '../../rust/fixtures/typed/atomic-boids';
import { atomicHistogramTyped } from '../../rust/fixtures/typed/atomic-histogram';
import { depthPrepassTyped } from '../../rust/fixtures/typed/depth-prepass';
import { mrtSplitTyped } from '../../rust/fixtures/typed/mrt-split';
import { multiDomainTyped } from '../../rust/fixtures/typed/multi-domain';
import { paletteLookupTyped } from '../../rust/fixtures/typed/palette-lookup';
import { quadCameraTyped } from '../../rust/fixtures/typed/quad-camera';
import { textureBlurTyped } from '../../rust/fixtures/typed/texture-blur';
import { auroraFieldTyped } from '../../rust/fixtures/typed/aurora-field';
import { fireRainTyped } from '../../rust/fixtures/typed/fire-rain';
import { galaxySwirlTyped } from '../../rust/fixtures/typed/galaxy-swirl';
import { jellyfishBloomTyped } from '../../rust/fixtures/typed/jellyfish-bloom';
import { strangeAttractorTyped } from '../../rust/fixtures/typed/strange-attractor';

const ALL_FIXTURES: [string, unknown][] = [
  // Batch 1
  ['instanced-write', instancedWriteTyped],
  ['varying-gradient', varyingGradientTyped],
  ['hash-color', hashColorTyped],
  ['spirograph-trace', spirographTraceTyped],
  ['sdf-circle', sdfCircleTyped],
  ['scalar-accumulator', scalarAccumulatorTyped],
  ['conditional-ring', conditionalRingTyped],
  ['bitfield-palette', bitfieldPaletteTyped],
  ['search-break', searchBreakTyped],
  ['for-loop-gradient', forLoopGradientTyped],
  ['math-zoo', mathZooTyped],
  ['constant-spiral', constantSpiralTyped],
  // Batch 2
  ['texture-readwrite', textureReadwriteTyped],
  ['vector-field', vectorFieldTyped],
  ['sampled-texture', sampledTextureTyped],
  ['simplex-noise', simplexNoiseTyped],
  ['atomic-boids', atomicBoidsTyped],
  ['atomic-histogram', atomicHistogramTyped],
  ['depth-prepass', depthPrepassTyped],
  ['mrt-split', mrtSplitTyped],
  ['multi-domain', multiDomainTyped],
  ['palette-lookup', paletteLookupTyped],
  ['quad-camera', quadCameraTyped],
  ['texture-blur', textureBlurTyped],
  ['aurora-field', auroraFieldTyped],
  ['fire-rain', fireRainTyped],
  ['galaxy-swirl', galaxySwirlTyped],
  ['jellyfish-bloom', jellyfishBloomTyped],
  ['strange-attractor', strangeAttractorTyped],
];

describe('typed DSL fixtures', () => {
  for (const [name, payload] of ALL_FIXTURES) {
    test(`${name}: validates against PipelineInstallPayload schema`, () => {
      const result = PipelineInstallPayloadSchema.safeParse(payload);
      if (!result.success) {
        const issues = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
        expect.fail(`Schema validation failed for ${name}:\n${issues}`);
      }
    });
  }
});
