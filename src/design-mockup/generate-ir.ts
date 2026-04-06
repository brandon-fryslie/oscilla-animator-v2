/**
 * Pseudo-WGSL IR generation for design-mockup graphs.
 *
 * Mirrors the real C1 backend's lowering structure (backward walk from sinks,
 * fusion of upstream expressions, materialization at back edges and cross-domain
 * boundaries) but emits readable pseudo-WGSL instead of real ExprIR/StatementIR.
 *
 * Purpose: let the user see what the compiler would produce for any graph
 * without having to implement real expression text in each block.
 *
 * Block contributions are placeholders:
 *   - Generator outputs:    `gen_<id>(gid)`
 *   - Expression outputs:   `expr_<id>(...inputs...)`
 *   - Sink outputs:         StoreField('<domain>:out', gid, sink_expression)
 */

import type { MockNode, MockEdge, AnalysisResult } from './analyze';

export interface GeneratedIR {
  /** One pseudo-pass per source-domain (compute) plus per-sink (render). */
  readonly passes: readonly GeneratedPass[];
  /** Per-back-edge symbol names (for readability in the side panel). */
  readonly backEdgeSymbols: ReadonlyMap<string, string>;
}

export interface GeneratedPass {
  readonly kind: 'compute' | 'render';
  readonly title: string;
  readonly lines: readonly string[];
}

interface BuildContext {
  readonly nodeById: ReadonlyMap<string, MockNode>;
  readonly edgesIn: ReadonlyMap<string, readonly MockEdge[]>;
  readonly edgesOut: ReadonlyMap<string, readonly MockEdge[]>;
  readonly analysis: AnalysisResult;
  readonly backEdgeSet: ReadonlySet<string>;
  readonly crossDomainEdgeSet: ReadonlySet<string>;
  /** Field symbol assigned to each back edge (the materialization slot). */
  readonly backEdgeSymbols: ReadonlyMap<string, string>;
  /** Field symbol assigned to each cross-domain edge. */
  readonly crossDomainSymbols: ReadonlyMap<string, string>;
}

