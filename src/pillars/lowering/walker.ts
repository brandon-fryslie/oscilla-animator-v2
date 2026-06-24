/**
 * src/pillars/lowering/walker.ts
 *
 * Backward walk over a NormalizedGraph of opaque nodes. The walker has no
 * knowledge of what any node IS — only what its lower closure returns.
 *
 * Sink set = nodes with zero out-degree. (In the SourceBundle model this
 * is equivalent to "nodes whose lower returns kind: 'intent'", but the
 * walker derives it from topology so the opaque-node property holds.)
 */

import type { MemoryManifest, RosterEntry } from '../../render/rust/boundary-contract';
import type { LoweringContext, NodeId, SourceBundle } from '../block-api';
import type { NormalizedGraph, NormalizedEdge, NormalizedNode } from '../frontend/normalized-graph';
import { rewriteAsLoadFields, validateCardinality } from './cross-domain';

export interface WalkResult {
  readonly passes: readonly RosterEntry[];
  readonly errors: readonly string[];
}

interface BundleResolution {
  readonly output: SourceBundle;
  readonly domainId?: string;
}

export function walkAndLower(graph: NormalizedGraph, manifest: MemoryManifest): WalkResult {
  const nodeById = new Map<NodeId, NormalizedNode>(graph.nodes.map((n) => [n.id, n]));
  const edgesByTarget = new Map<NodeId, NormalizedEdge[]>();
  const outDegree = new Map<NodeId, number>();
  for (const n of graph.nodes) outDegree.set(n.id, 0);
  for (const edge of graph.edges) {
    const list = edgesByTarget.get(edge.target);
    if (list) list.push(edge);
    else edgesByTarget.set(edge.target, [edge]);
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
  }

  const bundleCache = new Map<NodeId, BundleResolution>();
  const errors: string[] = [];
  const allPasses: RosterEntry[] = [];

  function resolveBundle(blockId: NodeId): BundleResolution {
    const cached = bundleCache.get(blockId);
    if (cached) return cached;

    const node = nodeById.get(blockId);
    if (!node) {
      errors.push(`[pillars walker] Unknown node id: '${blockId}'`);
      const empty: BundleResolution = { output: {} };
      bundleCache.set(blockId, empty);
      return empty;
    }

    const { inputBundles, primaryDomainId } = resolveInputBundles(blockId);

    // inputMaterials is always present (empty until the walker resolves
    // material-role edges in a later slice). [LAW:dataflow-not-control-flow]
    const ctx: LoweringContext = { inputBundles, inputMaterials: {}, manifest };

    let result;
    try {
      result = node.lower(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(
        `[pillars walker] Block '${blockId}' failed to lower: ${message}`,
      );
      const empty: BundleResolution = { output: {}, domainId: primaryDomainId };
      bundleCache.set(blockId, empty);
      return empty;
    }
    if (result.kind !== 'bundle') {
      errors.push(
        `[pillars walker] Block '${blockId}' is referenced as a bundle source but lower() returned '${result.kind}'`,
      );
      const empty: BundleResolution = { output: {} };
      bundleCache.set(blockId, empty);
      return empty;
    }

    const resolvedDomainId = result.domainId ?? primaryDomainId;
    const resolution: BundleResolution = {
      output: result.output,
      domainId: resolvedDomainId,
    };
    bundleCache.set(blockId, resolution);
    return resolution;
  }

  function resolveInputBundles(targetBlockId: NodeId): {
    readonly inputBundles: Record<string, SourceBundle>;
    readonly primaryDomainId?: string;
  } {
    const incoming = edgesByTarget.get(targetBlockId) ?? [];

    const resolvedBySlot = new Map<string, { edge: NormalizedEdge; resolution: BundleResolution }>();
    for (const edge of incoming) {
      if (resolvedBySlot.has(edge.inputSlot)) {
        errors.push(
          `[pillars walker] Block '${targetBlockId}' has multiple edges targeting input slot '${edge.inputSlot}'`,
        );
        continue;
      }
      resolvedBySlot.set(edge.inputSlot, {
        edge,
        resolution: resolveBundle(edge.source),
      });
    }

    let primaryDomainId: string | undefined;
    let foundPrimary = false;
    for (const { edge, resolution } of resolvedBySlot.values()) {
      if (edge.role !== 'primary') continue;
      if (foundPrimary) {
        errors.push(
          `[pillars walker] Block '${targetBlockId}' has multiple edges with role 'primary'; only the first is used`,
        );
        continue;
      }
      foundPrimary = true;
      primaryDomainId = resolution.domainId;
    }

    const inputBundles: Record<string, SourceBundle> = {};
    for (const [slot, { edge, resolution }] of resolvedBySlot) {
      const isCrossDomain =
        edge.role === 'secondary' &&
        resolution.domainId !== undefined &&
        primaryDomainId !== undefined &&
        resolution.domainId !== primaryDomainId;

      if (!isCrossDomain) {
        inputBundles[slot] = resolution.output;
        continue;
      }

      const check = validateCardinality(
        manifest,
        resolution.domainId!,
        primaryDomainId!,
        targetBlockId,
        slot,
      );
      if (!check.ok) {
        errors.push(check.message);
        inputBundles[slot] = {};
        continue;
      }

      inputBundles[slot] = rewriteAsLoadFields(resolution.output, resolution.domainId!);
    }

    return { inputBundles, primaryDomainId };
  }

  // Sink set: zero out-degree.
  for (const node of graph.nodes) {
    if ((outDegree.get(node.id) ?? 0) > 0) continue;

    const { inputBundles } = resolveInputBundles(node.id);
    // inputMaterials is always present (empty until the walker resolves
    // material-role edges in a later slice). [LAW:dataflow-not-control-flow]
    const ctx: LoweringContext = { inputBundles, inputMaterials: {}, manifest };

    let result;
    try {
      result = node.lower(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(
        `[pillars walker] Sink block '${node.id}' failed to lower: ${message}`,
      );
      continue;
    }
    if (result.kind !== 'intent') {
      errors.push(
        `[pillars walker] Sink block '${node.id}' returned kind '${result.kind}' instead of 'intent'`,
      );
      continue;
    }
    for (const pass of result.passes) allPasses.push(pass);
  }

  return { passes: allPasses, errors };
}
