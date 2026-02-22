/**
 * Ellipse Block
 *
 * Geometry generator that creates an ellipse control-point field.
 */

import { registerBlock } from '../registry';
import {
  canonicalType,
  canonicalMany,
  canonicalManyDef,
  payloadStride,
  floatConst,
  instanceRef,
  withInstance,
} from '../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { registerDynamicTopology } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { resolveInputConstant } from '../lower-utils';
import { createLinePathTopology } from './_topology-helpers';

/**
 * Ellipse - Geometry generator
 *
 * Produces:
 * - One<shape> handle for instancing/rendering
 * - Field<vec2> control points for deformation pipelines
 *
 * This keeps geometry as first-class data in the graph.
 */
registerBlock({
  type: 'Ellipse',
  label: 'Ellipse',
  category: 'shape',
  description: 'Generates ellipse geometry as Field<vec2> control points',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
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
    resolution: {
      label: 'Resolution',
      type: canonicalType(INT),
      defaultValue: 64,
      defaultSource: defaultSourceConst(64),
      uiHint: { kind: 'slider', min: 8, max: 256, step: 1 },
    },
  },
  outputs: {
    shape: { label: 'Shape', type: canonicalType(FLOAT) },
    controlPoints: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
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

    const resolutionInput = inputsById.resolution;
    if (!resolutionInput) throw new Error('Ellipse: resolution input not wired — normalization bug');
    const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 8, max: 2048 });

    // [LAW:one-source-of-truth] Geometry topology is declared at generation time and
    // shape handles reference the same control-point field used by deformation/layout.
    const topologyId = registerDynamicTopology(
      createLinePathTopology(resolution, true),
      `ellipse-${resolution}`
    );

    const controlInstance = ctx.b.createInstance(DOMAIN_CONTROL, resolution, undefined, 'static');
    const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
    const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
    const vec2FieldType = canonicalMany(VEC2, { kind: 'none' }, ref);

    const indexField = ctx.b.intrinsic('index', canonicalMany(INT, { kind: 'none' }, ref));
    const resolutionSig = ctx.b.constant(floatConst(resolution), canonicalType(FLOAT));

    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));

    const div = ctx.b.opcode(OpCode.Div);
    const mul = ctx.b.opcode(OpCode.Mul);
    const add = ctx.b.opcode(OpCode.Add);
    const sub = ctx.b.opcode(OpCode.Sub);
    const cos = ctx.b.opcode(OpCode.Cos);
    const sin = ctx.b.opcode(OpCode.Sin);

    const resolutionBroadcast = ctx.b.broadcast(resolutionSig, floatFieldType);
    const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
    const angleFrac = ctx.b.zipAuto([indexField, resolutionBroadcast], div, floatFieldType);
    const angle = ctx.b.zipAuto([angleFrac, twoPiBroadcast], mul, floatFieldType);

    const cosAngle = ctx.b.mapAuto(angle, cos, floatFieldType);
    const sinAngle = ctx.b.mapAuto(angle, sin, floatFieldType);
    const xBase = ctx.b.zipAuto([rxSig, cosAngle], mul, floatFieldType);
    const yBase = ctx.b.zipAuto([rySig, sinAngle], mul, floatFieldType);

    const cosRot = ctx.b.mapAuto(rotationSig, cos, canonicalType(FLOAT));
    const sinRot = ctx.b.mapAuto(rotationSig, sin, canonicalType(FLOAT));

    const xCos = ctx.b.zipAuto([xBase, cosRot], mul, floatFieldType);
    const ySin = ctx.b.zipAuto([yBase, sinRot], mul, floatFieldType);
    const xRot = ctx.b.zipAuto([xCos, ySin], sub, floatFieldType);

    const xSin = ctx.b.zipAuto([xBase, sinRot], mul, floatFieldType);
    const yCos = ctx.b.zipAuto([yBase, cosRot], mul, floatFieldType);
    const yRot = ctx.b.zipAuto([xSin, yCos], add, floatFieldType);

    const controlPoints = ctx.b.construct([xRot, yRot], vec2FieldType);

    const shapeRefSig = ctx.b.shapeRef(
      topologyId,
      [],
      canonicalType(FLOAT),
      controlPoints
    );

    const shapeType = ctx.outTypes[0];
    const controlPointsType = withInstance(ctx.outTypes[1], ref);

    // Keep constants alive through the expression table in uniform lowering flows.
    void const0;
    void const1;

    return {
      outputsById: {
        shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
        controlPoints: {
          id: controlPoints,
          slot: undefined,
          type: controlPointsType,
          stride: payloadStride(controlPointsType.payload),
        },
      },
      effects: {
        slotRequests: [
          { portId: 'shape', type: shapeType },
          { portId: 'controlPoints', type: controlPointsType },
        ],
      },
      instanceContext: controlInstance,
    };
  },
});
