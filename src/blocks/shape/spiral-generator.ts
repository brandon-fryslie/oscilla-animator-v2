/**
 * SpiralGenerator Block
 *
 * Generates an Archimedean spiral as Field<vec2> control points + assembled Signal<shape2d>.
 * Demonstrates the Generator pattern: topology is compile-time, vertex positions are runtime.
 *
 * Vertex math:
 *   t      = index / (resolution - 1)     // 0..1
 *   angle  = t * turns * 2PI
 *   radius = innerRadius + t * growth
 *   x      = cos(angle) * radius
 *   y      = sin(angle) * radius
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalField, payloadStride, floatConst, intConst, withInstance, instanceRef } from '../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../core/canonical-types';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { registerDynamicTopology } from '../../shapes/registry';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { resolveInputConstant } from '../lower-utils';
import { createLinePathTopology } from './_topology-helpers';

/**
 * SpiralGenerator - Creates an Archimedean spiral
 *
 * Generates spiral vertices on an open path with configurable turns and growth.
 * The spiral is defined by:
 * - Topology: N vertices connected by LINE segments, open path (compile-time)
 * - Control points: Field<vec2> with spiral positions (runtime)
 *
 * Outputs:
 * - shape: Signal<shape2d> with path topology + control point field
 * - controlPoints: Field<vec2> for vertex positions (can be deformed via math blocks)
 *
 * Example usage:
 * ```
 * SpiralGenerator(resolution=64, turns=3.0, growth=0.3)  -> 3-turn spiral
 * SpiralGenerator(resolution=128, turns=5.0, growth=0.1) -> tight 5-turn spiral
 * ```
 */
