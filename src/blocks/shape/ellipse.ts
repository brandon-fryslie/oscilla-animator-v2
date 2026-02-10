/**
 * Ellipse Block
 *
 * Creates an ellipse shape (circle when rx=ry).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { TOPOLOGY_ID_ELLIPSE } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';

/**
 * Ellipse - Creates an ellipse shape (circle when rx=ry)
 *
 * Maps directly to Canvas ellipse() API.
 * For circles, just set rx=ry.
 *
 * Outputs a shape signal that can be:
 * 1. Passed to Array to create many instances
 * 2. Connected directly to a renderer
 */
registerBlock({
  type: 'Ellipse',
  label: 'Ellipse',
  category: 'shape',
  description: 'Creates an ellipse shape (circle when rx=ry)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    rx: {
      label: 'Radius X',
      type: canonicalType(FLOAT),
      defaultValue: 0.02,
      defaultSource: defaultSourceConst(0.02),
      uiHint: { kind: 'slider', min: 0.001, max: 0.5, step: 0.001 },
    },
    ry: {
      label: 'Radius Y',
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
  },
  outputs: {
    shape: { label: 'Shape', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    // Post-normalization: all inputs guaranteed wired — no fallback needed
    // [LAW:one-source-of-truth] inputs are the single source; config/block.inputPorts was a dead fallback
    const rxInput = inputsById.rx;
    if (!rxInput) throw new Error('Ellipse: rx input not wired — normalization bug');
    const rxSig = rxInput.id;

    const ryInput = inputsById.ry;
    if (!ryInput) throw new Error('Ellipse: ry input not wired — normalization bug');
    const rySig = ryInput.id;

    const rotationInput = inputsById.rotation;
    if (!rotationInput) throw new Error('Ellipse: rotation input not wired — normalization bug');
    const rotationSig = rotationInput.id;

    // Create shape reference with ellipse topology and param signals
    const shapeRefSig = ctx.b.shapeRef(
      TOPOLOGY_ID_ELLIPSE,
      [rxSig, rySig, rotationSig],
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
