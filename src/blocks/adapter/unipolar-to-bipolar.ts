/**
 * UnipolarToBipolar Adapter Block
 *
 * Convert unipolar [0,1] to bipolar [-1,1].
 * Formula: b = u * 2 - 1
 */

import { registerBlock } from '../registry';
import { canonicalType, unitNone, payloadStride, floatConst, contractClamp01, contractClamp11 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const UNIPOLAR_TO_BIPOLAR_CARD = cardinalityVar(cardinalityVarId('unipolar_to_bipolar_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_UnipolarToBipolar',
    label: 'Unipolar → Bipolar',
    category: 'adapter',
    description: 'Convert unipolar [0,1] to bipolar [-1,1]: b = u * 2 - 1',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: FLOAT, unit: { kind: 'none' }, contract: { kind: 'clamp01' }, extent: 'any' },
      to: { payload: FLOAT, unit: { kind: 'none' }, contract: { kind: 'clamp11' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Unipolar [0,1] → bipolar [-1,1]',
      purity: 'pure',
      stability: 'stable',
      priority: -10, // Higher priority than general Clamp11 adapter (more specific conversion)
    },
    inputs: {
      in: { label: 'In', type: canonicalType(FLOAT, unitNone(), { cardinality: UNIPOLAR_TO_BIPOLAR_CARD }, contractClamp01()) },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, unitNone(), { cardinality: UNIPOLAR_TO_BIPOLAR_CARD }, contractClamp11()) },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      if (!input) throw new Error('Adapter_UnipolarToBipolar: input is required');
  
      const outType = ctx.outTypes[0];
  
      // b = u * 2 - 1
      const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT, unitNone()));
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT, unitNone()));
  
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const scaled = zipAuto([input.id, two], mulFn, outType, ctx.b);
  
      const subFn = ctx.b.opcode(OpCode.Sub);
      const result = zipAuto([scaled, one], subFn, outType, ctx.b);
  
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
}
