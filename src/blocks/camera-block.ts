/**
 * Camera Block
 *
 * Declares camera projection parameters for 3D rendering.
 * Per spec: design-docs/_new/3d/camera-v2/01-basics.md
 *
 * Camera parameters are ordinary signals whose values are written to slots
 * during normal schedule execution. The runtime resolves camera params from
 * these slots (no special evaluation path).
 *
 * ONE SOURCE OF TRUTH: Only one Camera block is allowed per program.
 * Compiler validates uniqueness (E_CAMERA_MULTIPLE).
 */

import { registerBlock } from './registry';
import { signalType, unitNorm01, unitScalar, unitDeg } from '../core/canonical-types';
import { defaultSourceConst } from '../types';
import type { CameraDeclIR } from '../compiler/ir/program';

// =============================================================================
// Camera Block
// =============================================================================

registerBlock({
  type: 'Camera',
  label: 'Camera',
  category: 'render',
  form: 'primitive',
  capability: 'render',
  description: 'Declares camera projection parameters for 3D rendering',
  inputs: {
    projection: {
      label: 'Projection',
      type: signalType('cameraProjection'),
      value: 0, // ORTHO
      defaultSource: defaultSourceConst(0),
    },
    centerX: {
      label: 'Center X',
      type: signalType('float', unitNorm01()),
      value: 0.5,
      defaultSource: defaultSourceConst(0.5),
    },
    centerY: {
      label: 'Center Y',
      type: signalType('float', unitNorm01()),
      value: 0.5,
      defaultSource: defaultSourceConst(0.5),
    },
    distance: {
      label: 'Distance',
      type: signalType('float', unitScalar()),
      value: 2.0,
      defaultSource: defaultSourceConst(2.0),
    },
    tiltDeg: {
      label: 'Tilt',
      type: signalType('float', unitDeg()),
      value: 35.0,
      defaultSource: defaultSourceConst(35.0),
    },
    yawDeg: {
      label: 'Yaw',
      type: signalType('float', unitDeg()),
      value: 0.0,
      defaultSource: defaultSourceConst(0.0),
    },
    fovYDeg: {
      label: 'FOV',
      type: signalType('float', unitDeg()),
      value: 45.0,
      defaultSource: defaultSourceConst(45.0),
    },
    near: {
      label: 'Near',
      type: signalType('float', unitScalar()),
      value: 0.01,
      defaultSource: defaultSourceConst(0.01),
    },
    far: {
      label: 'Far',
      type: signalType('float', unitScalar()),
      value: 100.0,
      defaultSource: defaultSourceConst(100.0),
    },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    // Each input port has its signal value stored in a slot via normal compiler wiring.
    // Extract the slots from the resolved inputs.
    const getSlot = (portId: string) => {
      const ref = inputsById[portId];
      if (!ref || ref.k !== 'sig') {
        throw new Error(`Camera block: input '${portId}' must be a signal (got ${ref?.k ?? 'undefined'})`);
      }
      return ref.slot;
    };

    const cameraDecl: CameraDeclIR = {
      kind: 'camera',
      projectionSlot: getSlot('projection'),
      centerXSlot: getSlot('centerX'),
      centerYSlot: getSlot('centerY'),
      distanceSlot: getSlot('distance'),
      tiltDegSlot: getSlot('tiltDeg'),
      yawDegSlot: getSlot('yawDeg'),
      fovYDegSlot: getSlot('fovYDeg'),
      nearSlot: getSlot('near'),
      farSlot: getSlot('far'),
    };

    ctx.b.addRenderGlobal(cameraDecl);
    return { outputsById: {} };
  },
});
