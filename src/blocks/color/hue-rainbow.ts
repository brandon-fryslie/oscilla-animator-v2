/**
 * HueRainbow Block
 *
 * Creates a cycling rainbow color from a phase/time input (0→1).
 * Maps input t to full hue cycle (360°), with fixed saturation and lightness.
 *
 * This block is pure and can be invoked as a macro by other blocks
 * (e.g., DefaultSource for color-typed ports).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitTurns, unitHsl } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'HueRainbow',
  label: 'Hue Rainbow',
  category: 'color',
  description: 'Creates a cycling rainbow color from phase input (0→1)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure', // Pure block for macro expansion
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    t: {
      label: 'Phase',
      type: canonicalType(FLOAT, unitTurns()),
      defaultSource: defaultSourceConst(0.0),
    },
  },
  outputs: {
    out: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  lower: ({ ctx, inputsById }) => {
    const tInput = inputsById.t;
    if (!tInput) {
      throw new Error('HueRainbow requires input t (phase)');
    }

    const outType = ctx.outTypes[0];
    // Derive intermediate float type from resolved output extent (preserves cardinality)
    const intermediateFloat = {
      payload: FLOAT,
      unit: unitTurns(),
      extent: outType.extent,
    };

    // Fixed saturation (~0.8), lightness (~0.5), alpha (1.0)
    const sat = ctx.b.constant({ kind: 'float', value: 0.8 }, intermediateFloat);
    const light = ctx.b.constant({ kind: 'float', value: 0.5 }, intermediateFloat);
    const alpha = ctx.b.constant({ kind: 'float', value: 1.0 }, intermediateFloat);

    // Construct HSL color (t as hue, fixed s/l/a)
    // Output is HSL - conversion to RGB happens at render boundary (single enforcer)
    const hsl = ctx.b.construct([tInput.id, sat, light, alpha], outType);

    // Pure block: no slot allocation (orchestrator handles it)
    return {
      outputsById: {
        out: { id: hsl, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
