import { registerBlock } from '../registry';
import {
  canonicalType,
  payloadStride,
  withInstance,
  instanceRef,
  requireInst,
  vec2Const,
  colorConst,
  unitNone,
  unitHsl,
  VEC2,
  COLOR,
  SHAPE,
  INT,
  FLOAT,
} from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';
import { defaultSource } from '../../types';

// [LAW:one-source-of-truth] Fluid output cardinality + instance ownership are
// declared once in port types and reused across lowering/runtime metadata.
const FLUID_OUTPUT_CARD = cardinalityVar(cardinalityVarId('fluid_outputs'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: { kind: 'create', domainType: DOMAIN_CIRCLE },
});

function coerceCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 8192;
  return Math.max(64, Math.min(65_536, Math.floor(value)));
}

export function register(): void {
  registerBlock({
    type: 'FluidDynamics2D',
    label: 'Fluid Dynamics 2D',
    category: 'fluid',
    description: 'GPU fluid field source for RenderInstances2D sinks',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      shape: {
        label: 'Shape',
        type: canonicalType(SHAPE),
        defaultSource: defaultSource('Ellipse', 'shape'),
      },
      count: {
        label: 'Count',
        type: canonicalType(INT),
        defaultValue: 8192,
        exposedAsPort: false,
        semantic: 'instanceCount',
        uiHint: { kind: 'slider', min: 256, max: 32768, step: 256 },
      },
      simResolution: {
        label: 'Sim Resolution',
        type: canonicalType(INT),
        defaultValue: 128,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 32, max: 512, step: 32 },
      },
      velocityDissipation: {
        label: 'Velocity Dissipation',
        type: canonicalType(FLOAT),
        defaultValue: 0.992,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 0.85, max: 0.9995, step: 0.0005 },
      },
      dyeDissipation: {
        label: 'Dye Dissipation',
        type: canonicalType(FLOAT),
        defaultValue: 0.996,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 0.85, max: 0.9999, step: 0.0005 },
      },
      vorticity: {
        label: 'Vorticity',
        type: canonicalType(FLOAT),
        defaultValue: 18.0,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 0, max: 96, step: 0.5 },
      },
      splatRadius: {
        label: 'Splat Radius',
        type: canonicalType(FLOAT),
        defaultValue: 20.0,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 2, max: 128, step: 1 },
      },
      advection: {
        label: 'Advection',
        type: canonicalType(FLOAT),
        defaultValue: 1.0,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 0.1, max: 3, step: 0.01 },
      },
      particleScale: {
        label: 'Particle Scale',
        type: canonicalType(FLOAT),
        defaultValue: 0.02,
        exposedAsPort: false,
        uiHint: { kind: 'slider', min: 0.001, max: 0.08, step: 0.001 },
      },
    },
    outputs: {
      controlPoints: {
        label: 'Control Points',
        type: inferType(VEC2, unitNone(), { cardinality: FLUID_OUTPUT_CARD }),
      },
      color: {
        label: 'Color',
        type: inferType(COLOR, unitHsl(), { cardinality: FLUID_OUTPUT_CARD }),
      },
    },
    lower: ({ ctx, inputsById, config }) => {
      const shapeInput = inputsById.shape;
      if (!shapeInput || requireInst(shapeInput.type.extent.cardinality, 'cardinality').kind !== 'one') {
        throw new Error('FluidDynamics2D requires a one-cardinality shape input');
      }

      const count = coerceCount(config.count);
      const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, shapeInput.id);
      const instanceDecl = ctx.instances.get(instanceId);
      if (!instanceDecl) {
        throw new Error('FluidDynamics2D failed to resolve created instance declaration');
      }
      const instance = instanceRef(instanceDecl.domainType as string, instanceId as string);
      const controlPointsType = withInstance(ctx.outTypes[0], instance);
      const colorType = withInstance(ctx.outTypes[1], instance);

      // [LAW:dataflow-not-control-flow] Fluid runtime ownership is established
      // by emitting canonical field slots every compile; shader variability is
      // expressed through data, not optional lowering branches.
      const defaultControl = ctx.b.constant(vec2Const(0.5, 0.5), canonicalType(VEC2));
      const defaultColor = ctx.b.constant(colorConst(0.1, 0.2, 0.95, 1.0), canonicalType(COLOR, unitHsl()));
      const controlField = ctx.b.broadcast(defaultControl, controlPointsType);
      const colorField = ctx.b.broadcast(defaultColor, colorType);

      return {
        outputsById: {
          controlPoints: {
            id: controlField,
            slot: undefined,
            type: controlPointsType,
            stride: payloadStride(controlPointsType.payload),
          },
          color: {
            id: colorField,
            slot: undefined,
            type: colorType,
            stride: payloadStride(colorType.payload),
          },
        },
        effects: {
          slotRequests: [
            { portId: 'controlPoints', type: controlPointsType },
            { portId: 'color', type: colorType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
