/**
 * HueShift Block
 *
 * Shift hue by an offset, preserving s/l/a.
 * shift is in "turns" (1.0 = full cycle).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitNone } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { withoutContract, zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'HueShift',
  label: 'Hue Shift',
  category: 'color',
  description: 'Shift hue by an offset with wrapping, preserving s/l/a',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
    shift: { label: 'Shift', type: canonicalType(FLOAT, unitNone()), defaultSource: defaultSourceConst(0.0) },
  },
  outputs: {
    out: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  lower: ({ ctx, inputsById }) => {
    const colorInput = inputsById.in;
    const shiftInput = inputsById.shift;
    if (!colorInput || !shiftInput) throw new Error('HueShift requires color and shift inputs');

    const outType = ctx.outTypes[0];
    // Derive intermediate float type from resolved output extent (preserves cardinality)
    const intermediateFloat = withoutContract({
      payload: FLOAT,
      unit: unitNone(),
      extent: outType.extent,
    });

    // Extract channels
    const h = ctx.b.extract(colorInput.id, 0, intermediateFloat);
    const s = ctx.b.extract(colorInput.id, 1, intermediateFloat);
    const l = ctx.b.extract(colorInput.id, 2, intermediateFloat);
    const a = ctx.b.extract(colorInput.id, 3, intermediateFloat);

    // h2 = wrap01(h + shift)
    const addFn = ctx.b.opcode(OpCode.Add);
    const wrap01 = ctx.b.opcode(OpCode.Wrap01);
    const hShifted = zipAuto([h, shiftInput.id], addFn, intermediateFloat, ctx.b);
    const hWrapped = mapAuto(hShifted, wrap01, intermediateFloat, ctx.b);

    // Reconstruct with shifted hue
    const result = ctx.b.construct([hWrapped, s, l, a], outType);
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
