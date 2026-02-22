/**
 * DomainWarpNoise1D Block
 *
 * Warps x by layered hash noise and returns warped coordinate.
 */

import { registerBlock, requireConfig, requireConfigInt } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, payloadStride, floatConst, cardinalityVar, FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const DOMAIN_WARP_NOISE_CARD = cardinalityVar(cardinalityVarId('domain_warp_noise_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'DomainWarpNoise1D',
  label: 'Domain Warp Noise',
  category: 'math',
  description: 'Warp x by layered noise before output',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    x: { label: 'X', type: inferType(FLOAT, unitVar('domain_warp_U'), { cardinality: DOMAIN_WARP_NOISE_CARD }) },
    amount: {
      label: 'Amount',
      type: canonicalType(FLOAT, undefined, { cardinality: DOMAIN_WARP_NOISE_CARD }),
      defaultValue: 0.3,
      defaultSource: defaultSourceConst(0.3),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 },
    },
    seed: {
      label: 'Seed',
      type: canonicalType(FLOAT, undefined, { cardinality: DOMAIN_WARP_NOISE_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
    },
    octaves: { label: 'Octaves', type: canonicalType(FLOAT), defaultValue: 3, exposedAsPort: false },
    gain: { label: 'Gain', type: canonicalType(FLOAT), defaultValue: 0.5, exposedAsPort: false },
    lacunarity: { label: 'Lacunarity', type: canonicalType(FLOAT), defaultValue: 2.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('domain_warp_U'), { cardinality: DOMAIN_WARP_NOISE_CARD }) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const x = inputsById.x;
    const amount = inputsById.amount;
    const seed = inputsById.seed;
    if (!x || !amount || !seed) throw new Error('DomainWarpNoise1D requires x, amount, and seed inputs');

    const octaves = requireConfigInt(config, 'octaves', 1, 8);
    const gain = requireConfig<number>(config, 'gain', 'number');
    const lacunarity = requireConfig<number>(config, 'lacunarity', 'number');

    const outType = ctx.outTypes[0];
    const add = ctx.b.opcode(OpCode.Add);
    const sub = ctx.b.opcode(OpCode.Sub);
    const mul = ctx.b.opcode(OpCode.Mul);
    const hash = ctx.b.opcode(OpCode.Hash);

    const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));

    let warp = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    let amplitude = 1;
    let frequency = 1;

    for (let i = 0; i < octaves; i++) {
      const amp = ctx.b.constant(floatConst(amplitude), canonicalType(FLOAT));
      const freq = ctx.b.constant(floatConst(frequency), canonicalType(FLOAT));
      const octaveSeedA = ctx.b.constant(floatConst(i * 53.13 + 11), canonicalType(FLOAT));
      const octaveSeedB = ctx.b.constant(floatConst(i * 91.71 + 7), canonicalType(FLOAT));

      const xFreq = ctx.b.zipAuto([x.id, freq], mul, outType);
      const warpFreq = ctx.b.zipAuto([warp, freq], mul, outType);
      const xWarped = ctx.b.zipAuto([xFreq, warpFreq], add, outType);
      const seededA = ctx.b.zipAuto([seed.id, octaveSeedA], add, outType);
      const seededB = ctx.b.zipAuto([seed.id, octaveSeedB], add, outType);
      const n01 = ctx.b.zipAuto([xWarped, seededA], hash, outType);
      const n11 = ctx.b.zipAuto([ctx.b.zipAuto([n01, two], mul, outType), one], sub, outType);
      const n = ctx.b.zipAuto([n11, seededB], hash, outType);
      const nCentered = ctx.b.zipAuto([ctx.b.zipAuto([n, two], mul, outType), one], sub, outType);

      const weighted = ctx.b.zipAuto([nCentered, amp], mul, outType);
      warp = ctx.b.zipAuto([warp, weighted], add, outType);

      amplitude *= gain;
      frequency *= lacunarity;
    }

    const scaledWarp = ctx.b.zipAuto([warp, amount.id], mul, outType);
    const result = ctx.b.zipAuto([x.id, scaledWarp], add, outType);

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
