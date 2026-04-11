/**
 * src/pillars/blocks/clock.ts
 *
 * Clock — Generator (Pillar 1). Emits a one-field SourceBundle whose `time`
 * field is `LoadGlobal('sys:time')`. Wired as a SECONDARY input to drive
 * downstream Modifiers from a global clock.
 */

import type { GlobalSpec, SymbolId } from '../../render/rust/boundary-contract';
import { loadGlobal } from '../../render/gpu-ir/ir-builders';
import type {
  BlockDefinition,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
  SourceBundle,
} from '../block-api';

type ClockConfig = Record<string, never>;
type ClockLowerArgs = ClockConfig;

function readConfig(): ClockConfig {
  return {};
}

function buildManifestContribution(): ManifestContribution {
  const timeGlobal: GlobalSpec = { type: 'f32', isDynamic: true, defaultValue: 0 };
  return { globals: { 'sys:time': timeGlobal } };
}

function lower(_args: ClockLowerArgs, _ctx: LoweringContext): LoweredBlock {
  const output: SourceBundle = {
    time: loadGlobal('sys:time' as SymbolId),
  };
  return { kind: 'bundle', output };
}

export const ClockBlock: BlockDefinition<ClockConfig, ClockLowerArgs> = {
  type: 'Clock',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
