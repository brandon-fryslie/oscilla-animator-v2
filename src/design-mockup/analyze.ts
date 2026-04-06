/**
 * Feedback Mockup — Dependency Graph Analysis
 *
 * Pure functions over a node/edge graph. No ReactFlow imports.
 * Detects cycles, classifies blocks, finds materialization points.
 */

export type BlockKind = 'generator' | 'expression' | 'sink';

export interface MockNode {
  readonly id: string;
  readonly kind: BlockKind;
  readonly label: string;
  /**
   * For generators: the domain this generator declares.
   * For expressions: the primary bundle's domain (inherited from upstream primary).
   * For sinks: the domain they consume.
   * Inferred from edges; only generators source it.
   */
  readonly domain?: string;
}

export interface MockEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /**
   * 'primary' = the writable bundle wire (determines dispatch domain)
   * 'secondary' = read-only bundle wire (cross-domain read if domain differs)
   */
  readonly role: 'primary' | 'secondary';
}

export interface AnalysisResult {
  /** Block ID → resolved primary domain (the dispatch domain it operates in) */
  readonly blockDomains: ReadonlyMap<string, string | null>;
  /** Cycles in the graph (each is a list of node IDs forming the cycle) */
  readonly cycles: readonly (readonly string[])[];
  /** Edges that cross domain boundaries (always materialized as LoadField) */
  readonly crossDomainEdges: readonly string[];
  /**
   * Back edges: secondary edges inside a cycle. These are the only edges
   * that need StoreField/LoadField materialization to break the cycle.
   * Forward edges in a cycle still fuse normally.
   */
  readonly backEdges: readonly string[];
  /**
   * Cycles that contain no secondary edges. Structurally invalid because
   * the back edge has nowhere to materialize — this is a graph error.
   */
  readonly primaryOnlyCycles: readonly (readonly string[])[];
  /** Expressions where the primary input is missing (graph error) */
  readonly missingPrimaryBlocks: readonly string[];
  /** Expressions with multiple primary inputs (graph error) */
  readonly multiplePrimaryBlocks: readonly string[];
  /** Annotations: per-edge classification for the UI */
  readonly edgeAnnotations: ReadonlyMap<string, EdgeAnnotation>;
  /** Per-block status notes */
  readonly blockNotes: ReadonlyMap<string, readonly string[]>;
}

export type EdgeAnnotation =
  | { kind: 'fused'; note: string }              // same domain, no cycle, fuses through backward walk
  | { kind: 'cross-domain'; note: string }       // explicit LoadField (different domain)
  | { kind: 'feedback-cycle'; note: string }     // cycle edge — must materialize to break
  | { kind: 'fanout-let'; note: string }         // multi-fanout same pass — Let binding
  | { kind: 'error'; note: string };             // graph error

