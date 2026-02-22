/**
 * Compare Block
 *
 * Numeric comparison producing a 0/1 mask.
 */

import { registerBlock, requireConfigEnum } from '../registry';
import { canonicalType, payloadStride, cardinalityVar, FLOAT, INT, unitNone } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const COMPARE_CARD = cardinalityVar(cardinalityVarId('compare_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Compare',
    label: 'Compare',
    category: 'math',
    description: 'Compare A and B using lt/gt/eq, output 0/1 mask',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      a: { label: 'A', type: inferType(FLOAT, unitVar('compare_U'), { cardinality: COMPARE_CARD }) },
      b: { label: 'B', type: inferType(FLOAT, unitVar('compare_U'), { cardinality: COMPARE_CARD }) },
      op: {
        label: 'Op',
        type: canonicalType(INT),
        defaultValue: 'gt',
        defaultSource: defaultSourceConst(0),
        exposedAsPort: false,
        uiHint: {
          kind: 'select',
          options: [
            { value: 'gt', label: '>' },
            { value: 'lt', label: '<' },
            { value: 'eq', label: '=' },
          ],
        },
      },
    },
    outputs: {
      out: { label: 'Mask', type: canonicalType(FLOAT, unitNone(), { cardinality: COMPARE_CARD }) },
    },
    lower: ({ ctx, inputsById, config }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      if (!a || !b) throw new Error('Compare requires a and b inputs');
  
      const op = requireConfigEnum(config, 'op', ['gt', 'lt', 'eq'] as const);
      const opcode = op === 'gt' ? OpCode.Gt : op === 'lt' ? OpCode.Lt : OpCode.Eq;
  
      const outType = ctx.outTypes[0];
      const result = ctx.b.zipAuto([a.id, b.id], ctx.b.opcode(opcode), outType);
  
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
