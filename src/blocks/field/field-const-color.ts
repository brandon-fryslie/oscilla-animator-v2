/**
 * FieldConstColor Block
 *
 * Broadcasts a constant color to all instances in a field.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, floatConst, requireInst, payloadStride, unitScalar, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';

registerBlock({
  type: 'FieldConstColor',
  label: 'Constant Color (Field)',
  category: 'color',
  description: 'Broadcasts a constant color to all instances in a field. Produces Field<color>.',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      elements: ALL_CONCRETE_PAYLOADS,
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    elements: { label: 'Elements', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    r: { label: 'Red', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultValue: 1.0, exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    g: { label: 'Green', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultValue: 1.0, exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    b: { label: 'Blue', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultValue: 1.0, exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultValue: 1.0, exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    color: { label: 'Color', type: canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('FieldConstColor requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('FieldConstColor requires instance context from upstream Array block');
    }

    const colorType = ctx.outTypes[0];

    // Get r, g, b, a as signals (using defaults if not connected)
    const rSig = (inputsById.r && 'type' in inputsById.r && requireInst(inputsById.r.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.r.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()));
    const gSig = (inputsById.g && 'type' in inputsById.g && requireInst(inputsById.g.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.g.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()));
    const bSig = (inputsById.b && 'type' in inputsById.b && requireInst(inputsById.b.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.b.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()));
    const aSig = (inputsById.a && 'type' in inputsById.a && requireInst(inputsById.a.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.a.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()));

    // Build a scalar float field type matching the instance extent
    const floatFieldType = canonicalField(FLOAT, { kind: 'scalar' }, { instanceId, domainTypeId: makeDomainTypeId('default') });

    // Broadcast each scalar signal to field, then construct color
    const rField = ctx.b.broadcast(rSig, floatFieldType);
    const gField = ctx.b.broadcast(gSig, floatFieldType);
    const bField = ctx.b.broadcast(bSig, floatFieldType);
    const aField = ctx.b.broadcast(aSig, floatFieldType);
    const result = ctx.b.construct([rField, gField, bField, aField], colorType);

    return {
      outputsById: {
        color: { id: result, slot: undefined, type: colorType, stride: payloadStride(colorType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'color', type: colorType },
        ],
      },
    };
  },
});
