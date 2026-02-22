/**
 * DegreesToRadians Block
 *
 * Convert degrees to radians.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitDegrees, unitNone, unitRadians, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const DEGREES_TO_RADIANS_CARD = cardinalityVar(cardinalityVarId('degrees_to_radians_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_DegreesToRadians',
    label: 'Degrees → Radians',
    category: 'adapter',
    description: 'Convert degrees to radians',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: FLOAT, unit: { kind: 'angle', unit: 'degrees' }, extent: 'any' },
      to: { payload: FLOAT, unit: { kind: 'angle', unit: 'radians' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Degrees → radians',
      purity: 'pure',
      stability: 'stable',
    },
    inputs: {
      in: { label: 'In', type: canonicalType(FLOAT, unitDegrees(), { cardinality: DEGREES_TO_RADIANS_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, unitRadians(), { cardinality: DEGREES_TO_RADIANS_CARD }) },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      if (!input) throw new Error('Lens block input is required');
  
      const outType = ctx.outTypes[0];
      const factor = ctx.b.constant(floatConst(0.017453292519943295), canonicalType(FLOAT, unitNone())); // π/180
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const radians = zipAuto([input.id, factor], mulFn, outType, ctx.b);
      return {
        outputsById: {
          out: { id: radians, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
      };
    },
  });
}
