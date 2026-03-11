/**
 * RenderInstances2D Block
 *
 * Renders 2D instances at positions with color.
 *
 * SHAPE LOOKUP (2026-02-04):
 * Shape is automatically looked up from the instance via controlPoints field's instanceId.
 * No separate shape input is required - shape is stored in InstanceDecl when the
 * instance is created (e.g., by Array block with Ellipse.shape as element).
 *
 * Simplified wiring:
 *   Before: Array.elements → RenderInstances2D.shape
 *           Array.elements → Layout → RenderInstances2D.controlPoints
 *   After:  Array.elements → Layout → RenderInstances2D.controlPoints (that's it!)
 *
 * The backend (schedule-program.ts) extracts instanceId from the controlPoints field
 * and looks up shapeField from InstanceDecl automatically.
 */

import { registerBlock } from '../registry';
import { unitOklch, unitNone, requireInst, VEC2, COLOR, FLOAT } from '../../core/canonical-types';
import { inferType, cardinalityVar, unitVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const RENDER_CONTROL_POINTS_CARD = cardinalityVar(cardinalityVarId('render_control_points'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});
const RENDER_COLOR_CARD = cardinalityVar(cardinalityVarId('render_color'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});
const RENDER_SCALE_CARD = cardinalityVar(cardinalityVarId('render_scale'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'RenderInstances2D',
    label: 'Render Instances 2D',
    category: 'render',
    description: 'Renders 2D instances at positions with color. Shape is automatically looked up from the instance.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      // [LAW:one-source-of-truth] RenderInstances2D position authority is controlPoints.
      // No parallel "pos" input is kept because duplicate carriers drift.
      controlPoints: { label: 'Control Points', type: inferType(VEC2, unitNone(), { cardinality: RENDER_CONTROL_POINTS_CARD }) },
      color: { label: 'Color', type: inferType(COLOR, unitOklch(), { cardinality: RENDER_COLOR_CARD }) },
      // Shape input REMOVED - now looked up automatically from instance
      scale: {
        label: 'Scale',
        type: inferType(FLOAT, unitVar('render_scale_U'), { cardinality: RENDER_SCALE_CARD }),
        defaultValue: 1.0,
        defaultSource: defaultSourceConst(1.0),
        uiHint: { kind: 'slider', min: 0.1, max: 1, step: 0.1 },
      },
    },
    outputs: {},
    lower: ({ inputsById }) => {
      const controlPoints = inputsById.controlPoints;
      const color = inputsById.color;
  
      const controlPointsIsField =
        controlPoints &&
        'type' in controlPoints &&
        requireInst(controlPoints.type.extent.cardinality, 'cardinality').kind === 'many';
  
      if (!controlPoints || !controlPointsIsField) {
        throw new Error('RenderInstances2D controlPoints input must be a field');
      }
      if (!color) {
        throw new Error('RenderInstances2D color input is required');
      }
      // color may be one or many; CT/ICT declares oneOrMany acceptance.
  
      // Shape is automatically looked up from instance.shapeField in schedule-program.ts
      // No need to extract it here - the backend handles it
  
      return {
        outputsById: {},
        effects: {},
      };
    },
  });
}
