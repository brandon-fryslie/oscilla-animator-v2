/**
 * src/pillars/walker.ts
 *
 * Backward walk from each Intent block, producing roster entries (compute,
 * drawPrep, render passes) by recursively resolving upstream Generators and
 * Modifiers.
 *
 * Derived directly from the design doc §5 ("How Expression Lowering Works"):
 * the walker follows incoming edges, resolves each source to its whole
 * SourceBundle, and memoizes per block id so multi-fanout handles naturally.
 *
 * Key design properties:
 *
 *   - Memoization is per block id, not per port. A Generator consumed by two
 *     Modifiers lowers exactly once; both consumers receive the same
 *     SourceBundle by reference.
 *
 *   - There is no "per-port fanout map". In the SourceBundle model, fanout
 *     granularity is the block — if two consumers need the bundle, they get
 *     the same record, and individual field expressions naturally appear
 *     once per consumer in the emitted AST.
 *
 *   - The walker does not emit let-bindings. Any CSE that the downstream
 *     WGSL compiler wants to do happens there. The walker's only job is to
 *     thread SourceBundles through the graph.
 */

import type { MemoryManifest, RosterEntry } from '../render/rust/boundary-contract';
import type {
  PillarPatch,
  PillarEdge,
  PillarLoweringContext,
  SourceBundle,
} from './types';
import { getPillarBlock } from './registry';

export interface WalkResult {
  readonly passes: readonly RosterEntry[];
  readonly errors: readonly string[];
}

/**
 * Walk every Intent block in the patch and produce the combined roster.
 *
 * The walker iterates `patch.blocks` in order. For the initial slice this
 * means fixtures are responsible for authoring blocks in a sensible order;
 * follow-up slices can add topological sorting if needed.
 */
export function walkAndLower(patch: PillarPatch, manifest: MemoryManifest): WalkResult {
  const blockById = new Map(patch.blocks.map((b) => [b.id, b] as const));
  const edgesByTarget = new Map<string, PillarEdge[]>();
  for (const edge of patch.edges) {
    const list = edgesByTarget.get(edge.target);
    if (list) {
      list.push(edge);
    } else {
      edgesByTarget.set(edge.target, [edge]);
    }
  }

  const bundleCache = new Map<string, SourceBundle>();
  const errors: string[] = [];
  const allPasses: RosterEntry[] = [];

  /**
   * Resolve a Generator or Modifier block to its output SourceBundle.
   * Memoized per block id so every caller sees the same record.
   */
  function resolveBundle(blockId: string): SourceBundle {
    const cached = bundleCache.get(blockId);
    if (cached) return cached;

    const block = blockById.get(blockId);
    if (!block) {
      errors.push(`[pillars walker] Unknown block id: '${blockId}'`);
      return {};
    }

    const def = getPillarBlock(block.type);
    if (!def) {
      errors.push(`[pillars walker] No block definition registered for type: '${block.type}'`);
      return {};
    }

    if (def.kind === 'intent') {
      errors.push(
        `[pillars walker] Cannot resolve intent block '${blockId}' as a bundle source — intents are sinks, not producers`,
      );
      return {};
    }

    const inputBundles = resolveInputBundles(blockId);

    const ctx: PillarLoweringContext = {
      blockId: block.id,
      blockType: block.type,
      config: block.config,
      blockKind: def.kind,
      inputBundles,
      manifest,
    };

    const result = def.lower(ctx);
    if (result.kind !== 'bundle') {
      errors.push(
        `[pillars walker] Block '${block.type}' has kind '${def.kind}' but lower() returned '${result.kind}'`,
      );
      return {};
    }

    bundleCache.set(blockId, result.output);
    return result.output;
  }

  /**
   * Build the `inputBundles` record for a target block by resolving each of
   * its incoming edges. The edge's `inputSlot` becomes the record key; the
   * source block's whole bundle becomes the value.
   */
  function resolveInputBundles(targetBlockId: string): Record<string, SourceBundle> {
    const incoming = edgesByTarget.get(targetBlockId) ?? [];
    const inputs: Record<string, SourceBundle> = {};
    for (const edge of incoming) {
      if (edge.inputSlot in inputs) {
        errors.push(
          `[pillars walker] Block '${targetBlockId}' has multiple edges targeting input slot '${edge.inputSlot}'`,
        );
        continue;
      }
      inputs[edge.inputSlot] = resolveBundle(edge.source);
    }
    return inputs;
  }

  // Lower every intent block.
  for (const block of patch.blocks) {
    const def = getPillarBlock(block.type);
    if (!def) {
      // Already reported during bundle resolution if this block was referenced;
      // report again here only if the block was never visited (orphaned intent).
      // For simplicity we just skip — the harvest phase also surfaces this.
      continue;
    }
    if (def.kind !== 'intent') continue;

    const inputBundles = resolveInputBundles(block.id);

    const ctx: PillarLoweringContext = {
      blockId: block.id,
      blockType: block.type,
      config: block.config,
      blockKind: 'intent',
      inputBundles,
      manifest,
    };

    const result = def.lower(ctx);
    if (result.kind !== 'intent') {
      errors.push(
        `[pillars walker] Intent block '${block.type}' returned kind '${result.kind}' instead of 'intent'`,
      );
      continue;
    }

    for (const pass of result.passes) allPasses.push(pass);
  }

  return { passes: allPasses, errors };
}
