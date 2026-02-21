/**
 * Extract Block
 *
 * Extract a single scalar component from a vec3 payload.
 * This is a type-CHANGING lens (vec3 → float).
 *
 * Example: extract(vec3(1,2,3), component=1) → 2.0
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const EXTRACT_CARD = cardinalityVar(cardinalityVarId('extract_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Extract',
  label: 'Extract Component',
  category: 'lens',
  description: 'Extract a single scalar component from vec3 (x=0, y=1, z=2)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    in: { label: 'In', type: canonicalType(VEC3, undefined, { cardinality: EXTRACT_CARD }) },
    component: {
      label: 'Component',
      type: canonicalType(FLOAT),
      defaultValue: 0,
      exposedAsPort: false,
    },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, undefined, { cardinality: EXTRACT_CARD }) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Extract: in is required');

    // Component index is compile-time only (IR extract takes a literal integer).
    // Read from config — defaultValue in block def ensures it's always present.
    const componentIndex = config?.component;
    if (typeof componentIndex !== 'number' || componentIndex < 0 || componentIndex > 2 || !Number.isInteger(componentIndex)) {
      throw new Error(`Extract component must be 0, 1, or 2 (got ${componentIndex})`);
    }

    const outType = ctx.outTypes[0];

    // Use IR extract operation
    const result = ctx.b.extract(input.id, componentIndex, outType);

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