export function analyze(nodes: readonly MockNode[], edges: readonly MockEdge[]): AnalysisResult {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgesIn = new Map<string, MockEdge[]>();
  const edgesOut = new Map<string, MockEdge[]>();
  for (const e of edges) {
    if (!edgesIn.has(e.target)) edgesIn.set(e.target, []);
    if (!edgesOut.has(e.source)) edgesOut.set(e.source, []);
    edgesIn.get(e.target)!.push(e);
    edgesOut.get(e.source)!.push(e);
  }

  // 1. Validate primary input cardinality (Expression/Sink need exactly one primary)
  const missingPrimary: string[] = [];
  const multiplePrimary: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'generator') continue;
    const incoming = edgesIn.get(node.id) ?? [];
    const primaries = incoming.filter((e) => e.role === 'primary');
    if (primaries.length === 0) missingPrimary.push(node.id);
    if (primaries.length > 1) multiplePrimary.push(node.id);
  }

  // 2. Resolve each block's domain by walking primary edges back to a generator
  const blockDomains = new Map<string, string | null>();
  function resolveDomain(nodeId: string, visiting: Set<string>): string | null {
    if (blockDomains.has(nodeId)) return blockDomains.get(nodeId) ?? null;
    if (visiting.has(nodeId)) return null; // cycle — handled separately
    visiting.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) {
      visiting.delete(nodeId);
      return null;
    }
    let result: string | null = null;
    if (node.kind === 'generator') {
      result = node.domain ?? null;
    } else {
      const incoming = edgesIn.get(nodeId) ?? [];
      const primary = incoming.find((e) => e.role === 'primary');
      if (primary) {
        result = resolveDomain(primary.source, visiting);
      }
    }
    visiting.delete(nodeId);
    blockDomains.set(nodeId, result);
    return result;
  }
  for (const node of nodes) resolveDomain(node.id, new Set());

  // 3. Detect cycles via Tarjan's SCC
  const cycles = findCycles(nodes, edges);

  // For each cycle, classify edges in the cycle:
  //   - Secondary edges (the only kind that closes a cycle in a valid graph):
  //     these are the "back edges" that materialize as StoreField/LoadField.
  //   - Primary edges in the cycle: forward dataflow, still fuse normally.
  // A cycle composed entirely of primary edges is structurally invalid
  // (the dispatch domain has no anchor), so it's an error.
  const backEdges: string[] = [];
  const primaryOnlyCycles: string[][] = [];
  for (const cycle of cycles) {
    const cycleSet = new Set(cycle);
    // Find all edges whose endpoints are both in this cycle
    const inCycleEdges = edges.filter((e) => cycleSet.has(e.source) && cycleSet.has(e.target));
    const secondariesInCycle = inCycleEdges.filter((e) => e.role === 'secondary');
    if (secondariesInCycle.length === 0) {
      primaryOnlyCycles.push([...cycle]);
      // No back edge to mark — the cycle is invalid. Don't classify any edges
      // here; the error gets reported via primaryOnlyCycles.
      continue;
    }
    for (const e of secondariesInCycle) backEdges.push(e.id);
  }

  // 4. Cross-domain detection (only for non-back-edge edges)
  const crossDomainEdges: string[] = [];
  for (const e of edges) {
    if (backEdges.includes(e.id)) continue;
    const sourceDomain = blockDomains.get(e.source);
    const targetDomain = blockDomains.get(e.target);
    if (sourceDomain && targetDomain && sourceDomain !== targetDomain) {
      crossDomainEdges.push(e.id);
    }
  }

  // 5. Build per-edge annotations
  const fanoutCount = new Map<string, number>();
  for (const e of edges) {
    fanoutCount.set(e.source, (fanoutCount.get(e.source) ?? 0) + 1);
  }
  const edgeAnnotations = new Map<string, EdgeAnnotation>();
  for (const e of edges) {
    if (backEdges.includes(e.id)) {
      edgeAnnotations.set(e.id, {
        kind: 'feedback-cycle',
        note: 'Back edge of a feedback cycle. Compiler materializes this as StoreField (write current frame) + LoadField (read previous frame next frame). The only edge in a cycle that requires materialization — forward edges in the same cycle still fuse normally.',
      });
      continue;
    }
    if (crossDomainEdges.includes(e.id)) {
      const sd = blockDomains.get(e.source) ?? '?';
      const td = blockDomains.get(e.target) ?? '?';
      edgeAnnotations.set(e.id, {
        kind: 'cross-domain',
        note: `Cross-domain wire (${sd} → ${td}). Materialized as LoadField. Reads values stored by ${sd}'s compute pass earlier in the frame.`,
      });
      continue;
    }
    const fanout = fanoutCount.get(e.source) ?? 0;
    if (fanout >= 2) {
      edgeAnnotations.set(e.id, {
        kind: 'fanout-let',
        note: `Same domain, ${fanout} consumers share this expression. Compiler emits a 'let' binding (or the WGSL compiler CSEs the duplicated subtree) — same cost as 'fused' (zero), just structurally different in the IR.`,
      });
      continue;
    }
    edgeAnnotations.set(e.id, {
      kind: 'fused',
      note: 'Same domain, single consumer. Backward walk fuses upstream expression directly into downstream — zero cost.',
    });
  }

  // 6. Per-block notes
  const blockNotes = new Map<string, string[]>();
  function addNote(id: string, note: string) {
    if (!blockNotes.has(id)) blockNotes.set(id, []);
    blockNotes.get(id)!.push(note);
  }
  for (const id of missingPrimary) addNote(id, 'ERROR: Expression/Sink requires exactly one primary input wire.');
  for (const id of multiplePrimary) addNote(id, 'ERROR: Expression/Sink can only have one primary input wire.');
  for (const node of nodes) {
    const domain = blockDomains.get(node.id);
    if (node.kind === 'expression' || node.kind === 'sink') {
      if (domain === null && !missingPrimary.includes(node.id)) {
        addNote(node.id, 'WARNING: Could not resolve primary domain (cycle in primary chain?).');
      }
    }
  }
  for (const cycle of cycles) {
    const path = cycle.join(' → ') + ' → ' + cycle[0];
    for (const id of cycle) {
      addNote(id, `Part of feedback cycle: ${path}`);
    }
  }
  for (const cycle of primaryOnlyCycles) {
    const path = cycle.join(' → ') + ' → ' + cycle[0];
    for (const id of cycle) {
      addNote(id, `ERROR: Cycle with no secondary edge: ${path}. Primary-only cycles are invalid because there is no back edge to materialize. Mark one of the edges as secondary to declare it as feedback.`);
    }
  }

  return {
    blockDomains,
    cycles,
    crossDomainEdges,
    backEdges,
    primaryOnlyCycles,
    missingPrimaryBlocks: missingPrimary,
    multiplePrimaryBlocks: multiplePrimary,
    edgeAnnotations,
    blockNotes,
  };
}

/**
 * Tarjan's strongly connected components algorithm.
 * Returns SCCs of size > 1 (or single nodes with self-loops) — these are the cycles.
 */
function findCycles(nodes: readonly MockNode[], edges: readonly MockEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.source)?.push(e.target);

  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let counter = 0;
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const component: string[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      // Only keep components that are actual cycles (size > 1, or self-loop)
      if (component.length > 1) {
        sccs.push(component);
      } else {
        const single = component[0];
        if ((adj.get(single) ?? []).includes(single)) {
          sccs.push(component);
        }
      }
    }
  }

  for (const n of nodes) {
    if (!index.has(n.id)) strongconnect(n.id);
  }

  return sccs;
}
