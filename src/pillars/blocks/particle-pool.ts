/**
 * src/pillars/blocks/particle-pool.ts
 *
 * ParticlePool — a Generator (Pillar 1) that declares a domain of N instances
 * and emits a SourceBundle of field expressions defining the initial values
 * of each field.
 *
 * For the vertical slice the math is hardcoded to produce an orbit:
 *   angle = idx * (2π / capacity) + time
 *   pos_x = cos(angle) * radius
 *   pos_y = sin(angle) * radius
 *   color_r, color_g, color_b = fixed tones
 *
 * A future slice will replace this hardcoded math with an Expression-like
 * text DSL or a more general ParametricGenerator. For now the block serves
 * to prove the SourceBundle data flow end-to-end.
 */

import type {
  InstanceDomainSpec,
  GlobalSpec,
  ArenaScalarSpec,
} from '../../render/rust/boundary-contract';
import {
  binop,
  callBuiltin,
  cast,
  intrinsic,
  litF32,
  loadGlobal,
} from '../../render/gpu-ir/ir-builders';
import { registerPillarBlock } from '../registry';
import type { ManifestContribution, PillarBlockDef, SourceBundle } from '../types';

interface ParticlePoolConfig {
  readonly domainId: string;
  readonly capacity: number;
  /** Orbit radius. */
  readonly radius: number;
}

function readConfig(raw: Readonly<Record<string, unknown>>): ParticlePoolConfig {
  const domainId = raw.domainId;
  const capacity = raw.capacity;
  const radius = raw.radius;
  if (typeof domainId !== 'string') {
    throw new Error("[ParticlePool] config.domainId must be a string");
  }
  if (typeof capacity !== 'number' || capacity <= 0 || !Number.isInteger(capacity)) {
    throw new Error("[ParticlePool] config.capacity must be a positive integer");
  }
  if (typeof radius !== 'number') {
    throw new Error("[ParticlePool] config.radius must be a number");
  }
  return { domainId, capacity, radius };
}

const FIELD_TYPES = {
  pos_x: 'f32',
  pos_y: 'f32',
  color_r: 'f32',
  color_g: 'f32',
  color_b: 'f32',
} as const;

const def: PillarBlockDef = {
  kind: 'generator',

  manifestRequirements: (ctx): ManifestContribution => {
    const config = readConfig(ctx.config);
    const activeSymbol = `${config.domainId}:active`;

    const domain: InstanceDomainSpec = {
      capacity: config.capacity,
      // SymbolIdSchema is a branded string; the cast is runtime-safe because
      // activeSymbol is a plain string and the Zod schema validates the value
      // downstream.
      activeLanesSymbol: activeSymbol as InstanceDomainSpec['activeLanesSymbol'],
      fields: {
        pos_x: { type: FIELD_TYPES.pos_x, clearValue: 0 },
        pos_y: { type: FIELD_TYPES.pos_y, clearValue: 0 },
        color_r: { type: FIELD_TYPES.color_r, clearValue: 1 },
        color_g: { type: FIELD_TYPES.color_g, clearValue: 1 },
        color_b: { type: FIELD_TYPES.color_b, clearValue: 1 },
      } as InstanceDomainSpec['fields'],
    };

    const timeGlobal: GlobalSpec = {
      type: 'f32',
      isDynamic: true,
      defaultValue: 0,
    };

    const activeScalar: ArenaScalarSpec = {
      type: 'u32',
      clearValue: config.capacity,
    };

    return {
      globals: { 'sys:time': timeGlobal },
      arenaScalars: { [activeSymbol]: activeScalar },
      domains: { [config.domainId]: domain },
    };
  },

  lower: (ctx): { readonly kind: 'bundle'; readonly output: SourceBundle } => {
    const config = readConfig(ctx.config);

    // angle = f32(gid.x) * (2π / capacity) + time
    const twoPi = 2 * Math.PI;
    const step = twoPi / config.capacity;

    const gidF32 = cast('f32', intrinsic('global_invocation_id.x'));
    const time = loadGlobal('sys:time' as Parameters<typeof loadGlobal>[0]);
    const baseAngle = binop('*', gidF32, litF32(step));
    const angle = binop('+', baseAngle, time);

    // Positions on a circle of radius `radius`.
    const cosAngle = callBuiltin('cos', [angle]);
    const sinAngle = callBuiltin('sin', [angle]);
    const posX = binop('*', cosAngle, litF32(config.radius));
    const posY = binop('*', sinAngle, litF32(config.radius));

    // Colors: simple sinusoidal palette driven by the same angle so the
    // dots cycle colors as they orbit. Values are clamped into [0, 1] via
    // 0.5 * sin(...) + 0.5.
    const halfPlusHalf = (x: ReturnType<typeof litF32>) =>
      binop('+', binop('*', x, litF32(0.5)), litF32(0.5));

    const colorR = halfPlusHalf(sinAngle);
    const greenAngle = binop('+', angle, litF32(2.094)); // 120° phase
    const colorG = halfPlusHalf(callBuiltin('sin', [greenAngle]));
    const blueAngle = binop('+', angle, litF32(4.189)); // 240° phase
    const colorB = halfPlusHalf(callBuiltin('sin', [blueAngle]));

    const output: SourceBundle = {
      pos_x: posX,
      pos_y: posY,
      color_r: colorR,
      color_g: colorG,
      color_b: colorB,
    };

    return { kind: 'bundle', output };
  },
};

registerPillarBlock('ParticlePool', def);
