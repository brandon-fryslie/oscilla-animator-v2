/**
 * C1 Phase 4: Lowering & Fusion
 *
 * For each sink block, walks backward through the graph edges,
 * recursively lowering upstream blocks and fusing their expressions.
 * The PassScopeManager caches multi-fanout expressions as let variables.
 */

import type { ExprIR, StatementIR, RosterEntry, MemoryManifest } from '../../render/rust/boundary-contract';
import type { NormalizedPatch, NormalizedEdge } from '../ir/NormalizedPatch';
import type { BlockIndex } from '../ir/BlockIndex';
import type { TypeResolvedPatch } from '../ir/patches';
import type { C1LoweringContext, C1LoweredBlock } from './types';
import { PassScopeManager } from './pass-scope-manager';
import { getC1Block } from '../../blocks-v2';

/** Result of lowering all sinks. */
export interface LoweringResult {
  readonly passes: readonly RosterEntry[];
  readonly errors: readonly string[];
}

/**
 * Lower all sinks by walking backward through the graph.
 */
export function lowerAndFuse(
  sinks: readonly BlockIndex[],
  patch: NormalizedPatch,
  portTypes: TypeResolvedPatch['portTypes'],
  manifest: MemoryManifest,
): LoweringResult {
  // Count outgoing edges per (block, port) for fanout detection
  const fanoutMap = buildFanoutMap(patch.edges);

  const allPasses: RosterEntry[] = [];
  const errors: string[] = [];

  for (const sinkIdx of sinks) {
    const scope = new PassScopeManager();
    // Cache of lowered blocks (shared across the backward walk for this sink)
    const lowered = new Map<number, C1LoweredBlock>();

    const sinkBlock = patch.blocks[sinkIdx];
    const sinkDef = getC1Block(sinkBlock.type);
    if (!sinkDef) {
      errors.push(`[C1] No C1 block definition for sink type '${sinkBlock.type}'`);
      continue;
    }

    // Resolve all inputs for the sink
    const inputsById = resolveInputs(
      sinkIdx, patch, fanoutMap, portTypes, manifest, scope, lowered,
    );

    // Lower the sink itself
    const ctx: C1LoweringContext = {
      blockId: sinkBlock.id,
      blockType: sinkBlock.type,
      config: sinkBlock.params,
      portTypes,
      blockIndex: sinkIdx,
      inputsById,
      manifest,
    };

    const result = sinkDef.lower(ctx);
    if (result.kind !== 'sink') {
      errors.push(`[C1] Block '${sinkBlock.type}' is marked as sink but lower() returned '${result.kind}'`);
      continue;
    }

    // Prepend scope manager's let-bindings to the first pass's AST
    const passes = prependPreamble(result.injectedPasses, scope.preamble);
    allPasses.push(...passes);
  }

  return { passes: allPasses, errors };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type EdgeKey = `${number}:${string}`; // `${toBlock}:${toPort}`

function buildFanoutMap(edges: readonly NormalizedEdge[]): Map<EdgeKey, number> {
  const outgoing = new Map<EdgeKey, number>();
  for (const edge of edges) {
    const key: EdgeKey = `${edge.fromBlock}:${edge.fromPort}`;
    outgoing.set(key, (outgoing.get(key) ?? 0) + 1);
  }
  return outgoing;
}

/**
 * Recursively resolve inputs for a block by walking backward through edges.
 */
function resolveInputs(
  blockIndex: number,
  patch: NormalizedPatch,
  fanoutMap: Map<EdgeKey, number>,
  portTypes: TypeResolvedPatch['portTypes'],
  manifest: MemoryManifest,
  scope: PassScopeManager,
  lowered: Map<number, C1LoweredBlock>,
): Record<string, ExprIR | null> {
  const inputs: Record<string, ExprIR | null> = {};

  // Find all edges targeting this block
  for (const edge of patch.edges) {
    if (edge.toBlock !== blockIndex) continue;

    const upstreamResult = resolveBlock(
      edge.fromBlock, patch, fanoutMap, portTypes, manifest, scope, lowered,
    );

    if (upstreamResult.kind === 'proxy') {
      const expr = upstreamResult.outputs[edge.fromPort] ?? null;
      if (expr) {
        // Check fanout for this output port
        const fanoutKey: EdgeKey = `${edge.fromBlock}:${edge.fromPort}`;
        const fanout = fanoutMap.get(fanoutKey) ?? 1;
        inputs[edge.toPort] = scope.getOrCache(edge.fromBlock, expr, fanout);
      } else {
        inputs[edge.toPort] = null;
      }
    }
    // Sink blocks don't produce outputs for downstream consumption
  }

  return inputs;
}

/**
 * Resolve a single block (with memoization).
 */
function resolveBlock(
  blockIndex: number,
  patch: NormalizedPatch,
  fanoutMap: Map<EdgeKey, number>,
  portTypes: TypeResolvedPatch['portTypes'],
  manifest: MemoryManifest,
  scope: PassScopeManager,
  lowered: Map<number, C1LoweredBlock>,
): C1LoweredBlock {
  // Already lowered? Return cached result.
  const cached = lowered.get(blockIndex);
  if (cached) return cached;

  const block = patch.blocks[blockIndex];
  const def = getC1Block(block.type);
  if (!def) {
    throw new Error(`[C1] No C1 block definition for type '${block.type}'`);
  }

  // Recursively resolve this block's inputs
  const inputsById = resolveInputs(
    blockIndex, patch, fanoutMap, portTypes, manifest, scope, lowered,
  );

  const ctx: C1LoweringContext = {
    blockId: block.id,
    blockType: block.type,
    config: block.params,
    portTypes,
    blockIndex: blockIndex as BlockIndex,
    inputsById,
    manifest,
  };

  const result = def.lower(ctx);
  lowered.set(blockIndex, result);
  return result;
}

/**
 * Prepend preamble (let-bindings) to the first compute pass's AST.
 */
function prependPreamble(
  passes: readonly RosterEntry[],
  preamble: readonly StatementIR[],
): RosterEntry[] {
  if (preamble.length === 0) return [...passes];

  return passes.map((pass, i) => {
    if (i !== 0) return pass;
    // Prepend to the first pass that has an AST field
    if (pass.type === 'Compute') {
      return { ...pass, ast: [...preamble, ...pass.ast] };
    }
    if (pass.type === 'System_CameraUpdate') {
      return { ...pass, ast: [...preamble, ...pass.ast] };
    }
    return pass;
  });
}
