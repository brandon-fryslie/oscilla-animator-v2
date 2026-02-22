/**
 * Remap Block
 *
 * Remap input value from one range to another.
 */

import { registerBlock, requireConfigEnum } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, payloadStride, floatConst, unitNone, cardinalityVar, FLOAT, INT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const REMAP_CARD = cardinalityVar(cardinalityVarId('remap_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Remap',
  label: 'Remap',
  category: 'math',
  description: 'Map value from [inMin,inMax] into [outMin,outMax]',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('remap_in_U'), { cardinality: REMAP_CARD }) },
    inMin: {
      label: 'In Min',
      type: inferType(FLOAT, unitVar('remap_in_U'), { cardinality: REMAP_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
    },
    inMax: {
      label: 'In Max',
      type: inferType(FLOAT, unitVar('remap_in_U'), { cardinality: REMAP_CARD }),
      defaultValue: 1,
      defaultSource: defaultSourceConst(1),
      exposedAsPort: true,
    },
    outMin: {
      label: 'Out Min',
      type: inferType(FLOAT, unitVar('remap_out_U'), { cardinality: REMAP_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
    },
    outMax: {
      label: 'Out Max',
      type: inferType(FLOAT, unitVar('remap_out_U'), { cardinality: REMAP_CARD }),
      defaultValue: 1,
      defaultSource: defaultSourceConst(1),
      exposedAsPort: true,
    },
    mode: {
      label: 'Mode',
      type: canonicalType(INT),
      defaultValue: 'clamp',
      defaultSource: defaultSourceConst(1),
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          { value: 'unclamped', label: 'Unclamped' },
          { value: 'clamp', label: 'Clamp' },
          { value: 'wrap', label: 'Wrap' },
        ],
      },
    },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('remap_out_U'), { cardinality: REMAP_CARD }) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const input = inputsById.in;
    const inMin = inputsById.inMin;
    const inMax = inputsById.inMax;
    const outMin = inputsById.outMin;
    const outMax = inputsById.outMax;
    if (!input || !inMin || !inMax || !outMin || !outMax) {
      throw new Error('Remap requires in, inMin, inMax, outMin, and outMax inputs');
    }

    const mode = requireConfigEnum(config, 'mode', ['unclamped', 'clamp', 'wrap'] as const);

    const outType = ctx.outTypes[0];
    const floatType = canonicalType(FLOAT, unitNone());

    const sub = ctx.b.opcode(OpCode.Sub);
    const add = ctx.b.opcode(OpCode.Add);
    const mul = ctx.b.opcode(OpCode.Mul);
    const div = ctx.b.opcode(OpCode.Div);
    const max = ctx.b.opcode(OpCode.Max);
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const wrap01 = ctx.b.opcode(OpCode.Wrap01);

    const eps = ctx.b.constant(floatConst(1e-6), floatType);
    const zero = ctx.b.constant(floatConst(0), floatType);
    const one = ctx.b.constant(floatConst(1), floatType);

    const inRange = ctx.b.zipAuto([inMax.id, inMin.id], sub, outType);
    const safeInRange = ctx.b.zipAuto([inRange, eps], max, outType);
    const inOffset = ctx.b.zipAuto([input.id, inMin.id], sub, outType);
    const norm = ctx.b.zipAuto([inOffset, safeInRange], div, outType);

    const normMode =
      mode === 'clamp'
        ? ctx.b.zipAuto([norm, zero, one], clamp, outType)
        : mode === 'wrap'
          ? ctx.b.mapAuto(norm, wrap01, outType)
          : norm;

    const outRange = ctx.b.zipAuto([outMax.id, outMin.id], sub, outType);
    const scaled = ctx.b.zipAuto([normMode, outRange], mul, outType);
    const result = ctx.b.zipAuto([outMin.id, scaled], add, outType);

    return {
      outputsById: {
        out: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