export function generateIR(
  nodes: readonly MockNode[],
  edges: readonly MockEdge[],
  analysis: AnalysisResult
): GeneratedIR {
  // If there are graph errors that make IR generation meaningless, bail with a note
  if (
    analysis.missingPrimaryBlocks.length > 0 ||
    analysis.multiplePrimaryBlocks.length > 0 ||
    analysis.primaryOnlyCycles.length > 0
  ) {
    return {
      passes: [{ kind: 'compute', title: 'IR not generated', lines: ['Graph has errors. Fix them to see generated IR.'] }],
      backEdgeSymbols: new Map(),
    };
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgesIn = new Map<string, MockEdge[]>();
  const edgesOut = new Map<string, MockEdge[]>();
  for (const n of nodes) {
    edgesIn.set(n.id, []);
    edgesOut.set(n.id, []);
  }
  for (const e of edges) {
    edgesIn.get(e.target)!.push(e);
    edgesOut.get(e.source)!.push(e);
  }

  // Assign symbol names to materialized fields
  const backEdgeSet = new Set(analysis.backEdges);
  const crossDomainEdgeSet = new Set(analysis.crossDomainEdges);
  const backEdgeSymbols = new Map<string, string>();
  const crossDomainSymbols = new Map<string, string>();
  for (const e of edges) {
    if (backEdgeSet.has(e.id)) {
      const targetDomain = analysis.blockDomains.get(e.target) ?? 'unknown';
      backEdgeSymbols.set(e.id, `feedback_${targetDomain}_${e.source}_to_${e.target}`);
    }
    if (crossDomainEdgeSet.has(e.id)) {
      const sourceDomain = analysis.blockDomains.get(e.source) ?? 'unknown';
      crossDomainSymbols.set(e.id, `${sourceDomain}:${e.source}_out`);
    }
  }

  const ctx: BuildContext = {
    nodeById,
    edgesIn,
    edgesOut,
    analysis,
    backEdgeSet,
    crossDomainEdgeSet,
    backEdgeSymbols,
    crossDomainSymbols,
  };

  // Group sinks by domain (each sink-domain becomes one compute pass + one render pass)
  const sinksByDomain = new Map<string, string[]>();
  const sinks = nodes.filter((n) => n.kind === 'sink');
  for (const sink of sinks) {
    const domain = analysis.blockDomains.get(sink.id);
    if (!domain) continue;
    if (!sinksByDomain.has(domain)) sinksByDomain.set(domain, []);
    sinksByDomain.get(domain)!.push(sink.id);
  }

  // A domain needs a compute pass if it has sinks OR if it produces values
  // consumed cross-domain by other domains' compute passes.
  const allComputeDomains = new Set<string>(sinksByDomain.keys());
  for (const e of edges) {
    if (!crossDomainEdgeSet.has(e.id)) continue;
    const sourceDomain = analysis.blockDomains.get(e.source);
    if (sourceDomain) allComputeDomains.add(sourceDomain);
  }
  // Also include domains that produce back-edge writes (a back edge's source
  // must be in some compute pass even if its primary chain doesn't reach a sink)
  for (const edgeId of backEdgeSet) {
    const e = findEdgeById(edges, edgeId);
    if (!e) continue;
    const sourceDomain = analysis.blockDomains.get(e.source);
    if (sourceDomain) allComputeDomains.add(sourceDomain);
  }

  const passes: GeneratedPass[] = [];
  const sortedDomains = Array.from(allComputeDomains).sort();
  for (const domain of sortedDomains) {
    const sinkIds = sinksByDomain.get(domain) ?? [];
    passes.push(buildComputePass(domain, sinkIds, ctx));
    for (const sinkId of sinkIds) {
      passes.push(buildRenderPass(sinkId, ctx));
    }
  }

  return { passes, backEdgeSymbols };
}

// ---------------------------------------------------------------------------
// Compute pass: walks back from each sink and back-edge write in the domain,
// emits let-bindings + StoreFields.
// ---------------------------------------------------------------------------

function buildComputePass(
  domain: string,
  sinkIds: readonly string[],
  ctx: BuildContext
): GeneratedPass {
  const lines: string[] = [];
  lines.push(`// === Compute pass: domain "${domain}" ===`);
  lines.push(`@compute @workgroup_size(64) fn compute_${domain}() {`);
  lines.push(`  let gid = global_invocation_id.x;`);
  lines.push('');

  // Track which block expressions have already been emitted as let bindings,
  // so multi-fanout produces a single binding shared by all consumers.
  const emittedBindings = new Map<string, string>();
  const emit = (line: string) => lines.push(`  ${line}`);

  /**
   * Recursively build the expression for a block, emitting let-bindings on
   * the fly. Returns the variable name to reference.
   */
  function exprFor(blockId: string): string {
    const cached = emittedBindings.get(blockId);
    if (cached) return cached;

    const node = ctx.nodeById.get(blockId);
    if (!node) return `<unknown:${blockId}>`;

    const varName = `v_${blockId}`;

    if (node.kind === 'generator') {
      emit(`let ${varName} = gen_${blockId}(gid);          // ${node.label}`);
      emittedBindings.set(blockId, varName);
      return varName;
    }

    if (node.kind === 'expression') {
      // Resolve all incoming edges into argument expressions
      const incoming = ctx.edgesIn.get(blockId) ?? [];
      const args: string[] = [];
      for (const e of incoming) {
        if (ctx.backEdgeSet.has(e.id)) {
          // Back edge: read previous-frame value from materialized field
          const sym = ctx.backEdgeSymbols.get(e.id) ?? '???';
          args.push(`LoadField('${sym}', gid) /*prev frame*/`);
        } else if (ctx.crossDomainEdgeSet.has(e.id)) {
          // Cross-domain: read from the other domain's stored field
          const sym = ctx.crossDomainSymbols.get(e.id) ?? '???';
          args.push(`LoadField('${sym}', gid)`);
        } else {
          // Forward edge in same domain: fuse upstream expression
          args.push(exprFor(e.source));
        }
      }
      emit(`let ${varName} = expr_${blockId}(${args.join(', ')});  // ${node.label}`);
      emittedBindings.set(blockId, varName);
      return varName;
    }

    // Sinks shouldn't be referenced as upstream by anything in this walk
    return `<unexpected_sink:${blockId}>`;
  }

  // First, walk every sink in this domain — produces let-bindings for the
  // entire fused tree, plus the sink's StoreFields.
  for (const sinkId of sinkIds) {
    const sinkNode = ctx.nodeById.get(sinkId)!;
    const incoming = ctx.edgesIn.get(sinkId) ?? [];
    const primary = incoming.find((e) => e.role === 'primary');
    if (!primary) continue;
    // The sink's primary input is the bundle we render.
    // The compute pass writes the bundle's fields here.
    const upstreamVar = exprFor(primary.source);
    emit(`StoreField('${domain}:${sinkId}_out', gid, sink_${sinkId}(${upstreamVar}));  // → ${sinkNode.label}`);
  }

  // Second, emit StoreFields for back-edge writes whose source is in this domain
  // (the source's value must be computed in this pass; emit it AFTER all sinks
  // so we can reuse cached let bindings — though order doesn't actually matter
  // since all reads/writes happen during the same dispatch).
  for (const [edgeId, sym] of ctx.backEdgeSymbols) {
    // Find the edge to get its source
    const edge = findEdge(ctx, edgeId);
    if (!edge) continue;
    const sourceDomain = ctx.analysis.blockDomains.get(edge.source);
    if (sourceDomain !== domain) continue;
    const upstreamVar = exprFor(edge.source);
    emit(`StoreField('${sym}', gid, ${upstreamVar});  // back-edge for cycle: ${edge.source} → ${edge.target}`);
  }

  // Third, emit StoreFields for cross-domain edges whose source is in this domain
  // (so consumer domains can LoadField them later in the frame).
  for (const [edgeId, sym] of ctx.crossDomainSymbols) {
    const edge = findEdge(ctx, edgeId);
    if (!edge) continue;
    const sourceDomain = ctx.analysis.blockDomains.get(edge.source);
    if (sourceDomain !== domain) continue;
    const upstreamVar = exprFor(edge.source);
    emit(`StoreField('${sym}', gid, ${upstreamVar});  // → consumed by domain ${ctx.analysis.blockDomains.get(edge.target) ?? '?'}`);
  }

  lines.push(`}`);
  return { kind: 'compute', title: `Compute pass: ${domain}`, lines };
}

// ---------------------------------------------------------------------------
// Render pass: one per sink. Reads the stored fields and runs the fragment.
// ---------------------------------------------------------------------------

function buildRenderPass(sinkId: string, ctx: BuildContext): GeneratedPass {
  const sinkNode = ctx.nodeById.get(sinkId)!;
  const domain = ctx.analysis.blockDomains.get(sinkId) ?? 'unknown';
  const lines: string[] = [];
  lines.push(`// === Render pass: ${sinkNode.label} (domain "${domain}") ===`);
  lines.push(`@vertex fn vert_${sinkId}(@builtin(instance_index) iid: u32) -> @builtin(position) vec4<f32> {`);
  lines.push(`  let value = LoadField('${domain}:${sinkId}_out', iid);`);
  lines.push(`  return position_from(value);`);
  lines.push(`}`);
  lines.push(`@fragment fn frag_${sinkId}() -> @location(0) vec4<f32> {`);
  lines.push(`  return color_from_${sinkId}();`);
  lines.push(`}`);
  return { kind: 'render', title: `Render pass: ${sinkNode.label}`, lines };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEdge(ctx: BuildContext, edgeId: string): MockEdge | undefined {
  for (const list of ctx.edgesOut.values()) {
    for (const e of list) {
      if (e.id === edgeId) return e;
    }
  }
  return undefined;
}

function findEdgeById(edges: readonly MockEdge[], edgeId: string): MockEdge | undefined {
  return edges.find((e) => e.id === edgeId);
}
