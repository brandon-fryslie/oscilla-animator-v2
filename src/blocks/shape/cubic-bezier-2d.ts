/**
 * CubicBezier2D Block
 *
 * Type 2 parametric shape primitive:
 * samples a cubic Bezier curve into a canonical control-point field and
 * exposes a shape handle for rendering.
 */

import { registerBlock } from '../registry';
import {
  canonicalMany,
  canonicalManyDef,
  canonicalType,
  floatConst,
  instanceRef,
  payloadStride,
  withInstance,
} from '../../core/canonical-types';
import { FLOAT, INT, SHAPE, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { resolveInputConstant } from '../lower-utils';
import { createLinePathTopology } from './_topology-helpers';

export function register(): void {
  registerBlock({
    type: 'CubicBezier2D',
    label: 'Cubic Bezier',
    category: 'shape',
    description: 'Type 2 parametric cubic curve sampled into a renderable shape',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      p0x: {
        label: 'P0 X',
        type: canonicalType(FLOAT),
        defaultValue: -0.08,
        defaultSource: defaultSourceConst(-0.08),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p0y: {
        label: 'P0 Y',
        type: canonicalType(FLOAT),
        defaultValue: -0.06,
        defaultSource: defaultSourceConst(-0.06),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p1x: {
        label: 'P1 X',
        type: canonicalType(FLOAT),
        defaultValue: -0.02,
        defaultSource: defaultSourceConst(-0.02),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p1y: {
        label: 'P1 Y',
        type: canonicalType(FLOAT),
        defaultValue: 0.16,
        defaultSource: defaultSourceConst(0.16),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p2x: {
        label: 'P2 X',
        type: canonicalType(FLOAT),
        defaultValue: 0.12,
        defaultSource: defaultSourceConst(0.12),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p2y: {
        label: 'P2 Y',
        type: canonicalType(FLOAT),
        defaultValue: -0.14,
        defaultSource: defaultSourceConst(-0.14),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p3x: {
        label: 'P3 X',
        type: canonicalType(FLOAT),
        defaultValue: 0.18,
        defaultSource: defaultSourceConst(0.18),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      p3y: {
        label: 'P3 Y',
        type: canonicalType(FLOAT),
        defaultValue: 0.08,
        defaultSource: defaultSourceConst(0.08),
        uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.001 },
      },
      thickness: {
        label: 'Thickness',
        type: canonicalType(FLOAT),
        defaultValue: 0.04,
        defaultSource: defaultSourceConst(0.04),
        uiHint: { kind: 'slider', min: 0.001, max: 0.25, step: 0.001 },
      },
      resolution: {
        label: 'Resolution',
        type: canonicalType(INT),
        defaultValue: 64,
        defaultSource: defaultSourceConst(64),
        uiHint: { kind: 'slider', min: 4, max: 512, step: 1 },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(SHAPE) },
      controlPoints: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
      t: { label: 'T', type: canonicalManyDef(FLOAT, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      const p0xInput = inputsById.p0x;
      if (!p0xInput) throw new Error('CubicBezier2D: p0x input not wired — normalization bug');
      const p0x = p0xInput.id;
      const p0yInput = inputsById.p0y;
      if (!p0yInput) throw new Error('CubicBezier2D: p0y input not wired — normalization bug');
      const p0y = p0yInput.id;
      const p1xInput = inputsById.p1x;
      if (!p1xInput) throw new Error('CubicBezier2D: p1x input not wired — normalization bug');
      const p1x = p1xInput.id;
      const p1yInput = inputsById.p1y;
      if (!p1yInput) throw new Error('CubicBezier2D: p1y input not wired — normalization bug');
      const p1y = p1yInput.id;
      const p2xInput = inputsById.p2x;
      if (!p2xInput) throw new Error('CubicBezier2D: p2x input not wired — normalization bug');
      const p2x = p2xInput.id;
      const p2yInput = inputsById.p2y;
      if (!p2yInput) throw new Error('CubicBezier2D: p2y input not wired — normalization bug');
      const p2y = p2yInput.id;
      const p3xInput = inputsById.p3x;
      if (!p3xInput) throw new Error('CubicBezier2D: p3x input not wired — normalization bug');
      const p3x = p3xInput.id;
      const p3yInput = inputsById.p3y;
      if (!p3yInput) throw new Error('CubicBezier2D: p3y input not wired — normalization bug');
      const p3y = p3yInput.id;
      const thicknessInput = inputsById.thickness;
      if (!thicknessInput) throw new Error('CubicBezier2D: thickness input not wired — normalization bug');
      const thickness = thicknessInput.id;

      const resolutionInput = inputsById.resolution;
      if (!resolutionInput) throw new Error('CubicBezier2D: resolution input not wired — normalization bug');
      const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 4, max: 4096 });
      const sampleCount = resolution + 1;
      const pointCount = sampleCount * 2;

      // [LAW:one-source-of-truth] Parametric sample topology is derived once
      // from compile-time resolution and reused by all runtime instances.
      const topologyId = ctx.b.registerTopology(
        createLinePathTopology(pointCount, true),
        `cubic-bezier-ribbon-${resolution}`,
      );

      const controlInstance = ctx.b.createInstance(DOMAIN_CONTROL, pointCount, undefined, 'static');
      const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
      const vec2FieldType = canonicalMany(VEC2, { kind: 'none' }, ref);

      const indexField = ctx.b.intrinsic('index', canonicalMany(INT, { kind: 'none' }, ref));
      const resolutionAsFloat = ctx.b.constant(floatConst(resolution), canonicalType(FLOAT));
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const three = ctx.b.constant(floatConst(3), canonicalType(FLOAT));
      const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT));
      const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
      const six = ctx.b.constant(floatConst(6), canonicalType(FLOAT));
      const eps = ctx.b.constant(floatConst(0.0001), canonicalType(FLOAT));
      const minusOne = ctx.b.constant(floatConst(-1), canonicalType(FLOAT));
      const halfCount = ctx.b.constant(floatConst(sampleCount), canonicalType(FLOAT));
      const maxPointIndex = ctx.b.constant(floatConst(pointCount - 1), canonicalType(FLOAT));

      const div = ctx.b.opcode(OpCode.Div);
      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sqrt = ctx.b.opcode(OpCode.Sqrt);
      const max = ctx.b.opcode(OpCode.Max);
      const lt = ctx.b.opcode(OpCode.Lt);
      const select = ctx.b.opcode(OpCode.Select);

      const resolutionBroadcast = ctx.b.broadcast(resolutionAsFloat, floatFieldType);
      const oneBroadcast = ctx.b.broadcast(one, floatFieldType);
      const threeBroadcast = ctx.b.broadcast(three, floatFieldType);
      const twoBroadcast = ctx.b.broadcast(two, floatFieldType);
      const halfBroadcast = ctx.b.broadcast(half, floatFieldType);
      const sixBroadcast = ctx.b.broadcast(six, floatFieldType);
      const epsBroadcast = ctx.b.broadcast(eps, floatFieldType);
      const minusOneBroadcast = ctx.b.broadcast(minusOne, floatFieldType);
      const halfCountBroadcast = ctx.b.broadcast(halfCount, floatFieldType);
      const maxPointIndexBroadcast = ctx.b.broadcast(maxPointIndex, floatFieldType);

      // [LAW:dataflow-not-control-flow] Both ribbon rails are computed in one
      // dataflow: first half uses forward sample index, second half reverse.
      const reverseIndex = ctx.b.zipAuto([maxPointIndexBroadcast, indexField], sub, floatFieldType);
      const isUpperRail = ctx.b.zipAuto([indexField, halfCountBroadcast], lt, floatFieldType);
      const sampleIndex = ctx.b.zipAuto([isUpperRail, indexField, reverseIndex], select, floatFieldType);
      const t = ctx.b.zipAuto([sampleIndex, resolutionBroadcast], div, floatFieldType);
      const oneMinusT = ctx.b.zipAuto([oneBroadcast, t], sub, floatFieldType);
      const oneMinusTSq = ctx.b.zipAuto([oneMinusT, oneMinusT], mul, floatFieldType);
      const oneMinusTCb = ctx.b.zipAuto([oneMinusTSq, oneMinusT], mul, floatFieldType);
      const tSq = ctx.b.zipAuto([t, t], mul, floatFieldType);
      const tCb = ctx.b.zipAuto([tSq, t], mul, floatFieldType);

      const c0 = oneMinusTCb;
      const c1 = ctx.b.zipAuto(
        [ctx.b.zipAuto([oneMinusTSq, t], mul, floatFieldType), threeBroadcast],
        mul,
        floatFieldType,
      );
      const c2 = ctx.b.zipAuto(
        [ctx.b.zipAuto([oneMinusT, tSq], mul, floatFieldType), threeBroadcast],
        mul,
        floatFieldType,
      );
      const c3 = tCb;

      const x0 = ctx.b.zipAuto([c0, p0x], mul, floatFieldType);
      const x1 = ctx.b.zipAuto([c1, p1x], mul, floatFieldType);
      const x2 = ctx.b.zipAuto([c2, p2x], mul, floatFieldType);
      const x3 = ctx.b.zipAuto([c3, p3x], mul, floatFieldType);
      const y0 = ctx.b.zipAuto([c0, p0y], mul, floatFieldType);
      const y1 = ctx.b.zipAuto([c1, p1y], mul, floatFieldType);
      const y2 = ctx.b.zipAuto([c2, p2y], mul, floatFieldType);
      const y3 = ctx.b.zipAuto([c3, p3y], mul, floatFieldType);

      const x = ctx.b.zipAuto(
        [ctx.b.zipAuto([x0, x1], add, floatFieldType), ctx.b.zipAuto([x2, x3], add, floatFieldType)],
        add,
        floatFieldType,
      );
      const y = ctx.b.zipAuto(
        [ctx.b.zipAuto([y0, y1], add, floatFieldType), ctx.b.zipAuto([y2, y3], add, floatFieldType)],
        add,
        floatFieldType,
      );

      // Cubic derivative for tangent: B'(t)
      const p1MinusP0x = ctx.b.zipAuto([p1x, p0x], sub, floatFieldType);
      const p1MinusP0y = ctx.b.zipAuto([p1y, p0y], sub, floatFieldType);
      const p2MinusP1x = ctx.b.zipAuto([p2x, p1x], sub, floatFieldType);
      const p2MinusP1y = ctx.b.zipAuto([p2y, p1y], sub, floatFieldType);
      const p3MinusP2x = ctx.b.zipAuto([p3x, p2x], sub, floatFieldType);
      const p3MinusP2y = ctx.b.zipAuto([p3y, p2y], sub, floatFieldType);

      const d0x = ctx.b.zipAuto(
        [ctx.b.zipAuto([threeBroadcast, oneMinusTSq], mul, floatFieldType), p1MinusP0x],
        mul,
        floatFieldType,
      );
      const d0y = ctx.b.zipAuto(
        [ctx.b.zipAuto([threeBroadcast, oneMinusTSq], mul, floatFieldType), p1MinusP0y],
        mul,
        floatFieldType,
      );
      const d1x = ctx.b.zipAuto(
        [ctx.b.zipAuto([sixBroadcast, ctx.b.zipAuto([oneMinusT, t], mul, floatFieldType)], mul, floatFieldType), p2MinusP1x],
        mul,
        floatFieldType,
      );
      const d1y = ctx.b.zipAuto(
        [ctx.b.zipAuto([sixBroadcast, ctx.b.zipAuto([oneMinusT, t], mul, floatFieldType)], mul, floatFieldType), p2MinusP1y],
        mul,
        floatFieldType,
      );
      const d2x = ctx.b.zipAuto(
        [ctx.b.zipAuto([threeBroadcast, tSq], mul, floatFieldType), p3MinusP2x],
        mul,
        floatFieldType,
      );
      const d2y = ctx.b.zipAuto(
        [ctx.b.zipAuto([threeBroadcast, tSq], mul, floatFieldType), p3MinusP2y],
        mul,
        floatFieldType,
      );

      const tangentX = ctx.b.zipAuto([ctx.b.zipAuto([d0x, d1x], add, floatFieldType), d2x], add, floatFieldType);
      const tangentY = ctx.b.zipAuto([ctx.b.zipAuto([d0y, d1y], add, floatFieldType), d2y], add, floatFieldType);

      const tangentLenSq = ctx.b.zipAuto(
        [ctx.b.zipAuto([tangentX, tangentX], mul, floatFieldType), ctx.b.zipAuto([tangentY, tangentY], mul, floatFieldType)],
        add,
        floatFieldType,
      );
      const tangentLen = ctx.b.mapAuto(tangentLenSq, sqrt, floatFieldType);
      const tangentLenSafe = ctx.b.zipAuto([tangentLen, epsBroadcast], max, floatFieldType);
      const invLen = ctx.b.zipAuto([oneBroadcast, tangentLenSafe], div, floatFieldType);

      const normalX = ctx.b.zipAuto([ctx.b.zipAuto([minusOneBroadcast, tangentY], mul, floatFieldType), invLen], mul, floatFieldType);
      const normalY = ctx.b.zipAuto([tangentX, invLen], mul, floatFieldType);
      const halfThickness = ctx.b.zipAuto([thickness, halfBroadcast], mul, floatFieldType);
      const railSign = ctx.b.zipAuto(
        [ctx.b.zipAuto([isUpperRail, twoBroadcast], mul, floatFieldType), oneBroadcast],
        sub,
        floatFieldType,
      );
      const offset = ctx.b.zipAuto([railSign, halfThickness], mul, floatFieldType);

      const ribbonX = ctx.b.zipAuto([x, ctx.b.zipAuto([normalX, offset], mul, floatFieldType)], add, floatFieldType);
      const ribbonY = ctx.b.zipAuto([y, ctx.b.zipAuto([normalY, offset], mul, floatFieldType)], add, floatFieldType);

      const controlPoints = ctx.b.construct([ribbonX, ribbonY], vec2FieldType);
      const shapeRef = ctx.b.shapeRef(topologyId, [], canonicalType(SHAPE), controlPoints);

      const shapeType = ctx.outTypes[0];
      const controlPointsType = withInstance(ctx.outTypes[1], ref);
      const tType = withInstance(ctx.outTypes[2], ref);

      return {
        outputsById: {
          shape: { id: shapeRef, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
          controlPoints: {
            id: controlPoints,
            slot: undefined,
            type: controlPointsType,
            stride: payloadStride(controlPointsType.payload),
          },
          t: {
            id: t,
            slot: undefined,
            type: tType,
            stride: payloadStride(tType.payload),
          },
        },
        effects: {
          slotRequests: [
            { portId: 'shape', type: shapeType },
            { portId: 'controlPoints', type: controlPointsType },
            { portId: 't', type: tType },
          ],
        },
        instanceContext: controlInstance,
      };
    },
  });
}
