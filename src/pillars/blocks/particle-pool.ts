import type {
  ArenaScalarSpec,
  BlockDefinition,
  Diagnostic,
  GlobalSpec,
  InstanceDomainSpec,
  ManifestContribution,
} from '../block-api';

interface ParticlePoolConfig {
  readonly domainId: string;
  readonly capacity: number;
  readonly radius: number;
  readonly timeFactor: number;
}

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
    activeLanesSymbol: activeSymbol,
    fields: {
      pos_x: { type: 'f32', clearValue: 0 },
      pos_y: { type: 'f32', clearValue: 0 },
      color_r: { type: 'f32', clearValue: 1 },
      color_g: { type: 'f32', clearValue: 1 },
      color_b: { type: 'f32', clearValue: 1 },
    },
  };

  const timeGlobal: GlobalSpec = { type: 'f32', isDynamic: true, defaultValue: 0 };
  const activeScalar: ArenaScalarSpec = { type: 'u32', clearValue: config.capacity };

  return {
    globals: { 'sys:time': timeGlobal },
    arenaScalars: { [activeSymbol]: activeScalar },
    domains: { [config.domainId]: domain },
  };
}

export const ParticlePoolBlock: BlockDefinition<ParticlePoolConfig> = {
  type: 'ParticlePool',
  readConfig,
  buildManifestContribution,
};
