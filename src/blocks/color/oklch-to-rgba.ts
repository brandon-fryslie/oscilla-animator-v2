/**
 * OklchToRgba Block (Adapter)
 *
 * Convert color from OKLCH to RGBA color space.
 * Alpha passes through unchanged.
 * Uses the oklchToRgb ValueExpr intrinsic.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitOklch, unitRgba01 } from '../../core/canonical-types';
import { COLOR } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const OKLCH_TO_RGBA_CARD = cardinalityVar(cardinalityVarId('oklch_to_rgba_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_OklchToRgba',
    label: 'OKLCH → RGBA',
    category: 'adapter',
    description: 'Convert color from OKLCH to RGBA color space',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: COLOR, unit: { kind: 'color', unit: 'oklch' }, extent: 'any' },
      to: { payload: COLOR, unit: { kind: 'color', unit: 'rgba01' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'OKLCH → RGBA color space conversion',
      purity: 'pure',
      stability: 'stable',
    },
    inputs: {
      in: { label: 'OKLCH', type: canonicalType(COLOR, unitOklch(), { cardinality: OKLCH_TO_RGBA_CARD }) },
    },
    outputs: {
      out: { label: 'RGBA', type: canonicalType(COLOR, unitRgba01(), { cardinality: OKLCH_TO_RGBA_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const input = inputsById.in;
      if (!input) throw new Error('OklchToRgba requires input');
  
      const outType = ctx.outTypes[0];
  
      // Use the oklchToRgb structural intrinsic
      const result = ctx.b.oklchToRgb(input.id, outType);
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
