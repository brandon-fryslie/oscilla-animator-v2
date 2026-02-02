/**
 * Smoothstep Block
 *
 * y = smoothstep(edge0, edge1, x)
 *
 * Standard S-curve remap with smooth interpolation.
 * Formula: t = clamp((x - edge0) / (edge1 - edge0), 0, 1); y = t * t * (3 - 2 * t)
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Smoothstep',
  label: 'Smoothstep',
  category: 'lens',
  description: 'y = smoothstep(edge0, edge1, x) - S-curve remap',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    edge0: { label: 'Edge 0', type: canonicalType(FLOAT), defaultValue: 0.0, exposedAsPort: false },
    edge1: { label: 'Edge 1', type: canonicalType(FLOAT), defaultValue: 1.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Smoothstep input is required');

    const edge0 = (config?.edge0 as number) ?? 0.0;
    const edge1 = (config?.edge1 as number) ?? 1.0;
    if (!isFinite(edge0) || !isFinite(edge1)) {
      throw new Error(`Smoothstep edges must be finite (got edge0=${edge0}, edge1=${edge1})`);
    }
    if (edge1 === edge0) {
      throw new Error(`Smoothstep edge0 and edge1 must differ (both are ${edge0})`);
    }
    const outType = ctx.outTypes[0];

    // t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
    const edge0Const = ctx.b.constant(floatConst(edge0), canonicalType(FLOAT));
    const edge1Const = ctx.b.constant(floatConst(edge1), canonicalType(FLOAT));

    // x - edge0
    const subFn = ctx.b.opcode(OpCode.Sub);
    const numerator = ctx.b.kernelZip([input.id, edge0Const], subFn, outType);

    // edge1 - edge0
    const denominator = ctx.b.kernelZip([edge1Const, edge0Const], subFn, outType);

    // (x - edge0) / (edge1 - edge0)
    const divFn = ctx.b.opcode(OpCode.Div);
    const ratio = ctx.b.kernelZip([numerator, denominator], divFn, outType);

    // clamp(ratio, 0, 1)
    const zeroConst = ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));
    const oneConst = ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const t = ctx.b.kernelZip([ratio, zeroConst, oneConst], clampFn, outType);

    // y = t * t * (3 - 2 * t)
    // t * t
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const tt = ctx.b.kernelZip([t, t], mulFn, outType);

    // 2 * t
    const twoConst = ctx.b.constant(floatConst(2.0), canonicalType(FLOAT));
    const twoT = ctx.b.kernelZip([twoConst, t], mulFn, outType);

    // 3 - 2 * t
    const threeConst = ctx.b.constant(floatConst(3.0), canonicalType(FLOAT));
    const threeMinusTwoT = ctx.b.kernelZip([threeConst, twoT], subFn, outType);

    // tt * (3 - 2 * t)
    const result = ctx.b.kernelZip([tt, threeMinusTwoT], mulFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
