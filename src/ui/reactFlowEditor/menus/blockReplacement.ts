import type { BlockId, Patch } from '../../../types';
import type { Endpoint } from '../../../graph/Patch';
import { getBlockCategories, getBlockTypesByCategory, requireAnyBlockDef } from '../../../blocks/registry';
import { queryReplaceBlock } from '../../../compiler/frontend/authoring-queries';
import type { ReplacementEdgePlan as QueryReplacementEdgePlan } from '../../../compiler/frontend/authoring-query-types';

export interface ReplacementEdgePlan {
  from: Endpoint;
  to: Endpoint;
  enabled: boolean;
  sortKey: number;
  role: import('../../../types').EdgeRole;
  alias: string;
}

export interface CompatibleReplacementPlan {
  blockType: string;
  blockLabel: string;
  rewiredEdges: readonly ReplacementEdgePlan[];
}

function isSuggested(status: 'valid' | 'deferred' | 'invalid' | 'blocked'): boolean {
  return status === 'valid' || status === 'deferred';
}

function toUiRewiredEdges(edges: readonly QueryReplacementEdgePlan[]): ReplacementEdgePlan[] {
  return edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    enabled: edge.enabled,
    sortKey: edge.sortKey,
    role: edge.role,
    alias: edge.alias,
  }));
}

export function isCompatibleBlockReplacement(patch: Patch, blockId: BlockId, nextType: string): boolean {
  const result = queryReplaceBlock(
    patch,
    {
      kind: 'replaceBlock',
      target: { blockId },
      candidates: [{ candidateId: nextType, blockType: nextType }],
    },
    { mutationMode: 'replaceWriter' },
  ).results[0];
  return isSuggested(result.status);
}

export function findCompatibleReplacementPlans(patch: Patch, blockId: BlockId): CompatibleReplacementPlan[] {
  const categories = getBlockCategories();
  const allDefs = categories.flatMap((category) => getBlockTypesByCategory(category));
  const results = queryReplaceBlock(
    patch,
    {
      kind: 'replaceBlock',
      target: { blockId },
      candidates: allDefs.map((def) => ({ candidateId: def.type, blockType: def.type })),
    },
    { mutationMode: 'replaceWriter' },
  );

  // [LAW:one-source-of-truth] Replacement compatibility is derived from the
  // compiler-backed query result, not replicated in menu-layer heuristics.
  return results.results
    .filter((candidate) => isSuggested(candidate.status))
    .map((candidate) => ({
      blockType: candidate.blockType,
      blockLabel: requireAnyBlockDef(candidate.blockType).label || candidate.blockType,
      rewiredEdges: toUiRewiredEdges(candidate.rewiredEdges),
    }))
    .sort((a, b) => a.blockLabel.localeCompare(b.blockLabel));
}
