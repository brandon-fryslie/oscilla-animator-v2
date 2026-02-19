/**
 * FieldConstColor Block
 *
 * Broadcasts a constant color to all instances in a field.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, canonicalFieldDef, requireInst, payloadStride, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

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
    elements: { label: 'Elements', type: canonicalFieldDef(FLOAT, { kind: 'none' }) },
    r: { label: 'Red', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    g: { label: 'Green', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    b: { label: 'Blue', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    color: { label: 'Color', type: canonicalFieldDef(COLOR, { kind: 'none' }) },
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

    // Post-normalization: all inputs guaranteed wired — no fallback needed
    // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
    const rInput = inputsById.r;
    if (!rInput) throw new Error('FieldConstColor: r input not wired — normalization bug');
    const gInput = inputsById.g;
    if (!gInput) throw new Error('FieldConstColor: g input not wired — normalization bug');
    const bInput = inputsById.b;
    if (!bInput) throw new Error('FieldConstColor: b input not wired — normalization bug');
    const aInput = inputsById.a;
    if (!aInput) throw new Error('FieldConstColor: a input not wired — normalization bug');

    // Build a scalar float field type matching the instance extent
    const floatFieldType = canonicalField(FLOAT, { kind: 'none' }, { instanceId, domainTypeId: makeDomainTypeId('default') });

    // allowZipSig: signal inputs may have been resolved to field cardinality by solver.
    // Broadcast only when input is actually a signal; fields pass through.
    const ensureField = (input: typeof rInput) =>
      requireInst(input.type.extent.cardinality, 'cardinality').kind === 'one'
        ? ctx.b.broadcast(input.id, floatFieldType) : input.id;
    const rField = ensureField(rInput);
    const gField = ensureField(gInput);
    const bField = ensureField(bInput);
    const aField = ensureField(aInput);
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
