/**
 * src/pillars/lowering/manifest-merge.ts
 *
 * Merge per-node ManifestContributions into a single MemoryManifest.
 * Lifted verbatim from the legacy compile.ts mergeSection/structurallyEqual.
 *
 * Multiple nodes may declare the same key as long as the specs are
 * structurally identical. Conflicts produce error messages.
 */

import type {
  ArenaScalarSpec,
  DataStreamSpec,
  GlobalSpec,
  InstanceDomainSpec,
  MemoryManifest,
  SamplerSpec,
  StaticGeometrySpec,
  TextureSpec,
} from '../../render/rust/boundary-contract';
import type { ManifestContribution } from '../block-api';
import type { NormalizedNode } from '../frontend/normalized-graph';

export interface MergeResult {
  readonly manifest: MemoryManifest;
  readonly errors: readonly string[];
}

export function mergeManifestContributions(
  nodes: readonly NormalizedNode[],
): MergeResult {
  const errors: string[] = [];
  const manifest: MemoryManifest = createEmptyManifest();
  for (const node of nodes) {
    mergeContribution(manifest, node.manifestContribution, node.id, errors);
  }
  return { manifest, errors };
}

function createEmptyManifest(): MemoryManifest {
  return {
    preserveStateOnRecompile: false,
    globals: {},
    arenaScalars: {},
    domains: {},
    textures: {},
    shapeBank: {},
    dataStreams: {},
    samplers: {},
  };
}

function mergeContribution(
  manifest: MemoryManifest,
  contribution: ManifestContribution,
  sourceBlockId: string,
  errors: string[],
): void {
  mergeSection<GlobalSpec>(manifest.globals, contribution.globals, 'globals', sourceBlockId, errors);
  mergeSection<ArenaScalarSpec>(manifest.arenaScalars, contribution.arenaScalars, 'arenaScalars', sourceBlockId, errors);
  mergeSection<InstanceDomainSpec>(manifest.domains, contribution.domains, 'domains', sourceBlockId, errors);
  mergeSection<TextureSpec>(manifest.textures, contribution.textures, 'textures', sourceBlockId, errors);
  mergeSection<StaticGeometrySpec>(manifest.shapeBank, contribution.shapes, 'shapeBank', sourceBlockId, errors);
  mergeSection<SamplerSpec>(manifest.samplers, contribution.samplers, 'samplers', sourceBlockId, errors);
  mergeSection<DataStreamSpec>(manifest.dataStreams, contribution.dataStreams, 'dataStreams', sourceBlockId, errors);
}

function mergeSection<V>(
  target: Readonly<Record<string, V>>,
  source: Readonly<Record<string, V>> | undefined,
  category: string,
  sourceBlockId: string,
  errors: string[],
): void {
  if (!source) return;
  const mutableTarget = target as Record<string, V>;
  for (const [key, value] of Object.entries(source)) {
    const existing = mutableTarget[key];
    if (existing !== undefined) {
      if (!structurallyEqual(existing, value)) {
        errors.push(
          `[pillars compile] Manifest conflict in ${category}['${key}']: ` +
          `block '${sourceBlockId}' declares a spec that differs from an earlier declaration`,
        );
      }
      continue;
    }
    mutableTarget[key] = value;
  }
}

function structurallyEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