registerBlock({
  type: 'SpiralGenerator',
  label: 'Spiral',
  category: 'shape',
  description: 'Creates an Archimedean spiral with configurable turns and growth',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
    domainType: DOMAIN_CONTROL,
  },
  inputs: {
    resolution: {
      label: 'Resolution',
      type: canonicalType(INT),
      defaultValue: 64,
      defaultSource: defaultSourceConst(64),
      uiHint: { kind: 'slider', min: 3, max: 500, step: 1 },
    },
    turns: {
      label: 'Turns',
      type: canonicalType(FLOAT),
      defaultValue: 3.0,
      defaultSource: defaultSourceConst(3.0),
      uiHint: { kind: 'slider', min: 0.1, max: 20, step: 0.1 },
    },
    growth: {
      label: 'Growth',
      type: canonicalType(FLOAT),
      defaultValue: 0.3,
      defaultSource: defaultSourceConst(0.3),
      uiHint: { kind: 'slider', min: 0.01, max: 1.0, step: 0.01 },
    },
    innerRadius: {
      label: 'Inner Radius',
      type: canonicalType(FLOAT),
      defaultValue: 0.0,
      defaultSource: defaultSourceConst(0.0),
      uiHint: { kind: 'slider', min: 0, max: 0.5, step: 0.01 },
    },
  },
  outputs: {
    shape: { label: 'Shape', type: canonicalType(FLOAT) },
    controlPoints: { label: 'Control Points', type: canonicalField(VEC2, { kind: 'none' }, { instanceId: makeInstanceId('control'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    // Get resolution from input (must be compile-time constant)
    const resolutionInput = inputsById.resolution;
    if (!resolutionInput) throw new Error('SpiralGenerator: resolution input not wired — normalization bug');
    const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 3, max: 500 });

    // Create open-path topology
    const topology = createLinePathTopology(resolution, false);
    const topologyId = registerDynamicTopology(topology, `spiral-${resolution}`);

    // Create instance over DOMAIN_CONTROL
    const controlInstance = ctx.b.createInstance(
      DOMAIN_CONTROL,
      resolution,
      undefined,
      'static'
    );

    const ref = instanceRef(DOMAIN_CONTROL as string, controlInstance as string);

    // Intrinsic index field
    const indexField = ctx.b.intrinsic('index',
      canonicalField(INT, { kind: 'none' }, ref)
    );

    // Read runtime inputs
    const turnsInput = inputsById.turns;
    if (!turnsInput) throw new Error('SpiralGenerator: turns input not wired — normalization bug');
    const turnsSig = turnsInput.id;

    const growthInput = inputsById.growth;
    if (!growthInput) throw new Error('SpiralGenerator: growth input not wired — normalization bug');
    const growthSig = growthInput.id;

    const innerRadiusInput = inputsById.innerRadius;
    if (!innerRadiusInput) throw new Error('SpiralGenerator: innerRadius input not wired — normalization bug');
    const innerRadiusSig = innerRadiusInput.id;

    // ═══════════════════════════════════════════════════════════════════════
    // SPIRAL VERTEX COMPUTATION
    // ═══════════════════════════════════════════════════════════════════════
    //
    //   t      = index / (resolution - 1)     // 0..1
    //   angle  = t * turns * 2PI
    //   radius = innerRadius + t * growth
    //   x      = cos(angle) * radius
    //   y      = sin(angle) * radius
    //
    // ═══════════════════════════════════════════════════════════════════════

    // Constants
    const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
    const resMinusOne = ctx.b.constant(floatConst(resolution - 1), canonicalType(FLOAT));

    // Field type for intermediates
    const floatFieldType = canonicalField(FLOAT, { kind: 'none' }, ref);

    // Broadcast signals to field extent
    const turnsBroadcast = ctx.b.broadcast(turnsSig, floatFieldType);
    const growthBroadcast = ctx.b.broadcast(growthSig, floatFieldType);
    const innerRadiusBroadcast = ctx.b.broadcast(innerRadiusSig, floatFieldType);
    const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
    const resMinusOneBroadcast = ctx.b.broadcast(resMinusOne, floatFieldType);

    // Opcodes
    const div = ctx.b.opcode(OpCode.Div);
    const mul = ctx.b.opcode(OpCode.Mul);
    const add = ctx.b.opcode(OpCode.Add);
    const cos = ctx.b.opcode(OpCode.Cos);
    const sin = ctx.b.opcode(OpCode.Sin);

    // Step 1: t = index / (resolution - 1)
    const t = ctx.b.zipAuto([indexField, resMinusOneBroadcast], div, floatFieldType);

    // Step 2: angle = t * turns * 2PI
    const tTimesTurns = ctx.b.zipAuto([t, turnsBroadcast], mul, floatFieldType);
    const angle = ctx.b.zipAuto([tTimesTurns, twoPiBroadcast], mul, floatFieldType);

    // Step 3: radius = innerRadius + t * growth
    const tTimesGrowth = ctx.b.zipAuto([t, growthBroadcast], mul, floatFieldType);
    const radius = ctx.b.zipAuto([innerRadiusBroadcast, tTimesGrowth], add, floatFieldType);

    // Step 4: x = cos(angle) * radius, y = sin(angle) * radius
    const cosAngle = ctx.b.mapAuto(angle, cos, floatFieldType);
    const sinAngle = ctx.b.mapAuto(angle, sin, floatFieldType);
    const xField = ctx.b.zipAuto([cosAngle, radius], mul, floatFieldType);
    const yField = ctx.b.zipAuto([sinAngle, radius], mul, floatFieldType);

    // Step 5: construct([x, y]) -> vec2
    const computedPositions = ctx.b.construct(
      [xField, yField],
      canonicalField(VEC2, { kind: 'none' }, ref)
    );

    // Create shape reference
    const shapeRefSig = ctx.b.shapeRef(
      topologyId,
      [],
      canonicalType(FLOAT),
      computedPositions
    );

    const shapeType = ctx.outTypes[0];
    const cpType = withInstance(ctx.outTypes[1], ref);

    return {
      outputsById: {
        shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
        controlPoints: { id: computedPositions, slot: undefined, type: cpType, stride: payloadStride(cpType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'shape', type: shapeType },
          { portId: 'controlPoints', type: cpType },
        ],
      },
      instanceContext: controlInstance,
    };
  },
});
