import type { Diagnostic, NodeId } from '../block-api';
import type { PillarPatch } from '../types';
import type { NormalizedGraph, NormalizedNode } from './normalized-graph';
import type { Registry } from './registry';

export interface FrontendResult {
  readonly graph: NormalizedGraph | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function buildNormalizedGraph(
  patch: PillarPatch,
  registry: Registry,
): FrontendResult {
  const diagnostics: Diagnostic[] = [];
  const nodes: NormalizedNode[] = [];

  for (const block of patch.blocks) {
    const def = registry.get(block.type);
    if (!def) {
      diagnostics.push({
        severity: 'error',
        message: `[pillars] Unknown block type '${block.type}'`,
        blockId: block.id,
      });
      continue;
    }

    const config = def.readConfig(block.config, diagnostics);
    if (config === null) continue;

    nodes.push({
      id: block.id as NodeId,
      manifestContribution: def.buildManifestContribution(config),
    });
  }

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { graph: null, diagnostics };
  }

  const edges = patch.edges.map((e) => ({
    id: e.id,
    source: e.source as NodeId,
    target: e.target as NodeId,
    inputSlot: e.inputSlot,
    role: e.role,
  }));

  return { graph: { nodes, edges }, diagnostics };
}
