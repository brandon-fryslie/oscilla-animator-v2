/**
 * Rect Block
 *
 * Creates a rectangle shape (square when width=height).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { TOPOLOGY_ID_RECT } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';

/**
 * Rect - Creates a rectangle shape
 *
 * Maps directly to Canvas fillRect()/strokeRect() API.
 * For squares, just set width=height.
 *
 * Outputs a shape signal that can be:
 * 1. Passed to Array to create many instances
 * 2. Connected directly to a renderer
 */
registerBlock({
  type: 'Rect',
  label: 'Rect',
  category: 'shape',
  description: 'Creates a rectangle shape (square when width=height)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    width: {
      label: 'Width',
      type: canonicalType(FLOAT),
      defaultValue: 0.04,
      defaultSource: defaultSourceConst(0.04),
      uiHint: { kind: 'slider', min: 0.001, max: 0.5, step: 0.001 },
    },
    height: {
      label: 'Height',
      type: canonicalType(FLOAT),
      defaultValue: 0.02,
      defaultSource: defaultSourceConst(0.02),
      uiHint: { kind: 'slider', min: 0.001, max: 0.5, step: 0.001 },
    },
    rotation: {
      label: 'Rotation',
      type: canonicalType(FLOAT),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      uiHint: { kind: 'slider', min: 0, max: 6.28, step: 0.01 },
    },
    cornerRadius: {
      label: 'Corner Radius',
      type: canonicalType(FLOAT),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      uiHint: { kind: 'slider', min: 0, max: 0.1, step: 0.001 },
    },
  },
  outputs: {
    shape: { label: 'Shape', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    // Post-normalization: all inputs guaranteed wired — no fallback needed
    // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
    const widthInput = inputsById.width;
    if (!widthInput) throw new Error('Rect: width input not wired — normalization bug');
    const widthSig = widthInput.id;

    const heightInput = inputsById.height;
    if (!heightInput) throw new Error('Rect: height input not wired — normalization bug');
    const heightSig = heightInput.id;

    const rotationInput = inputsById.rotation;
    if (!rotationInput) throw new Error('Rect: rotation input not wired — normalization bug');
    const rotationSig = rotationInput.id;

    const cornerRadiusInput = inputsById.cornerRadius;
    if (!cornerRadiusInput) throw new Error('Rect: cornerRadius input not wired — normalization bug');
    const cornerRadiusSig = cornerRadiusInput.id;

    // Create shape reference with rect topology and param signals
    const shapeRefSig = ctx.b.shapeRef(
      TOPOLOGY_ID_RECT,
      [widthSig, heightSig, rotationSig, cornerRadiusSig],
      canonicalType(FLOAT)
    );

    const shapeType = ctx.outTypes[0];

    return {
      outputsById: {
        shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'shape', type: shapeType },
        ],
      },
    };
  },
});
