/**
 * BipolarToUnipolar Adapter Block
 *
 * Convert bipolar [-1,1] to unipolar [0,1].
 * Formula: u = (b + 1) / 2
 */

import { registerBlock } from '../registry';
import { canonicalType, unitNone, payloadStride, floatConst, contractClamp01, contractClamp11 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const BIPOLAR_TO_UNIPOLAR_CARD = cardinalityVar(cardinalityVarId('bipolar_to_unipolar_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_BipolarToUnipolar',
    label: 'Bipolar → Unipolar',
    category: 'adapter',
    description: 'Convert bipolar [-1,1] to unipolar [0,1]: u = (b + 1) / 2',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: FLOAT, unit: { kind: 'none' }, contract: { kind: 'clamp11' }, extent: 'any' },
      to: { payload: FLOAT, unit: { kind: 'none' }, contract: { kind: 'clamp01' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Bipolar [-1,1] → unipolar [0,1]',
      purity: 'pure',
      stability: 'stable',
      priority: -10, // Higher priority than general Clamp01 adapter (more specific conversion)
    },
    inputs: {
      in: { label: 'In', type: canonicalType(FLOAT, unitNone(), { cardinality: BIPOLAR_TO_UNIPOLAR_CARD }, contractClamp11()) },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, unitNone(), { cardinality: BIPOLAR_TO_UNIPOLAR_CARD }, contractClamp01()) },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      if (!input) throw new Error('Adapter_BipolarToUnipolar: input is required');
  
      const outType = ctx.outTypes[0];
  
      // u = (b + 1) / 2 = b * 0.5 + 0.5
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT, unitNone()));
      const halfConst = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT, unitNone()));
  
      const addFn = ctx.b.opcode(OpCode.Add);
      const added = zipAuto([input.id, one], addFn, outType, ctx.b);
  
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const result = zipAuto([added, halfConst], mulFn, outType, ctx.b);
  
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
