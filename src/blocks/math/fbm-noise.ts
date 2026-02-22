/**
 * FbmNoise1D Block
 *
 * Fractal Brownian motion from hash-noise octaves.
 */

import { registerBlock, requireConfig, requireConfigInt } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, payloadStride, floatConst, cardinalityVar, FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const FBM_NOISE_CARD = cardinalityVar(cardinalityVarId('fbm_noise_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'FbmNoise1D',
    label: 'FBM Noise',
    category: 'math',
    description: 'Fractal Brownian motion 1D noise (hash-octave based)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      x: { label: 'X', type: canonicalType(FLOAT, undefined, { cardinality: FBM_NOISE_CARD }) },
      seed: {
        label: 'Seed',
        type: canonicalType(FLOAT, undefined, { cardinality: FBM_NOISE_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        exposedAsPort: true,
      },
      octaves: { label: 'Octaves', type: canonicalType(FLOAT), defaultValue: 4, exposedAsPort: false },
      gain: { label: 'Gain', type: canonicalType(FLOAT), defaultValue: 0.5, exposedAsPort: false },
      lacunarity: { label: 'Lacunarity', type: canonicalType(FLOAT), defaultValue: 2.0, exposedAsPort: false },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, undefined, { cardinality: FBM_NOISE_CARD }) },
    },
    lower: ({ ctx, inputsById, config }) => {
      const x = inputsById.x;
      const seed = inputsById.seed;
      if (!x || !seed) throw new Error('FbmNoise1D requires x and seed inputs');
  
      const octaves = requireConfigInt(config, 'octaves', 1, 8);
      const gain = requireConfig<number>(config, 'gain', 'number');
      const lacunarity = requireConfig<number>(config, 'lacunarity', 'number');
  
      const outType = ctx.outTypes[0];
      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);
      const div = ctx.b.opcode(OpCode.Div);
      const hash = ctx.b.opcode(OpCode.Hash);
  
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));
      let sum = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      let norm = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
  
      let amplitude = 1;
      let frequency = 1;
  
      for (let i = 0; i < octaves; i++) {
        const amp = ctx.b.constant(floatConst(amplitude), canonicalType(FLOAT));
        const freq = ctx.b.constant(floatConst(frequency), canonicalType(FLOAT));
        const octaveSeed = ctx.b.constant(floatConst(i * 131.17), canonicalType(FLOAT));
  
        const xFreq = ctx.b.zipAuto([x.id, freq], mul, outType);
        const seeded = ctx.b.zipAuto([seed.id, octaveSeed], add, outType);
        const n01 = ctx.b.zipAuto([xFreq, seeded], hash, outType);
        const n11 = ctx.b.zipAuto([ctx.b.zipAuto([n01, two], mul, outType), one], sub, outType);
  
        const weighted = ctx.b.zipAuto([n11, amp], mul, outType);
        sum = ctx.b.zipAuto([sum, weighted], add, outType);
        norm = ctx.b.zipAuto([norm, amp], add, outType);
  
        amplitude *= gain;
        frequency *= lacunarity;
      }
  
      const result = ctx.b.zipAuto([sum, norm], div, outType);
  
      return {
        outputsById: {
          out: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
