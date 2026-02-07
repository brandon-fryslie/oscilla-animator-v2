/**
 * PhaseToDegrees Block
 *
 * Convert phase [0,1) to degrees [0,360).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, unitDegrees, payloadStride, floatConst, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_PhaseToDegrees',
  label: 'Phase → Degrees',
  category: 'adapter',
  description: 'Convert phase [0,1) to degrees [0,360)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'turns' }, contract: { kind: 'wrap01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'degrees' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Phase [0,1) → degrees [0,360)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitDegrees()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter block input is required');

    const outType = ctx.outTypes[0];
    const threeSixty = ctx.b.constant(floatConst(360), canonicalType(FLOAT, unitDegrees()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const degrees = ctx.b.kernelZip([input.id, threeSixty], mulFn, outType);
    return {
      outputsById: {
        out: { id: degrees, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
