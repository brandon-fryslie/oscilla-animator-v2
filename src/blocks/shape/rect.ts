/**
 * Rect Block
 *
 * Creates a rectangle shape (square when width=height).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
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
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
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
  lower: ({ ctx, inputsById, config }) => {
    // Resolve width parameter
    const widthInput = inputsById.width;
    let widthSig;
    const widthIsSignal = widthInput && 'type' in widthInput && requireInst(widthInput.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (widthInput && widthIsSignal) {
      widthSig = widthInput.id;
    } else {
      widthSig = ctx.b.constant(floatConst((config?.width as number) ?? 0.04), canonicalType(FLOAT));
    }

    // Resolve height parameter
    const heightInput = inputsById.height;
    let heightSig;
    const heightIsSignal = heightInput && 'type' in heightInput && requireInst(heightInput.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (heightInput && heightIsSignal) {
      heightSig = heightInput.id;
    } else {
      heightSig = ctx.b.constant(floatConst((config?.height as number) ?? 0.02), canonicalType(FLOAT));
    }

    // Resolve rotation parameter
    const rotationInput = inputsById.rotation;
    let rotationSig;
    const rotationIsSignal = rotationInput && 'type' in rotationInput && requireInst(rotationInput.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (rotationInput && rotationIsSignal) {
      rotationSig = rotationInput.id;
    } else {
      rotationSig = ctx.b.constant(floatConst((config?.rotation as number) ?? 0), canonicalType(FLOAT));
    }

    // Resolve cornerRadius parameter
    const cornerRadiusInput = inputsById.cornerRadius;
    let cornerRadiusSig;
    const cornerRadiusIsSignal = cornerRadiusInput && 'type' in cornerRadiusInput && requireInst(cornerRadiusInput.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (cornerRadiusInput && cornerRadiusIsSignal) {
      cornerRadiusSig = cornerRadiusInput.id;
    } else {
      cornerRadiusSig = ctx.b.constant(floatConst((config?.cornerRadius as number) ?? 0), canonicalType(FLOAT));
    }

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
