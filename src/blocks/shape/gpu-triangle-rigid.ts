import { registerBlock } from '../registry';
import {
  canonicalMany,
  canonicalType,
  floatConst,
  instanceRef,
  payloadStride,
  unitNone,
  withInstance,
  FLOAT,
  INT,
  SHAPE,
  VEC2,
} from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { promoteToMany, resolveInputConstant } from '../lower-utils';
import { createLinePathTopology } from './_topology-helpers';

export function register(): void {
  registerBlock({
    type: 'GpuTriangleRigid',
    label: 'GPU Triangle Rigid',
    category: 'shape',
    description: 'Canonical Type 1 triangle source for the WebGPU bootstrap path',
    form: 'primitive',
    capability: 'pure',
    gpuVerified: true,
    loweringPurity: 'pure',
    inputs: {
      size: {
        label: 'Size',
        type: canonicalType(FLOAT),
        defaultValue: 0.28,
        defaultSource: defaultSourceConst(0.28),
        uiHint: { kind: 'slider', min: 0.05, max: 0.75, step: 0.01 },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(SHAPE) },
    },
    lower: ({ ctx, inputsById }) => {
      const sizeInput = inputsById.size;
      if (!sizeInput) {
        throw new Error('GpuTriangleRigid: size input not wired — normalization bug');
      }

      const topologyId = ctx.b.registerTopology(createLinePathTopology(3, true), 'gpu-triangle-rigid');
      const controlInstance = ctx.b.createInstance(DOMAIN_CONTROL, 3, undefined, 'static');
      const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
      const floatFieldType = canonicalMany(FLOAT, unitNone(), ref);
      const vec2FieldType = canonicalMany(VEC2, unitNone(), ref);

      const indexField = ctx.b.intrinsic('index', canonicalMany(INT, unitNone(), ref));
      const pointCount = ctx.b.constant(floatConst(3), canonicalType(FLOAT));
      const pointCountField = promoteToMany(pointCount, floatFieldType, ctx.b);
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
      const twoPiField = promoteToMany(twoPi, floatFieldType, ctx.b);
      const sizeField = promoteToMany(sizeInput.id, floatFieldType, ctx.b, sizeInput.components);
      const halfPi = ctx.b.constant(floatConst(Math.PI / 2), canonicalType(FLOAT));
      const halfPiField = promoteToMany(halfPi, floatFieldType, ctx.b);

      const div = ctx.b.opcode(OpCode.Div);
      const mul = ctx.b.opcode(OpCode.Mul);
      const add = ctx.b.opcode(OpCode.Add);
      const cos = ctx.b.opcode(OpCode.Cos);
      const sin = ctx.b.opcode(OpCode.Sin);

      const angleFrac = ctx.b.zipAuto([indexField, pointCountField], div, floatFieldType);
      const angleBase = ctx.b.zipAuto([angleFrac, twoPiField], mul, floatFieldType);
      const angle = ctx.b.zipAuto([angleBase, halfPiField], add, floatFieldType);
      const x = ctx.b.zipAuto([ctx.b.mapAuto(angle, cos, floatFieldType), sizeField], mul, floatFieldType);
      const y = ctx.b.zipAuto([ctx.b.mapAuto(angle, sin, floatFieldType), sizeField], mul, floatFieldType);
      const controlPoints = ctx.b.construct([x, y], vec2FieldType);
      const shapeRefSig = ctx.b.shapeRef(topologyId, [], canonicalType(SHAPE), controlPoints);
      const shapeType = ctx.outTypes[0];

      return {
        outputsById: {
          shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'shape', type: shapeType }],
        },
      };
    },
  });
}
