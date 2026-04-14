import type { BlockDefinition, GlobalSpec, ManifestContribution } from '../block-api';

type ClockConfig = Record<string, never>;

function readConfig(): ClockConfig {
  return {};
}

function buildManifestContribution(): ManifestContribution {
  const timeGlobal: GlobalSpec = { type: 'f32', isDynamic: true, defaultValue: 0 };
  return { globals: { 'sys:time': timeGlobal } };
}

export const ClockBlock: BlockDefinition<ClockConfig> = {
  type: 'Clock',
  readConfig,
  buildManifestContribution,
};
