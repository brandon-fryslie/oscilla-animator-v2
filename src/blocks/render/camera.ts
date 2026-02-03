/**
 * Camera Block
 *
 * Declares camera projection parameters for 3D rendering.
 * Camera parameters are ordinary signals whose values are written to slots
 * during normal schedule execution.
 *
 * ONE SOURCE OF TRUTH: Only one Camera block is allowed per program.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitScalar, contractClamp01, unitDegrees, requireInst, FLOAT, CAMERA_PROJECTION } from '../../core/canonical-types';
import { defaultSourceConst, type DefaultSource } from '../../types';
import type { CameraDeclIR } from '../../compiler/ir/program';

/**
 * Default source helper for deg unit (camera angles)
 */
function defaultSourceDeg(value: number): DefaultSource {
  return { blockType: 'Const', output: 'out', params: { value, payloadType: 'float' } };
}

/**
 * Default source helper for cameraProjection type
 */
function defaultSourceCameraProjection(value: number): DefaultSource {
  return { blockType: 'CameraProjectionConst', output: 'out', params: { value } };
}

registerBlock({
  type: 'Camera',
  label: 'Camera',
  category: 'render',
  form: 'primitive',
  capability: 'render',
  description: 'Declares camera projection parameters for 3D rendering',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    projection: {
      label: 'Projection',
      type: canonicalType(CAMERA_PROJECTION),
      defaultValue: 1,
      defaultSource: defaultSourceCameraProjection(1),
      uiHint: { kind: 'select', options: [{ value: '0', label: 'Orthographic' }, { value: '1', label: 'Perspective' }] },
    },
    centerX: {
      label: 'Center X',
      type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    centerY: {
      label: 'Center Y',
      type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    distance: {
      label: 'Distance',
      type: canonicalType(FLOAT, unitScalar()),
      defaultValue: 0.87,
      defaultSource: defaultSourceConst(0.87),
      uiHint: { kind: 'slider', min: 0.1, max: 5, step: 0.01 },
    },
    tiltDeg: {
      label: 'Tilt',
      type: canonicalType(FLOAT, unitDegrees()),
      defaultValue: 35.0,
      defaultSource: defaultSourceDeg(35.0),
      uiHint: { kind: 'slider', min: -90, max: 90, step: 1 },
    },
    yawDeg: {
      label: 'Yaw',
      type: canonicalType(FLOAT, unitDegrees()),
      defaultValue: 0.0,
      defaultSource: defaultSourceDeg(0.0),
      uiHint: { kind: 'slider', min: -180, max: 180, step: 1 },
    },
    fovYDeg: {
      label: 'FOV',
      type: canonicalType(FLOAT, unitDegrees()),
      defaultValue: 60.0,
      defaultSource: defaultSourceDeg(60.0),
      uiHint: { kind: 'slider', min: 10, max: 120, step: 1 },
    },
    near: {
      label: 'Near',
      type: canonicalType(FLOAT, unitScalar()),
      defaultValue: 0.01,
      defaultSource: defaultSourceConst(0.01),
      uiHint: { kind: 'slider', min: 0.001, max: 1, step: 0.001 },
    },
    far: {
      label: 'Far',
      type: canonicalType(FLOAT, unitScalar()),
      defaultValue: 100.0,
      defaultSource: defaultSourceConst(100.0),
      uiHint: { kind: 'slider', min: 1, max: 1000, step: 1 },
    },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const getSlot = (portId: string) => {
      const ref = inputsById[portId];
      const isSignal = ref && 'type' in ref && requireInst(ref.type.extent.cardinality, 'cardinality').kind !== 'many';
      if (!ref || !isSignal) {
        throw new Error(`Camera block: input '${portId}' must be a signal (got ${ref ? 'field' : 'undefined'})`);
      }
      return ref.slot!; // Slot is always present after orchestrator allocation
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
