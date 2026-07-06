import type { BlockId, Patch } from '../../../types';
import type { Endpoint } from '../../../graph/Patch';
import {
  type BlockCatalog,
  insertableEntries,
  requireCatalogEntry,
} from '../../graphEditor/block-catalog';
import { validateSemanticConnection } from '../../authoring/semanticQueries';

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

function withReplacementType(patch: Patch, blockId: BlockId, nextType: string): Patch {
  const block = patch.blocks.get(blockId);
  if (!block) {
    return patch;
  }
  const blocks = new Map(patch.blocks);
  blocks.set(blockId, { ...block, type: nextType });
  return { blocks, edges: patch.edges };
}

function canConnect(
  sourceBlockId: string,
  sourcePortId: string,
  targetBlockId: string,
  targetPortId: string,
  patch: Patch,
): boolean {
  try {
    return validateSemanticConnection(
      patch,
      sourceBlockId,
      sourcePortId,
      targetBlockId,
      targetPortId,
      { mutationMode: 'replaceWriter', exact: true },
    ).valid;
  } catch {
    return false;
  }
}

function buildReplacementPlanForType(
  catalog: BlockCatalog,
  patch: Patch,
  blockId: BlockId,
  nextType: string,
): CompatibleReplacementPlan | null {
  const block = patch.blocks.get(blockId);
  if (!block) return null;
  if (block.type === nextType) return null;
  const candidate = requireCatalogEntry(catalog, nextType);
  // The `insertable` check is load-bearing for the public `isCompatibleBlockReplacement`
  // entry point, where `nextType` is an arbitrary caller-supplied string. It is
  // redundant (always true) on the `findCompatibleReplacementPlans` path, which
  // already iterates `insertableEntries` — but this helper serves both callers.
  if (block.role?.kind === 'timeRoot' || !candidate.insertable) return null;
  const replacementPatch = withReplacementType(patch, blockId, nextType);
  const connectedEdges = patch.edges.filter(
    (edge) => edge.from.blockId === blockId || edge.to.blockId === blockId
  );
  const candidateInputPortIds = candidate.inputs.map((port) => port.id);
  const candidateOutputPortIds = candidate.outputs.map((port) => port.id);

  const rewiredEdges: ReplacementEdgePlan[] = [];

  // [LAW:dataflow-not-control-flow] Each connected edge is transformed through
  // the same deterministic mapping pipeline; variability lives in chosen ports.
  for (const edge of connectedEdges) {
    const fromIsReplaced = edge.from.blockId === blockId;
    const toIsReplaced = edge.to.blockId === blockId;

    const mapped = (() => {
      if (fromIsReplaced && toIsReplaced) {
        for (const outputPortId of candidateOutputPortIds) {
          for (const inputPortId of candidateInputPortIds) {
            if (canConnect(blockId, outputPortId, blockId, inputPortId, replacementPatch)) {
              return {
                from: { kind: 'port' as const, blockId, slotId: outputPortId },
                to: { kind: 'port' as const, blockId, slotId: inputPortId },
              };
            }
          }
        }
        return null;
      }
      if (fromIsReplaced) {
        for (const outputPortId of candidateOutputPortIds) {
          if (canConnect(blockId, outputPortId, edge.to.blockId, edge.to.slotId, replacementPatch)) {
            return {
              from: { kind: 'port' as const, blockId, slotId: outputPortId },
              to: edge.to,
            };
          }
        }
        return null;
      }
      if (toIsReplaced) {
        for (const inputPortId of candidateInputPortIds) {
          if (canConnect(edge.from.blockId, edge.from.slotId, blockId, inputPortId, replacementPatch)) {
            return {
              from: edge.from,
              to: { kind: 'port' as const, blockId, slotId: inputPortId },
            };
          }
        }
        return null;
      }
      return null;
    })();

    if (!mapped) {
      return null;
    }
    rewiredEdges.push({
      from: mapped.from,
      to: mapped.to,
      enabled: edge.enabled,
      sortKey: edge.sortKey,
      role: edge.role,
      alias: edge.alias,
    });
  }

  return {
    blockType: candidate.type,
    blockLabel: candidate.label || candidate.type,
    rewiredEdges,
  };
}

export function isCompatibleBlockReplacement(
  catalog: BlockCatalog,
  patch: Patch,
  blockId: BlockId,
  nextType: string,
): boolean {
  return buildReplacementPlanForType(catalog, patch, blockId, nextType) !== null;
}

export function findCompatibleReplacementPlans(
  catalog: BlockCatalog,
  patch: Patch,
  blockId: BlockId,
): CompatibleReplacementPlan[] {
  const block = patch.blocks.get(blockId);
  if (!block || block.role?.kind === 'timeRoot') {
    return [];
  }

  // [LAW:one-source-of-truth] Replacement candidates are the catalog's insertable
  // entries — the same view the block library browses. Read `entries` once.
  return insertableEntries(catalog.entries)
    .map((entry) => buildReplacementPlanForType(catalog, patch, blockId, entry.type))
    .filter((plan): plan is CompatibleReplacementPlan => plan !== null)
    .sort((a, b) => a.blockLabel.localeCompare(b.blockLabel));
}
