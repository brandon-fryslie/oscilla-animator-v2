/**
 * Construct Block
 *
 * Construct a vec3 payload from three scalar components.
 * This is a type-CHANGING lens (float, float, float → vec3).
 *
 * Example: construct(1.0, 2.0, 3.0) → vec3(1, 2, 3)
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst, withInstance } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { withoutContract } from '../lower-utils';

registerBlock({
  type: 'Construct',
  label: 'Construct Vec3',
  category: 'lens',
  description: 'Construct a vec3 from three scalar components (x, y, z)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
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

    const baseOutType = ctx.outTypes[0];
    const xCard = requireInst(xInput.type.extent.cardinality, 'cardinality');
    const yCard = requireInst(yInput.type.extent.cardinality, 'cardinality');
    const zCard = requireInst(zInput.type.extent.cardinality, 'cardinality');
    const fieldInstance =
      xCard.kind === 'many' ? xCard.instance :
      yCard.kind === 'many' ? yCard.instance :
      zCard.kind === 'many' ? zCard.instance :
      null;
    const outType = fieldInstance ? withInstance(baseOutType, fieldInstance) : baseOutType;

    const xId = (() => {
      if (!fieldInstance) return xInput.id;
      if (xCard.kind === 'many') {
        if (xCard.instance.instanceId !== fieldInstance.instanceId || xCard.instance.domainTypeId !== fieldInstance.domainTypeId) {
          throw new Error('Construct: x field instance does not match');
        }
        return xInput.id;
      }
      const xFieldType = withInstance(withoutContract(xInput.type), fieldInstance);
      return ctx.b.broadcast(xInput.id, xFieldType);
    })();

    const yId = (() => {
      if (!fieldInstance) return yInput.id;
      if (yCard.kind === 'many') {
        if (yCard.instance.instanceId !== fieldInstance.instanceId || yCard.instance.domainTypeId !== fieldInstance.domainTypeId) {
          throw new Error('Construct: y field instance does not match');
        }
        return yInput.id;
      }
      const yFieldType = withInstance(withoutContract(yInput.type), fieldInstance);
      return ctx.b.broadcast(yInput.id, yFieldType);
    })();

    const zId = (() => {
      if (!fieldInstance) return zInput.id;
      if (zCard.kind === 'many') {
        if (zCard.instance.instanceId !== fieldInstance.instanceId || zCard.instance.domainTypeId !== fieldInstance.domainTypeId) {
          throw new Error('Construct: z field instance does not match');
        }
        return zInput.id;
      }
      const zFieldType = withInstance(withoutContract(zInput.type), fieldInstance);
      return ctx.b.broadcast(zInput.id, zFieldType);
    })();

    // Use IR construct operation to pack components
    const result = ctx.b.construct([xId, yId, zId], outType);

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
