/**
 * src/pillars/compile.ts
 *
 * Top-level compiler entry point. Takes a PillarPatch, produces a
 * PipelineInstallPayload ready for the Rust renderer.
 *
 * Phases:
 *   1. Manifest harvest — each block with manifestRequirements contributes
 *      to a single MemoryManifest. Duplicate declarations are allowed if
 *      they're structurally identical; conflicts are errors.
 *   2. Walk and lower — backward walk from Intent blocks builds the roster.
 *   3. Assemble — bundle the manifest and roster into a PipelineInstallPayload.
 *
 * No topological sorting in the initial slice: fixtures author blocks in
 * sensible order, and the walker is memoized per block id so visit order
 * doesn't affect correctness within a single walk.
 */

import type {
  PipelineInstallPayload,
  MemoryManifest,
  GlobalSpec,
  ArenaScalarSpec,
  InstanceDomainSpec,
  TextureSpec,
  StaticGeometrySpec,
  SamplerSpec,
  DataStreamSpec,
} from '../render/rust/boundary-contract';
import type { PillarPatch, ManifestContribution } from './types';
import { getPillarBlock } from './registry';
import { walkAndLower } from './walker';

export type CompileResult =
  | { readonly kind: 'ok'; readonly payload: PipelineInstallPayload }
  | { readonly kind: 'error'; readonly errors: readonly string[] };

export function compilePillarPatch(patch: PillarPatch): CompileResult {
  const errors: string[] = [];

  // Phase 1: Manifest harvest.
  const manifest = createEmptyManifest();
  for (const block of patch.blocks) {
    const def = getPillarBlock(block.type);
    if (!def) {
      errors.push(`[pillars compile] No block definition for type '${block.type}' (block id '${block.id}')`);
      continue;
    }
    if (!def.manifestRequirements) continue;
    const contribution = def.manifestRequirements({
      blockId: block.id,
      blockType: block.type,
      config: block.config,
    });
    mergeContribution(manifest, contribution, block.id, errors);
  }

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  // Phase 2: Walk and lower Intent blocks.
  const walk = walkAndLower(patch, manifest);
  if (walk.errors.length > 0) {
    return { kind: 'error', errors: walk.errors };
  }

  // Phase 3: Assemble payload.
  const payload: PipelineInstallPayload = {
    manifest,
    roster: walk.passes,
  };

  return { kind: 'ok', payload };
}

// ---------------------------------------------------------------------------
// Manifest assembly helpers
// ---------------------------------------------------------------------------

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

/**
 * Deep-merge a block's ManifestContribution into the running MemoryManifest.
 *
 * Multiple blocks may declare the same symbol (e.g. two Intents that both
 * reference the same camera global). This is allowed as long as the specs
 * are structurally identical. Conflicting declarations are a compile error.
 */
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
  // The manifest record uses branded string keys; at runtime they're plain
  // strings, so we widen via cast to perform the merge uniformly.
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

/**
 * Structural equality check via JSON. Sufficient for manifest specs because
 * they are plain data with no functions or circular references.
 */
function structurallyEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
