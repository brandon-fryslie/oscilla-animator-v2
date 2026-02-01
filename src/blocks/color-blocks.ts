/**
 * Color Blocks
 *
 * Most color blocks (ColorLFO, HSVToColor, HsvToRgb, ApplyOpacity) have been
 * removed as part of the block library reduction for the type system migration.
 * They will be rewritten with improved kernels after the migration is complete.
 *
 * Remaining: FieldConstColor — minimal broadcast block that produces a field-level
 * constant color from a signal color. Required because RenderInstances2D needs
 * field-level color input, and the polymorphic Const block produces signals.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, floatConst, requireInst } from '../core/canonical-types';
import { FLOAT, COLOR, SHAPE } from '../core/canonical-types';
import { defaultSourceConst } from '../types';

// =============================================================================
// FieldConstColor — Broadcast signal color to field
// =============================================================================

registerBlock({
  type: 'FieldConstColor',
  label: 'Constant Color (Field)',
  category: 'color',
  description: 'Broadcasts a constant color to all instances in a field. Produces Field<color>.',
  form: 'primitive',
  capability: 'pure',
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
    elements: { label: 'Elements', type: canonicalField(SHAPE, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    r: { label: 'Red', type: canonicalType(FLOAT), value: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    g: { label: 'Green', type: canonicalType(FLOAT), value: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    b: { label: 'Blue', type: canonicalType(FLOAT), value: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    a: { label: 'Alpha', type: canonicalType(FLOAT), value: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
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
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const gSig = (inputsById.g && 'type' in inputsById.g && requireInst(inputsById.g.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.g.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const bSig = (inputsById.b && 'type' in inputsById.b && requireInst(inputsById.b.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.b.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const aSig = (inputsById.a && 'type' in inputsById.a && requireInst(inputsById.a.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.a.id
      : ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));

    // TODO: broadcastColor kernel was removed. This block needs a color
    // construction kernel (float4 -> color) or per-lane opcode dispatch.
    // Suppress unused variable warnings for signals that will be used
    // once a replacement kernel is available.
    void rSig; void gSig; void bSig; void aSig;
    void colorType; void instanceId;
    throw new Error(
      'FieldConstColor: broadcastColor kernel removed. ' +
      'Color construction kernel not yet implemented.'
    );
  },
});
