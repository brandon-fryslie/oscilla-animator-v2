/**
 * Ellipse Block
 *
 * Creates an ellipse shape (circle when rx=ry).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
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
  lower: ({ ctx, inputsById, config }) => {
    // Resolve rx parameter
    const rxInput = inputsById.rx;
    let rxSig;
    const rxIsSignal = rxInput && 'type' in rxInput && requireInst(rxInput.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (rxInput && rxIsSignal) {
      rxSig = rxInput.id;
    } else {
      rxSig = ctx.b.constant(floatConst((config?.rx as number) ?? 0.02), canonicalType(FLOAT));
    }

    // Resolve ry parameter
    const ryInput = inputsById.ry;
    let rySig;
    const ryIsSignal = ryInput && 'type' in ryInput && requireInst(ryInput.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (ryInput && ryIsSignal) {
      rySig = ryInput.id;
    } else {
      rySig = ctx.b.constant(floatConst((config?.ry as number) ?? 0.02), canonicalType(FLOAT));
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

    // Create shape reference with ellipse topology and param signals
    const shapeRefSig = ctx.b.shapeRef(
      TOPOLOGY_ID_ELLIPSE,
      [rxSig, rySig, rotationSig],
      canonicalType(FLOAT)
    );

    const slot = ctx.b.allocSlot();
    const shapeType = ctx.outTypes[0];

    return {
      outputsById: {
        shape: { id: shapeRefSig, slot, type: shapeType, stride: payloadStride(shapeType.payload) },
      },
    };
  },
});
