import { registerBlock } from '../registry';
import {
  canonicalManyDef,
  canonicalType,
  payloadStride,
  unitNone,
  unitOklch,
  withInstance,
  COLOR,
  FLOAT,
  SHAPE,
  VEC2,
} from '../../core/canonical-types';
import { DOMAIN_SHAPE } from '../../core/domain-registry';
import { defaultSource, defaultSourceConst } from '../../types';
import { promoteToMany } from '../lower-utils';

export function register(): void {
  registerBlock({
    type: 'WebGPUType1Sink',
    label: 'WebGPU Type 1 Sink',
    category: 'render',
    description: 'Canonical WebGPU Type 1 sink for rigid-shape bootstrap rendering',
    form: 'primitive',
    capability: 'render',
    gpuVerified: true,
    loweringPurity: 'impure',
    inputs: {
      shape: {
        label: 'Shape',
        type: canonicalType(SHAPE),
        defaulting: 'forbidden',
      },
      posX: {
        label: 'Position X',
        type: canonicalType(FLOAT),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
      posY: {
        label: 'Position Y',
        type: canonicalType(FLOAT),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
      rot: {
        label: 'Rotation',
        type: canonicalType(FLOAT),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -6.28, max: 6.28, step: 0.01 },
      },
      scale: {
        label: 'Scale',
        type: canonicalType(FLOAT),
        defaultValue: 1,
        defaultSource: defaultSourceConst(1),
        uiHint: { kind: 'slider', min: 0.1, max: 2, step: 0.01 },
      },
      color: {
        label: 'Color',
        type: canonicalType(COLOR, unitOklch()),
        defaultSource: defaultSource('Const', 'out', {
          value: { r: 0.08, g: 0.22, b: 0.72, a: 1 },
        }),
        uiHint: { kind: 'color' },
      },
    },
    outputs: {
      _position: { hidden: true, type: canonicalManyDef(VEC2, unitNone()) },
      _color: { hidden: true, type: canonicalManyDef(COLOR, unitOklch()) },
      _scale: { hidden: true, type: canonicalManyDef(FLOAT, unitNone()) },
      _rotation: { hidden: true, type: canonicalManyDef(FLOAT, unitNone()) },
      _shape: { hidden: true, type: canonicalManyDef(SHAPE, unitNone()) },
    },
    lower: ({ ctx, inputsById }) => {
      const shapeInput = inputsById.shape;
      const posXInput = inputsById.posX;
      const posYInput = inputsById.posY;
      const rotInput = inputsById.rot;
      const scaleInput = inputsById.scale;
      const colorInput = inputsById.color;

      if (!shapeInput || !posXInput || !posYInput || !rotInput || !scaleInput || !colorInput) {
        throw new Error('WebGPUType1Sink: missing required bootstrap input — normalization bug');
      }

      const instanceId = ctx.b.createInstance(DOMAIN_SHAPE, 1, undefined, 'static');
      const instanceDecl = ctx.instances.get(instanceId);
      if (!instanceDecl) {
        throw new Error(`WebGPUType1Sink: instance '${String(instanceId)}' not found in instance registry`);
      }
      const instance = { domainTypeId: instanceDecl.domainType, instanceId };
      const positionType = withInstance(ctx.outTypes[0], instance);
      const colorType = withInstance(ctx.outTypes[1], instance);
      const scaleType = withInstance(ctx.outTypes[2], instance);
      const rotationType = withInstance(ctx.outTypes[3], instance);
      const shapeType = withInstance(ctx.outTypes[4], instance);
      const scalarFieldType = withInstance(canonicalManyDef(FLOAT, unitNone()), instance);
      const posXField = promoteToMany(posXInput.id, scalarFieldType, ctx.b, posXInput.components);
      const posYField = promoteToMany(posYInput.id, scalarFieldType, ctx.b, posYInput.components);
      const positionField = ctx.b.construct([posXField, posYField], positionType);
      const colorField = promoteToMany(colorInput.id, colorType, ctx.b, colorInput.components);
      const scaleField = promoteToMany(scaleInput.id, scaleType, ctx.b, scaleInput.components);
      const rotationField = promoteToMany(rotInput.id, rotationType, ctx.b, rotInput.components);
      const shapeField = promoteToMany(shapeInput.id, shapeType, ctx.b, shapeInput.components);

      return {
        outputsById: {
          _position: { id: positionField, slot: undefined, type: positionType, stride: payloadStride(positionType.payload) },
          _color: { id: colorField, slot: undefined, type: colorType, stride: payloadStride(colorType.payload), components: colorInput.components },
          _scale: { id: scaleField, slot: undefined, type: scaleType, stride: payloadStride(scaleType.payload) },
          _rotation: { id: rotationField, slot: undefined, type: rotationType, stride: payloadStride(rotationType.payload) },
          _shape: { id: shapeField, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: '_position', type: positionType },
            { portId: '_color', type: colorType },
            { portId: '_scale', type: scaleType },
            { portId: '_rotation', type: rotationType },
            { portId: '_shape', type: shapeType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
