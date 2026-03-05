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

      const resolutionInput = inputsById.resolution;
      if (!resolutionInput) throw new Error('CubicBezier2D: resolution input not wired — normalization bug');
      const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 4, max: 4096 });
      const sampleCount = resolution + 1;

      // [LAW:one-source-of-truth] Parametric sample topology is derived once
      // from compile-time resolution and reused by all runtime instances.
      const topologyId = ctx.b.registerTopology(
        createLinePathTopology(sampleCount, true),
        `cubic-bezier-${sampleCount}`,
      );

      const controlInstance = ctx.b.createInstance(DOMAIN_CONTROL, sampleCount, undefined, 'static');
      const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
      const vec2FieldType = canonicalMany(VEC2, { kind: 'none' }, ref);

      const indexField = ctx.b.intrinsic('index', canonicalMany(INT, { kind: 'none' }, ref));
      const resolutionAsFloat = ctx.b.constant(floatConst(resolution), canonicalType(FLOAT));
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const three = ctx.b.constant(floatConst(3), canonicalType(FLOAT));

      const div = ctx.b.opcode(OpCode.Div);
      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);

      const resolutionBroadcast = ctx.b.broadcast(resolutionAsFloat, floatFieldType);
      const oneBroadcast = ctx.b.broadcast(one, floatFieldType);
      const threeBroadcast = ctx.b.broadcast(three, floatFieldType);

      const t = ctx.b.zipAuto([indexField, resolutionBroadcast], div, floatFieldType);
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

      const controlPoints = ctx.b.construct([x, y], vec2FieldType);
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
