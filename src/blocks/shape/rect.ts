/**
 * Rect Block
 *
 * Geometry generator that creates rounded-rect control points.
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
import { FLOAT, SHAPE, INT, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { registerDynamicTopology } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { resolveInputConstant } from '../lower-utils';
import { createLinePathTopology } from './_topology-helpers';

/**
 * Rect - Geometry generator
 *
 * Produces:
 * - One<shape> handle for instancing/rendering
 * - Field<vec2> control points for deformation pipelines
 *
 * cornerRadius controls the superellipse exponent:
 * - 0.0 => box-like corners
 * - larger => more rounded, approaching an ellipse.
 */
export function register(): void {
  registerBlock({
    type: 'Rect',
    label: 'Rect',
    category: 'shape',
    description: 'Generates rounded-rect geometry as Field<vec2> control points',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
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
      resolution: {
        label: 'Resolution',
        type: canonicalType(INT),
        defaultValue: 64,
        defaultSource: defaultSourceConst(64),
        uiHint: { kind: 'slider', min: 8, max: 256, step: 1 },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(SHAPE) },
      controlPoints: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      // Post-normalization: all inputs guaranteed wired — no fallback needed
      // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
      const widthInput = inputsById.width;
      if (!widthInput) throw new Error('Rect: width input not wired — normalization bug');
      const widthSig = widthInput.id;
  
      const heightInput = inputsById.height;
      if (!heightInput) throw new Error('Rect: height input not wired — normalization bug');
      const heightSig = heightInput.id;
  
      const rotationInput = inputsById.rotation;
      if (!rotationInput) throw new Error('Rect: rotation input not wired — normalization bug');
      const rotationSig = rotationInput.id;
  
      const cornerRadiusInput = inputsById.cornerRadius;
      if (!cornerRadiusInput) throw new Error('Rect: cornerRadius input not wired — normalization bug');
      const cornerRadiusSig = cornerRadiusInput.id;
  
      const resolutionInput = inputsById.resolution;
      if (!resolutionInput) throw new Error('Rect: resolution input not wired — normalization bug');
      const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 8, max: 2048 });
  
      // [LAW:one-source-of-truth] Geometry topology is declared at generation time and
      // shape handles reference the same control-point field used by deformation/layout.
      const topologyId = registerDynamicTopology(
        createLinePathTopology(resolution, true),
        `rect-${resolution}`
      );
  
      const controlInstance = ctx.b.createInstance(DOMAIN_CONTROL, resolution, undefined, 'static');
      const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
      const vec2FieldType = canonicalMany(VEC2, { kind: 'none' }, ref);
      const floatOneType = canonicalType(FLOAT);
  
      const indexField = ctx.b.intrinsic('index', canonicalMany(INT, { kind: 'none' }, ref));
      const resolutionSig = ctx.b.constant(floatConst(resolution), canonicalType(FLOAT));
  
      const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const constHalf = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
      const constExponentMin = ctx.b.constant(floatConst(0.2), canonicalType(FLOAT));
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
  
      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);
      const div = ctx.b.opcode(OpCode.Div);
      const min = ctx.b.opcode(OpCode.Min);
      const abs = ctx.b.opcode(OpCode.Abs);
      const sign = ctx.b.opcode(OpCode.Sign);
      const pow = ctx.b.opcode(OpCode.Pow);
      const clamp = ctx.b.opcode(OpCode.Clamp);
      const lerp = ctx.b.opcode(OpCode.Lerp);
      const cos = ctx.b.opcode(OpCode.Cos);
      const sin = ctx.b.opcode(OpCode.Sin);
  
      const resolutionBroadcast = ctx.b.broadcast(resolutionSig, floatFieldType);
      const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
      const angleFrac = ctx.b.zipAuto([indexField, resolutionBroadcast], div, floatFieldType);
      const angle = ctx.b.zipAuto([angleFrac, twoPiBroadcast], mul, floatFieldType);
  
      const cosAngle = ctx.b.mapAuto(angle, cos, floatFieldType);
      const sinAngle = ctx.b.mapAuto(angle, sin, floatFieldType);
      const absCos = ctx.b.mapAuto(cosAngle, abs, floatFieldType);
      const absSin = ctx.b.mapAuto(sinAngle, abs, floatFieldType);
      const signCos = ctx.b.mapAuto(cosAngle, sign, floatFieldType);
      const signSin = ctx.b.mapAuto(sinAngle, sign, floatFieldType);
  
      const halfWidth = ctx.b.zipAuto([widthSig, constHalf], mul, floatOneType);
      const halfHeight = ctx.b.zipAuto([heightSig, constHalf], mul, floatOneType);
      const minHalf = ctx.b.zipAuto([halfWidth, halfHeight], min, floatOneType);
      const cornerNormRaw = ctx.b.zipAuto([cornerRadiusSig, minHalf], div, floatOneType);
      const cornerNorm = ctx.b.zipAuto([cornerNormRaw, const0, const1], clamp, floatOneType);
      const exponent = ctx.b.zipAuto([constExponentMin, const1, cornerNorm], lerp, floatOneType);
  
      const powCos = ctx.b.zipAuto([absCos, exponent], pow, floatFieldType);
      const powSin = ctx.b.zipAuto([absSin, exponent], pow, floatFieldType);
      const xUnit = ctx.b.zipAuto([signCos, powCos], mul, floatFieldType);
      const yUnit = ctx.b.zipAuto([signSin, powSin], mul, floatFieldType);
  
      const xBase = ctx.b.zipAuto([xUnit, halfWidth], mul, floatFieldType);
      const yBase = ctx.b.zipAuto([yUnit, halfHeight], mul, floatFieldType);
  
      const cosRot = ctx.b.mapAuto(rotationSig, cos, floatOneType);
      const sinRot = ctx.b.mapAuto(rotationSig, sin, floatOneType);
  
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
        canonicalType(SHAPE),
        controlPoints
      );
  
      const shapeType = ctx.outTypes[0];
      const controlPointsType = withInstance(ctx.outTypes[1], ref);
  
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
}
