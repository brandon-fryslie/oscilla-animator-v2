/**
 * src/pillars/blocks/particle-pool.ts
 *
 * ParticlePool — Generator (Pillar 1). Declares a domain of N instances and
 * emits a SourceBundle whose field expressions define the initial values.
 */

import type {
  ArenaScalarSpec,
  GlobalSpec,
  InstanceDomainSpec,
  SymbolId,
} from '../../render/rust/boundary-contract';
import {
  binop,
  callBuiltin,
  cast,
  intrinsic,
  litF32,
  loadGlobal,
} from '../../render/gpu-ir/ir-builders';
import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
  SourceBundle,
} from '../block-api';

interface ParticlePoolConfig {
  readonly domainId: string;
  readonly capacity: number;
  readonly radius: number;
  readonly timeFactor: number;
}

type ParticlePoolLowerArgs = ParticlePoolConfig;

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): ParticlePoolConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const domainId = raw.domainId;
  if (typeof domainId !== 'string') push('[ParticlePool] config.domainId must be a string');

  const capacity = raw.capacity;
  if (typeof capacity !== 'number' || capacity <= 0 || !Number.isInteger(capacity)) {
    push('[ParticlePool] config.capacity must be a positive integer');
  }

  const radius = raw.radius;
  if (typeof radius !== 'number') push('[ParticlePool] config.radius must be a number');

  const timeFactorRaw = raw.timeFactor ?? 1;
  if (typeof timeFactorRaw !== 'number') push('[ParticlePool] config.timeFactor must be a number');

  if (hadError) return null;
  return {
    domainId: domainId as string,
    capacity: capacity as number,
    radius: radius as number,
    timeFactor: timeFactorRaw as number,
  };
}

function buildManifestContribution(config: ParticlePoolConfig): ManifestContribution {
  const activeSymbol = `${config.domainId}:active`;

  const domain: InstanceDomainSpec = {
    capacity: config.capacity,
    activeLanesSymbol: activeSymbol as InstanceDomainSpec['activeLanesSymbol'],
    fields: {
      pos_x: { type: 'f32', clearValue: 0 },
      pos_y: { type: 'f32', clearValue: 0 },
      color_r: { type: 'f32', clearValue: 1 },
      color_g: { type: 'f32', clearValue: 1 },
      color_b: { type: 'f32', clearValue: 1 },
    } as InstanceDomainSpec['fields'],
  };

  const timeGlobal: GlobalSpec = { type: 'f32', isDynamic: true, defaultValue: 0 };
  const activeScalar: ArenaScalarSpec = { type: 'u32', clearValue: config.capacity };

  return {
    globals: { 'sys:time': timeGlobal },
    arenaScalars: { [activeSymbol]: activeScalar },
    domains: { [config.domainId]: domain },
  };
}

function lower(args: ParticlePoolLowerArgs, _ctx: LoweringContext): LoweredBlock {
  const twoPi = 2 * Math.PI;
  const step = twoPi / args.capacity;

  const gidF32 = cast('f32', intrinsic('global_invocation_id.x'));
  const time = loadGlobal('sys:time' as SymbolId);
  const baseAngle = binop('*', gidF32, litF32(step));
  // [LAW:dataflow-not-control-flow] timeFactor is data, not control flow.
  const scaledTime = binop('*', time, litF32(args.timeFactor));
  const angle = binop('+', baseAngle, scaledTime);

  const cosAngle = callBuiltin('cos', [angle]);
  const sinAngle = callBuiltin('sin', [angle]);
  const posX = binop('*', cosAngle, litF32(args.radius));
  const posY = binop('*', sinAngle, litF32(args.radius));

  const halfPlusHalf = (x: ReturnType<typeof litF32>) =>
    binop('+', binop('*', x, litF32(0.5)), litF32(0.5));

  const colorR = halfPlusHalf(sinAngle);
  const greenAngle = binop('+', angle, litF32(2.094));
  const colorG = halfPlusHalf(callBuiltin('sin', [greenAngle]));
  const blueAngle = binop('+', angle, litF32(4.189));
  const colorB = halfPlusHalf(callBuiltin('sin', [blueAngle]));

  const output: SourceBundle = {
    pos_x: posX,
    pos_y: posY,
    color_r: colorR,
    color_g: colorG,
    color_b: colorB,
  };

  return { kind: 'bundle', output, domainId: args.domainId };
}

export const ParticlePoolBlock: BlockDefinition<ParticlePoolConfig, ParticlePoolLowerArgs> = {
  type: 'ParticlePool',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
