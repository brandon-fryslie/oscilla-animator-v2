/**
 * Construct Block
 *
 * Construct a vec3 payload from three scalar components.
 * This is a type-CHANGING lens (float, float, float → vec3).
 *
 * Example: construct(1.0, 2.0, 3.0) → vec3(1, 2, 3)
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';

registerBlock({
  type: 'Construct',
  label: 'Construct Vec3',
  category: 'lens',
  description: 'Construct a vec3 from three scalar components (x, y, z)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    x: { label: 'X', type: canonicalType(FLOAT), defaultValue: 0.0 },
    y: { label: 'Y', type: canonicalType(FLOAT), defaultValue: 0.0 },
    z: { label: 'Z', type: canonicalType(FLOAT), defaultValue: 0.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(VEC3) },
  },
  lower: ({ inputsById, ctx }) => {
    const xInput = inputsById.x;
    const yInput = inputsById.y;
    const zInput = inputsById.z;

    if (!xInput || !yInput || !zInput) {
      throw new Error('Construct requires all inputs (x, y, z)');
    }

    const outType = ctx.outTypes[0];

    // Use IR construct operation to pack components
    const result = ctx.b.construct([xInput.id, yInput.id, zInput.id], outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
