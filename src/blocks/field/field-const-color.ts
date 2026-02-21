/**
 * FieldConstColor Block
 *
 * Broadcasts a constant color to all instances in a field.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { requireInst, payloadStride, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';

// [LAW:one-source-of-truth] Field+signal mixing behavior is declared on CT/ICT cardinality vars.
const FIELD_CONST_COLOR_CARD_MANY = cardinalityVar(cardinalityVarId('field_const_color'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});
const FIELD_CONST_COLOR_CARD_FLEX = cardinalityVar(cardinalityVarId('field_const_color'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

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
    elements: { label: 'Elements', type: inferType(FLOAT, { kind: 'none' }, { cardinality: FIELD_CONST_COLOR_CARD_MANY }) },
    r: { label: 'Red', type: inferType(FLOAT, unitNone(), { cardinality: FIELD_CONST_COLOR_CARD_FLEX }, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    g: { label: 'Green', type: inferType(FLOAT, unitNone(), { cardinality: FIELD_CONST_COLOR_CARD_FLEX }, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    b: { label: 'Blue', type: inferType(FLOAT, unitNone(), { cardinality: FIELD_CONST_COLOR_CARD_FLEX }, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    a: { label: 'Alpha', type: inferType(FLOAT, unitNone(), { cardinality: FIELD_CONST_COLOR_CARD_FLEX }, contractClamp01()), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    color: { label: 'Color', type: inferType(COLOR, { kind: 'none' }, { cardinality: FIELD_CONST_COLOR_CARD_MANY }) },
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

    // constructAuto handles signal→field broadcasting for mixed-cardinality components
    const result = ctx.b.constructAuto([rInput.id, gInput.id, bInput.id, aInput.id], colorType);

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
