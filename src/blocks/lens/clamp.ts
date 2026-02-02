/**
 * Clamp Block
 *
 * y = clamp(x, min, max)
 *
 * Bounds enforcement for value ranges.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Clamp',
  label: 'Clamp',
  category: 'lens',
  description: 'y = clamp(x, min, max) - bounds enforcement',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    min: { label: 'Min', type: canonicalType(FLOAT), defaultValue: 0.0, exposedAsPort: false },
    max: { label: 'Max', type: canonicalType(FLOAT), defaultValue: 1.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Clamp input is required');

    const min = (config?.min as number) ?? 0.0;
    const max = (config?.max as number) ?? 1.0;
    const outType = ctx.outTypes[0];

    // clamp(x, min, max)
    const minConst = ctx.b.constant(floatConst(min), canonicalType(FLOAT));
    const maxConst = ctx.b.constant(floatConst(max), canonicalType(FLOAT));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const result = ctx.b.kernelZip([input.id, minConst, maxConst], clampFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
