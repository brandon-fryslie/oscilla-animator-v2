/**
 * ScaleBias Block
 *
 * y = x * scale + bias
 *
 * The most fundamental value transformation for value shaping.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'ScaleBias',
  label: 'Scale + Bias',
  category: 'lens',
  description: 'y = x * scale + bias',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  // NO adapterSpec — lenses are user-controlled only, never auto-inserted
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    scale: { label: 'Scale', type: canonicalType(FLOAT), defaultValue: 1.0, exposedAsPort: false },
    bias: { label: 'Bias', type: canonicalType(FLOAT), defaultValue: 0.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('ScaleBias input is required');

    const scale = (config?.scale as number) ?? 1.0;
    const bias = (config?.bias as number) ?? 0.0;
    if (!isFinite(scale) || !isFinite(bias)) {
      throw new Error(`ScaleBias params must be finite (got scale=${scale}, bias=${bias})`);
    }
    const outType = ctx.outTypes[0];

    // y = x * scale + bias
    const scaleConst = ctx.b.constant(floatConst(scale), canonicalType(FLOAT));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled = ctx.b.kernelZip([input.id, scaleConst], mulFn, outType);

    const biasConst = ctx.b.constant(floatConst(bias), canonicalType(FLOAT));
    const addFn = ctx.b.opcode(OpCode.Add);
    const result = ctx.b.kernelZip([scaled, biasConst], addFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
