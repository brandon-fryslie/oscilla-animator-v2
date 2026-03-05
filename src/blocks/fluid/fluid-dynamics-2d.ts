import { registerBlock } from '../registry';
import {
  canonicalType,
  payloadStride,
  withInstance,
  instanceRef,
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
import { defaultSource, defaultSourceConst } from '../../types';
import { resolveInputConstant } from '../lower-utils';

// [LAW:one-source-of-truth] Fluid output cardinality + instance ownership are
// declared once in port types and reused across lowering/runtime metadata.
const FLUID_OUTPUT_CARD = cardinalityVar(cardinalityVarId('fluid_outputs'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: { kind: 'create', domainType: DOMAIN_CIRCLE },
});

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
        // [LAW:one-source-of-truth] defaultValue drives UI defaults; defaultSource
        // is the canonical compile-time fallback source materialized by frontend.
        defaultValue: 8192,
        defaultSource: defaultSourceConst(8192),
        semantic: 'instanceCount',
        uiHint: { kind: 'slider', min: 256, max: 32768, step: 256 },
      },
      simResolution: {
        label: 'Sim Resolution',
        type: canonicalType(INT),
        defaultValue: 128,
        defaultSource: defaultSourceConst(128),
        uiHint: { kind: 'slider', min: 32, max: 512, step: 32 },
      },
      velocityDissipation: {
        label: 'Velocity Dissipation',
        type: canonicalType(FLOAT),
        defaultValue: 0.992,
        defaultSource: defaultSourceConst(0.992),
        uiHint: { kind: 'slider', min: 0.85, max: 0.9995, step: 0.0005 },
      },
      dyeDissipation: {
        label: 'Dye Dissipation',
        type: canonicalType(FLOAT),
        defaultValue: 0.996,
        defaultSource: defaultSourceConst(0.996),
        uiHint: { kind: 'slider', min: 0.85, max: 0.9999, step: 0.0005 },
      },
      vorticity: {
        label: 'Vorticity',
        type: canonicalType(FLOAT),
        defaultValue: 18.0,
        defaultSource: defaultSourceConst(18.0),
        uiHint: { kind: 'slider', min: 0, max: 96, step: 0.5 },
      },
      splatRadius: {
        label: 'Splat Radius',
        type: canonicalType(FLOAT),
        defaultValue: 20.0,
        defaultSource: defaultSourceConst(20.0),
        uiHint: { kind: 'slider', min: 2, max: 128, step: 1 },
      },
      advection: {
        label: 'Advection',
        type: canonicalType(FLOAT),
        defaultValue: 1.0,
        defaultSource: defaultSourceConst(1.0),
        uiHint: { kind: 'slider', min: 0.1, max: 3, step: 0.01 },
      },
      particleScale: {
        label: 'Particle Scale',
        type: canonicalType(FLOAT),
        defaultValue: 0.02,
        defaultSource: defaultSourceConst(0.02),
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
      // [LAW:single-enforcer] Hidden outputs are the canonical parameter bridge
      // consumed by fluid bundle lowering; user-facing UI stays on block inputs.
      _simResolution: { hidden: true, type: canonicalType(INT) },
      _velocityDissipation: { hidden: true, type: canonicalType(FLOAT) },
      _dyeDissipation: { hidden: true, type: canonicalType(FLOAT) },
      _vorticity: { hidden: true, type: canonicalType(FLOAT) },
      _splatRadius: { hidden: true, type: canonicalType(FLOAT) },
      _advection: { hidden: true, type: canonicalType(FLOAT) },
      _particleScale: { hidden: true, type: canonicalType(FLOAT) },
    },
    lower: ({ ctx, inputsById }) => {
      const shapeInput = inputsById.shape;
      const countInput = inputsById.count;
      const count = resolveInputConstant(ctx, countInput, 'count', { min: 64, max: 65_536 });
      const simResolution = inputsById.simResolution;
      const velocityDissipation = inputsById.velocityDissipation;
      const dyeDissipation = inputsById.dyeDissipation;
      const vorticity = inputsById.vorticity;
      const splatRadius = inputsById.splatRadius;
      const advection = inputsById.advection;
      const particleScale = inputsById.particleScale;
      const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, shapeInput.id);
      const instanceDecl = ctx.instances.get(instanceId)!;
      const instance = instanceRef(instanceDecl.domainType as string, instanceId as string);
      const controlPointsType = withInstance(ctx.outTypes[0], instance);
      const colorType = withInstance(ctx.outTypes[1], instance);

      // [LAW:dataflow-not-control-flow] Fluid runtime ownership is established
      // by emitting canonical field slots every compile; shader variability is
      // expressed through data, not optional lowering branches.
      const defaultControl = ctx.b.constant(vec2Const(0.5, 0.5), canonicalType(VEC2));
      // TODO(architecture): Replace authored color output with a first-class
      // fluid shading contract once renderer presentation supports it.
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
          _simResolution: simResolution,
          _velocityDissipation: velocityDissipation,
          _dyeDissipation: dyeDissipation,
          _vorticity: vorticity,
          _splatRadius: splatRadius,
          _advection: advection,
          _particleScale: particleScale,
        },
        effects: {
          slotRequests: [
            { portId: 'controlPoints', type: controlPointsType },
            { portId: 'color', type: colorType },
            { portId: '_simResolution', type: simResolution.type },
            { portId: '_velocityDissipation', type: velocityDissipation.type },
            { portId: '_dyeDissipation', type: dyeDissipation.type },
            { portId: '_vorticity', type: vorticity.type },
            { portId: '_splatRadius', type: splatRadius.type },
            { portId: '_advection', type: advection.type },
            { portId: '_particleScale', type: particleScale.type },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
