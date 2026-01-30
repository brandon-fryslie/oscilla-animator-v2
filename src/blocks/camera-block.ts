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
import { canonicalType, unitNorm01, unitScalar, unitDeg, strideOf, floatConst, cameraProjectionConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../core/canonical-types';
import { defaultSourceConst, type DefaultSource } from '../types';
import type { CameraDeclIR } from '../compiler/ir/program';

// =============================================================================
// CameraProjection Constant Block
// =============================================================================

/**
 * Outputs a constant cameraProjection value.
 * 0 = orthographic, 1 = perspective
 */
registerBlock({
  type: 'CameraProjectionConst',
  label: 'Camera Projection',
  category: 'signal',
  description: 'Outputs a constant camera projection mode (0=ortho, 1=persp)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    value: {
      type: canonicalType(INT),
      value: 0,
      defaultSource: defaultSourceConst(0),
      uiHint: { kind: 'select', options: [{ value: '0', label: 'Orthographic' }, { value: '1', label: 'Perspective' }] },
      exposedAsPort: true,
    },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(CAMERA_PROJECTION) },
  },
  lower: ({ ctx, config }) => {
    const rawValue = (config?.value as number) ?? 0;
    const sigId = ctx.b.sigConst(cameraProjectionConst(rawValue === 1 ? 'perspective' : 'orthographic'), canonicalType(CAMERA_PROJECTION));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) } } };
  },
});

/**
 * Default source helper for cameraProjection type
 */
function defaultSourceCameraProjection(value: number): DefaultSource {
  return { blockType: 'CameraProjectionConst', output: 'out', params: { value } };
}

/**
 * Default source helper for deg unit (camera angles)
 */
function defaultSourceDeg(value: number): DefaultSource {
  return { blockType: 'Const', output: 'out', params: { value, payloadType: 'float' } };
}

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
      type: canonicalType(CAMERA_PROJECTION),
      value: 1, // PERSP (perspective is the sensible default for 3D)
      defaultSource: defaultSourceCameraProjection(1),
      uiHint: { kind: 'select', options: [{ value: '0', label: 'Orthographic' }, { value: '1', label: 'Perspective' }] },
    },
    centerX: {
      label: 'Center X',
      type: canonicalType(FLOAT, unitNorm01()),
      value: 0.5,
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    centerY: {
      label: 'Center Y',
      type: canonicalType(FLOAT, unitNorm01()),
      value: 0.5,
      defaultSource: defaultSourceConst(0.5),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    distance: {
      label: 'Distance',
      type: canonicalType(FLOAT, unitScalar()),
      value: 0.87,
      defaultSource: defaultSourceConst(0.87),
      uiHint: { kind: 'slider', min: 0.1, max: 5, step: 0.01 },
    },
    tiltDeg: {
      label: 'Tilt',
      type: canonicalType(FLOAT, unitDeg()),
      value: 35.0,
      defaultSource: defaultSourceDeg(35.0),
      uiHint: { kind: 'slider', min: -90, max: 90, step: 1 },
    },
    yawDeg: {
      label: 'Yaw',
      type: canonicalType(FLOAT, unitDeg()),
      value: 0.0,
      defaultSource: defaultSourceDeg(0.0),
      uiHint: { kind: 'slider', min: -180, max: 180, step: 1 },
    },
    fovYDeg: {
      label: 'FOV',
      type: canonicalType(FLOAT, unitDeg()),
      value: 60.0,
      defaultSource: defaultSourceDeg(60.0),
      uiHint: { kind: 'slider', min: 10, max: 120, step: 1 },
    },
    near: {
      label: 'Near',
      type: canonicalType(FLOAT, unitScalar()),
      value: 0.01,
      defaultSource: defaultSourceConst(0.01),
      uiHint: { kind: 'slider', min: 0.001, max: 1, step: 0.001 },
    },
    far: {
      label: 'Far',
      type: canonicalType(FLOAT, unitScalar()),
      value: 100.0,
      defaultSource: defaultSourceConst(100.0),
      uiHint: { kind: 'slider', min: 1, max: 1000, step: 1 },
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
