/**
 * NoisyBroadcast Block
 *
 * Broadcast a one-cardinality float to field cardinality and add deterministic
 * per-instance noise.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Field output cardinality behavior is declared on CT/ICT.
const NOISY_BROADCAST_OUT_CARD = cardinalityVar(cardinalityVarId('noisy_broadcast_out'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});
const NOISY_BROADCAST_IN_CARD = cardinalityVar(cardinalityVarId('noisy_broadcast_in'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'NoisyBroadcast',
    label: 'Noisy Broadcast',
    category: 'field',
    description: 'Broadcast a scalar to field cardinality and add deterministic per-instance noise',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      value: { label: 'Value', type: inferType(FLOAT, unitVar('noisy_broadcast_u'), { cardinality: NOISY_BROADCAST_IN_CARD }) },
      amount: {
        label: 'Noise Amount',
        type: inferType(FLOAT, unitVar('noisy_broadcast_u'), { cardinality: NOISY_BROADCAST_IN_CARD }),
        defaultValue: 0.1,
        defaultSource: defaultSourceConst(0.1),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 },
      },
      seed: {
        label: 'Seed',
        type: canonicalType(FLOAT, unitVar('noisy_broadcast_u'), { cardinality: NOISY_BROADCAST_IN_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 0, max: 1000, step: 1 },
      },
    },
    outputs: {
      out: {
        label: 'Out',
        type: inferType(FLOAT, unitVar('noisy_broadcast_u'), { cardinality: NOISY_BROADCAST_OUT_CARD }),
      },
    },
    lower: ({ ctx, inputsById }) => {
      const value = inputsById.value;
      const amount = inputsById.amount;
      const seed = inputsById.seed;
      if (!value) throw new Error('NoisyBroadcast value input is required');
      if (!amount) throw new Error('NoisyBroadcast amount input is required');
      if (!seed) throw new Error('NoisyBroadcast seed input is required');
  
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...canonicalType(FLOAT, outType.unit), extent: outType.extent };
  
      const indexField = ctx.b.intrinsic('normalizedIndex', floatFieldType);
  
      const hashFn = ctx.b.opcode(OpCode.Hash);
      const subFn = ctx.b.opcode(OpCode.Sub);
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const addFn = ctx.b.opcode(OpCode.Add);
  
      // [LAW:dataflow-not-control-flow] Cardinality alignment is expressed
      // through zipAuto promotion, never ad-hoc raw broadcast calls.
      const noise01 = zipAuto([indexField, seed.id], hashFn, floatFieldType, ctx.b);
      const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT, outType.unit));
      const centeredNoise = zipAuto([noise01, half], subFn, floatFieldType, ctx.b);
  
      const scaledNoise = zipAuto([centeredNoise, amount.id], mulFn, outType, ctx.b);
      const outId = zipAuto([value.id, scaledNoise], addFn, outType, ctx.b);
  
      return {
        outputsById: {
          out: { id: outId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
        instanceContext: ctx.inferredInstance,
      };
    },
  });
}
