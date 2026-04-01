/**
 * C1 Phase 2: Harvester
 *
 * Walks topo-sorted blocks and collects ManifestContributions.
 * Deep-merges into a single MemoryManifest.
 * Throws on symbol ID collisions with different specs.
 */

import type { MemoryManifest } from '../../render/rust/boundary-contract';
import type { NormalizedPatch } from '../ir/NormalizedPatch';
import type { BlockIndex } from '../ir/BlockIndex';
import type { TypeResolvedPatch } from '../ir/patches';
import type { ManifestContext } from './types';
import { getC1Block } from '../../blocks-v2';

export function harvest(
  topoOrder: readonly BlockIndex[],
  patch: NormalizedPatch,
  portTypes: TypeResolvedPatch['portTypes'],
): MemoryManifest {
  const globals: Record<string, MemoryManifest['globals'][string]> = {};
  const arenaScalars: Record<string, MemoryManifest['arenaScalars'][string]> = {};
  const domains: Record<string, MemoryManifest['domains'][string]> = {};
  const textures: Record<string, MemoryManifest['textures'][string]> = {};
  const shapeBank: Record<string, MemoryManifest['shapeBank'][string]> = {};
  const samplers: Record<string, MemoryManifest['samplers'][string]> = {};

  for (const idx of topoOrder) {
    const block = patch.blocks[idx];
    const def = getC1Block(block.type);
    if (!def?.manifestRequirements) continue;

    const ctx: ManifestContext = {
      blockId: block.id,
      blockType: block.type,
      config: block.params,
      portTypes,
      blockIndex: idx,
    };

    const contribution = def.manifestRequirements(ctx);
    mergeRecord(globals, contribution.globals, 'global');
    mergeRecord(arenaScalars, contribution.arenaScalars, 'arenaScalar');
    mergeRecord(domains, contribution.domains, 'domain');
    mergeRecord(textures, contribution.textures, 'texture');
    mergeRecord(shapeBank, contribution.shapes, 'shape');
    mergeRecord(samplers, contribution.samplers, 'sampler');
  }

  return {
    preserveStateOnRecompile: false,
    globals,
    arenaScalars,
    domains,
    textures,
    shapeBank,
    dataStreams: {},
    samplers,
  };
}

function mergeRecord<T>(
  target: Record<string, T>,
  source: Readonly<Record<string, T>> | undefined,
  label: string,
): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (key in target) {
      // Collision check: same key with different value is an error
      if (JSON.stringify(target[key]) !== JSON.stringify(value)) {
        throw new Error(
          `[C1 Harvest] ${label} collision: '${key}' declared with conflicting specs`
        );
      }
      // Same spec — idempotent, skip
      continue;
    }
    target[key] = value;
  }
}
