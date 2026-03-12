/**
 * NoisyBroadcast Block
 *
 * Broadcast a one-cardinality float to field cardinality and add deterministic
 * per-instance noise.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar, type InferenceUnitType } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Field output cardinality behavior is declared on CT/ICT.
const NOISY_BROADCAST_OUT_CARD = cardinalityVar(cardinalityVarId('noisy_broadcast_out'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});
const NOISY_BROADCAST_UNIT = unitVar('noisy_broadcast_u');
const NOISY_BROADCAST_INPUT_TYPE = inferType(FLOAT, NOISY_BROADCAST_UNIT, {
  cardinality: cardinalityVar(cardinalityVarId('noisy_broadcast_in'), {
    relation: 'promoteToMany',
    acceptance: 'oneOrMany',
    instanceBinding: 'inherit',
  }),
});
const NOISY_BROADCAST_OUTPUT_TYPE = inferType(FLOAT, NOISY_BROADCAST_UNIT, {
  cardinality: NOISY_BROADCAST_OUT_CARD,
});

function sliderUiHint(min: number, max: number, step: number): { kind: 'slider'; min: number; max: number; step: number } {
  return { kind: 'slider', min, max, step };
}

function requireInput<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`NoisyBroadcast ${label} input is required`);
  }
  return value;
}

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
      value: { label: 'Value', type: NOISY_BROADCAST_INPUT_TYPE },
      amount: {
        label: 'Noise Amount',
        type: NOISY_BROADCAST_INPUT_TYPE,
        defaultValue: 0.1,
        defaultSource: defaultSourceConst(0.1),
        exposedAsPort: true,
        uiHint: sliderUiHint(0, 2, 0.01),
      },
      seed: {
        label: 'Seed',
        type: NOISY_BROADCAST_INPUT_TYPE,
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        exposedAsPort: true,
        uiHint: sliderUiHint(0, 1000, 1),
      },
    },
    outputs: {
      out: {
        label: 'Out',
        type: NOISY_BROADCAST_OUTPUT_TYPE,
      },
    },
    lower: ({ ctx, inputsById }) => {
      // [LAW:single-enforcer] Required-input invariants are enforced at the
      // compiler/orchestrator boundary; lowering consumes validated inputs.
      const value = inputsById.value!;
      const amount = inputsById.amount!;
      const seed = inputsById.seed!;

      const outType = ctx.outTypes[0];
      const outputUnit = outType.unit as InferenceUnitType;
      if (outputUnit.kind === 'var') {
        throw new Error('NoisyBroadcast: output unit must be resolved before lowering');
      }
      const floatFieldType = { ...canonicalType(FLOAT, outputUnit), extent: outType.extent };


      const indexField = ctx.b.intrinsic('normalizedIndex', floatFieldType);
      const zipHash = ctx.b.opcode(OpCode.Hash);
      const zipSub = ctx.b.opcode(OpCode.Sub);
      const zipMul = ctx.b.opcode(OpCode.Mul);
      const zipAdd = ctx.b.opcode(OpCode.Add);

      // [LAW:dataflow-not-control-flow] Cardinality alignment is expressed
      // through zipAuto promotion, never ad-hoc raw broadcast calls.
      const noise01 = zipAuto([indexField, seed.id], zipHash, floatFieldType, ctx.b);
      const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT, outType.unit));
      const centeredNoise = zipAuto([noise01, half], zipSub, floatFieldType, ctx.b);
      const scaledNoise = zipAuto([centeredNoise, amount.id], zipMul, outType, ctx.b);
      const outId = zipAuto([value.id, scaledNoise], zipAdd, outType, ctx.b);

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
