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

registerBlock({
  type: 'Extract',
  label: 'Extract Component',
  category: 'lens',
  description: 'Extract a single scalar component from vec3 (x=0, y=1, z=2)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(VEC3) },
    component: {
      label: 'Component',
      type: canonicalType(FLOAT),
      defaultValue: 0,
      exposedAsPort: false
    },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Extract input is required');

    const componentIndex = (config?.component as number) ?? 0;

    // Validate component index (0, 1, or 2 for vec3)
    if (componentIndex < 0 || componentIndex > 2 || !Number.isInteger(componentIndex)) {
      throw new Error(`Extract component must be 0, 1, or 2 (got ${componentIndex})`);
    }

    const outType = ctx.outTypes[0];

    // Use IR extract operation
    const result = ctx.b.extract(input.id, componentIndex, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
