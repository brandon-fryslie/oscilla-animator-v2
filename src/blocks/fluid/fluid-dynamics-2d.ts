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
    // [LAW:single-enforcer] LowerSandbox (`src/compiler/ir/LowerSandbox.ts`)
    // allows macro expansion only for `loweringPurity: 'pure'`. This block
    // emits instance/slot effect metadata and must stay out of pure-macro path.
    loweringPurity: 'impure',
    inputs: {
      // Input semantics:
      // - count: number of fluid particles represented in presentation
      // - simResolution: solver grid resolution
      // - velocity/dye dissipation: per-step damping factors
      // - vorticity: confinement gain for swirl
      // - splatRadius: input injection radius
      // - advection: advection scale factor
      // - particleScale: present-stage particle size multiplier
      shape: {
        label: 'Shape',
        type: canonicalType(SHAPE),
        defaultSource: defaultSource('Ellipse', 'shape'),
      },
      count: {
        label: 'Count',
        type: canonicalType(INT),
        // description: "Number of fluid particles represented in presentation."
        defaultSource: defaultSourceConst(8192),
        semantic: 'instanceCount',
        uiHint: { kind: 'slider', min: 256, max: 32768, step: 256 },
      },
      simResolution: {
        label: 'Sim Resolution',
        type: canonicalType(INT),
        // description: "Square simulation-grid resolution used by the solver."
        defaultSource: defaultSourceConst(128),
        uiHint: { kind: 'slider', min: 32, max: 512, step: 32 },
      },
      velocityDissipation: {
        label: 'Velocity Dissipation',
        type: canonicalType(FLOAT),
        // description: "Per-step velocity damping factor."
        defaultSource: defaultSourceConst(0.992),
        uiHint: { kind: 'slider', min: 0.85, max: 0.9995, step: 0.0005 },
      },
      dyeDissipation: {
        label: 'Dye Dissipation',
        type: canonicalType(FLOAT),
        // description: "Per-step dye/color damping factor."
        defaultSource: defaultSourceConst(0.996),
        uiHint: { kind: 'slider', min: 0.85, max: 0.9999, step: 0.0005 },
      },
      vorticity: {
        label: 'Vorticity',
        type: canonicalType(FLOAT),
        // description: "Vorticity confinement gain applied during solve."
        defaultSource: defaultSourceConst(18.0),
        uiHint: { kind: 'slider', min: 0, max: 96, step: 0.5 },
      },
      splatRadius: {
        label: 'Splat Radius',
        type: canonicalType(FLOAT),
        // description: "Mouse/input injection radius in simulation space."
        defaultSource: defaultSourceConst(20.0),
        uiHint: { kind: 'slider', min: 2, max: 128, step: 1 },
      },
      advection: {
        label: 'Advection',
        type: canonicalType(FLOAT),
        // description: "Advection scale factor for velocity transport."
        defaultSource: defaultSourceConst(1.0),
        uiHint: { kind: 'slider', min: 0.1, max: 3, step: 0.01 },
      },
      particleScale: {
        label: 'Particle Scale',
        type: canonicalType(FLOAT),
        // description: "Presentation particle size multiplier."
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
        // TODO(architecture): Replace explicit color output with a first-class
        // fluid shading contract once renderer presentation supports it.
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
      const instance = instanceRef(String(instanceDecl.domainType), String(instanceId));
      const controlPointsType = withInstance(ctx.outTypes[0], instance);
      const colorType = withInstance(ctx.outTypes[1], instance);

      // [LAW:dataflow-not-control-flow] Fluid runtime ownership is established
      // by emitting canonical field slots every compile; shader variability is
      // expressed through data, not optional lowering branches.
      // [LAW:one-source-of-truth] Fluid control points default to world origin
      // so fluid and shape layouts share the same zero-centered world contract.
      const defaultControl = ctx.b.constant(vec2Const(0, 0), canonicalType(VEC2));
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
