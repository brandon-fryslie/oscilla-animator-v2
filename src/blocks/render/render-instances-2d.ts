/**
 * RenderInstances2D Block
 *
 * Renders 2D instances at positions with color.
 *
 * SHAPE LOOKUP (2026-02-04):
 * Shape is automatically looked up from the instance via position field's instanceId.
 * No separate shape input is required - shape is stored in InstanceDecl when the
 * instance is created (e.g., by Array block with Ellipse.shape as element).
 *
 * Simplified wiring:
 *   Before: Array.elements → RenderInstances2D.shape
 *           Array.elements → Layout → RenderInstances2D.pos
 *   After:  Array.elements → Layout → RenderInstances2D.pos (that's it!)
 *
 * The backend (schedule-program.ts) extracts instanceId from the position field
 * and looks up shapeField from InstanceDecl automatically.
 */

import { registerBlock } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalField, unitWorld3, unitHsl, requireInst, VEC3, COLOR, FLOAT } from '../../core/canonical-types';
import { defaultSourceConst, canonicalType } from '../../types';

registerBlock({
  type: 'RenderInstances2D',
  label: 'Render Instances 2D',
  category: 'render',
  description: 'Renders 2D instances at positions with color. Shape is automatically looked up from the instance.',
  form: 'primitive',
  capability: 'render',
  loweringPurity: 'impure',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    color: { label: 'Color', type: canonicalField(COLOR, unitHsl(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    // Shape input REMOVED - now looked up automatically from instance
    scale: {
      label: 'Scale',
      type: canonicalType(FLOAT),
      defaultValue: 1.0,
      defaultSource: defaultSourceConst(1.0),
      uiHint: { kind: 'slider', min: 0.1, max: 1, step: 0.1 },
    },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const color = inputsById.color;

    const posIsField = pos && 'type' in pos && requireInst(pos.type.extent.cardinality, 'cardinality').kind === 'many';

    if (!pos || !posIsField) {
      throw new Error('RenderInstances2D pos input must be a field');
    }
    if (!color) {
      throw new Error('RenderInstances2D color input is required');
    }
    // color may be a signal (one) when wired from a Const via allowZipSig broadcast — that's valid

    // Shape is automatically looked up from instance.shapeField in schedule-program.ts
    // No need to extract it here - the backend handles it

    return {
      outputsById: {},
    };
  },
});
