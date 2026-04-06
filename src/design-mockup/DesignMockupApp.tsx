/**
 * Design Mockup App
 *
 * Standalone ReactFlow editor for sketching dependency graphs and seeing
 * how the SourceBundle + Expression block model would handle them.
 *
 * Use cases:
 * - Sketch a scenario, see live analysis (cycles, cross-domain reads, fusion)
 * - Load a pre-built example from the sidebar
 * - Copy current graph as compact text to paste in chat
 * - Wire blocks with primary (solid) or secondary (dashed) bundle edges
 */

import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
  type EdgeProps,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { analyze, type MockNode, type MockEdge, type AnalysisResult, type EdgeAnnotation, type BlockKind } from './analyze';
import { serializeToText, parseText } from './text-format';
import { EXAMPLES, loadExample } from './examples';
import { generateIR, type GeneratedIR } from './generate-ir';

// ---------------------------------------------------------------------------
// Node + edge data shapes
// ---------------------------------------------------------------------------

interface NodeData {
  kind: BlockKind;
  label: string;
  domain?: string;
  notes: readonly string[];
  resolvedDomain: string | null;
}

interface EdgeData {
  role: 'primary' | 'secondary';
  annotation?: EdgeAnnotation;
}

// ---------------------------------------------------------------------------
// Custom node component
// ---------------------------------------------------------------------------

const KIND_COLORS: Record<BlockKind, { bg: string; border: string }> = {
  generator: { bg: '#1e3a5f', border: '#4a90e2' },
  expression: { bg: '#3a2e1e', border: '#e2a04a' },
  sink: { bg: '#3a1e2e', border: '#e24a90' },
};

const KIND_LABELS: Record<BlockKind, string> = {
  generator: 'GENERATOR',
  expression: 'EXPRESSION',
  sink: 'SINK',
};

function CustomNode({ data, selected }: NodeProps<NodeData>) {
  const colors = KIND_COLORS[data.kind];
  const hasError = data.notes.some((n) => n.startsWith('ERROR'));
  const hasCycle = data.notes.some((n) => n.startsWith('Part of feedback cycle'));
  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${hasError ? '#e25555' : hasCycle ? '#e2c54a' : colors.border}`,
        borderRadius: 6,
        padding: '8px 14px',
        minWidth: 160,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#eee',
        boxShadow: selected ? '0 0 0 2px #fff' : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#888', width: 10, height: 10 }} />
      <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 1 }}>{KIND_LABELS[data.kind]}</div>
      <div style={{ fontWeight: 'bold', marginTop: 2 }}>{data.label}</div>
      {data.kind === 'generator' && data.domain && (
        <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>domain: {data.domain}</div>
      )}
      {data.kind !== 'generator' && data.resolvedDomain && (
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>↳ {data.resolvedDomain}</div>
      )}
      {data.notes.length > 0 && (
        <div style={{ fontSize: 10, marginTop: 4, color: hasError ? '#ff8888' : '#ffe488' }}>
          {data.notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#888', width: 10, height: 10 }} />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

// ---------------------------------------------------------------------------
// Custom edge component
// ---------------------------------------------------------------------------

const EDGE_COLORS: Record<EdgeAnnotation['kind'], string> = {
  fused: '#4a90e2',
  'cross-domain': '#e29044',
  'feedback-cycle': '#e2c54a',
  'fanout-let': '#9a7ae2',
  error: '#e25555',
};

function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<EdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const role = data?.role ?? 'primary';
  const annotation = data?.annotation;
  const color = annotation ? EDGE_COLORS[annotation.kind] : '#888';
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 4 : 2.5,
          strokeDasharray: role === 'secondary' ? '6 4' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: '#222',
            color,
            border: `1px solid ${color}`,
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 9,
            fontFamily: 'monospace',
            pointerEvents: 'all',
            whiteSpace: 'nowrap',
          }}
          className="nodrag nopan"
        >
          {role}{annotation ? ` · ${annotation.kind}` : ''}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { custom: CustomEdge };

// ---------------------------------------------------------------------------
// Auto-layout: rank nodes by longest path from a source, place left-to-right
// ---------------------------------------------------------------------------

function autoLayout(nodes: readonly MockNode[], edges: readonly MockEdge[]): Map<string, { x: number; y: number }> {
  // Compute "depth" = longest path length from any source (node with no incoming).
  // Cycles get a fixed rank to avoid infinite recursion.
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    incoming.get(e.target)?.push(e.source);
    outgoing.get(e.source)?.push(e.target);
  }

  const depth = new Map<string, number>();
  function computeDepth(id: string, visiting: Set<string>): number {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle — break
    visiting.add(id);
    const preds = incoming.get(id) ?? [];
    let maxPred = -1;
    for (const p of preds) {
      maxPred = Math.max(maxPred, computeDepth(p, visiting));
    }
    visiting.delete(id);
    const result = maxPred + 1;
    depth.set(id, result);
    return result;
  }
  for (const n of nodes) computeDepth(n.id, new Set());

  // Group nodes by depth, sort by id for stability
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  for (const ids of byDepth.values()) ids.sort();

  // Assign positions
  const COL_WIDTH = 240;
  const ROW_HEIGHT = 130;
  const positions = new Map<string, { x: number; y: number }>();
  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  for (const d of sortedDepths) {
    const ids = byDepth.get(d)!;
    ids.forEach((id, i) => {
      positions.set(id, {
        x: 80 + d * COL_WIDTH,
        y: 80 + i * ROW_HEIGHT,
      });
    });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

let nodeIdCounter = 1;
let edgeIdCounter = 1;
const nextNodeId = () => `n${nodeIdCounter++}`;
const nextEdgeId = () => `e${edgeIdCounter++}`;

interface PaletteSpec {
  kind: BlockKind;
  label: string;
  domainPrompt?: boolean;
}

const PALETTE: PaletteSpec[] = [
  { kind: 'generator', label: 'Generator', domainPrompt: true },
  { kind: 'expression', label: 'Expression' },
  { kind: 'sink', label: 'Sink' },
];

export function DesignMockupApp() {
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<EdgeData>[]>([]);
  const [pendingRole, setPendingRole] = useState<'primary' | 'secondary'>('primary');
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);

  const { analysis, generatedIR }: { analysis: AnalysisResult; generatedIR: GeneratedIR } = useMemo(() => {
    const mockNodes: MockNode[] = nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      domain: n.data.domain,
    }));
    const mockEdges: MockEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      role: e.data?.role ?? 'primary',
    }));
    const a = analyze(mockNodes, mockEdges);
    const ir = generateIR(mockNodes, mockEdges, a);
    return { analysis: a, generatedIR: ir };
  }, [nodes, edges]);

  const decoratedNodes = useMemo<Node<NodeData>[]>(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        notes: analysis.blockNotes.get(n.id) ?? [],
        resolvedDomain: analysis.blockDomains.get(n.id) ?? null,
      },
    }));
  }, [nodes, analysis]);

  const decoratedEdges = useMemo<Edge<EdgeData>[]>(() => {
    return edges.map((e) => ({
      ...e,
      data: {
        ...e.data!,
        annotation: analysis.edgeAnnotations.get(e.id),
      },
      animated: analysis.edgeAnnotations.get(e.id)?.kind === 'feedback-cycle',
    }));
  }, [edges, analysis]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const id = nextEdgeId();
    setEdges((eds) =>
      addEdge(
        {
          id,
          source: conn.source!,
          target: conn.target!,
          type: 'custom',
          data: { role: pendingRole },
        },
        eds
      )
    );
  }, [pendingRole]);

  const addNode = useCallback((spec: PaletteSpec) => {
    let domain: string | undefined;
    if (spec.domainPrompt) {
      const input = window.prompt('Domain name for this generator:', `dom${nodeIdCounter}`);
      if (input === null) return;
      domain = input.trim() || `dom${nodeIdCounter}`;
    }
    const label = window.prompt('Label for this block:', spec.label) ?? spec.label;
    const id = nextNodeId();
    const newNode: Node<NodeData> = {
      id,
      type: 'custom',
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      data: {
        kind: spec.kind,
        label,
        domain,
        notes: [],
        resolvedDomain: null,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setActiveExampleId(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge));
      setSelectedEdge(null);
    }
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
      setSelectedNode(null);
    }
  }, [selectedEdge, selectedNode]);

  const toggleEdgeRole = useCallback(() => {
    if (!selectedEdge) return;
    setEdges((eds) =>
      eds.map((e) =>
        e.id === selectedEdge
          ? { ...e, data: { ...e.data!, role: e.data!.role === 'primary' ? 'secondary' : 'primary' } }
          : e
      )
    );
  }, [selectedEdge]);

  const clearGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedEdge(null);
    setSelectedNode(null);
    setActiveExampleId(null);
  }, []);

  // Replace the current graph with a serialized one. Used by example loader
  // and text-paste import. Auto-lays out by depth.
  const replaceGraph = useCallback((mockNodes: readonly MockNode[], mockEdges: readonly MockEdge[]) => {
    const positions = autoLayout(mockNodes, mockEdges);
    const newNodes: Node<NodeData>[] = mockNodes.map((mn) => ({
      id: mn.id,
      type: 'custom',
      position: positions.get(mn.id) ?? { x: 100, y: 100 },
      data: {
        kind: mn.kind,
        label: mn.label,
        domain: mn.domain,
        notes: [],
        resolvedDomain: null,
      },
    }));
    const newEdges: Edge<EdgeData>[] = mockEdges.map((me) => ({
      id: me.id,
      source: me.source,
      target: me.target,
      type: 'custom',
      data: { role: me.role },
    }));
    // Bump counters past loaded ids so subsequent additions don't collide
    for (const n of newNodes) {
      const num = parseInt(n.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(num) && num >= nodeIdCounter) nodeIdCounter = num + 1;
    }
    for (const e of newEdges) {
      const num = parseInt(e.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(num) && num >= edgeIdCounter) edgeIdCounter = num + 1;
    }
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedEdge(null);
    setSelectedNode(null);
  }, []);

  const handleLoadExample = useCallback((id: string) => {
    const graph = loadExample(id);
    replaceGraph(graph.nodes, graph.edges);
    setActiveExampleId(id);
  }, [replaceGraph]);

  const copyAsText = useCallback(() => {
    const mockNodes: MockNode[] = nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      domain: n.data.domain,
    }));
    const mockEdges: MockEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      role: e.data?.role ?? 'primary',
    }));
    const text = serializeToText(mockNodes, mockEdges);
    navigator.clipboard.writeText(text).then(
      () => alert('Graph copied to clipboard as text:\n\n' + text),
      () => {
        console.log('Graph text:', text);
        alert('Could not copy to clipboard. Open the console for the text.');
      }
    );
  }, [nodes, edges]);

  const pasteText = useCallback(() => {
    const input = window.prompt('Paste graph text:');
    if (!input) return;
    const result = parseText(input);
    if (result.errors.length > 0) {
      alert('Parse errors:\n' + result.errors.join('\n'));
      return;
    }
    replaceGraph(result.graph.nodes, result.graph.edges);
    setActiveExampleId(null);
  }, [replaceGraph]);

  const selectedEdgeData = selectedEdge ? decoratedEdges.find((e) => e.id === selectedEdge) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <Toolbar
        pendingRole={pendingRole}
        setPendingRole={setPendingRole}
        addNode={addNode}
        deleteSelected={deleteSelected}
        toggleEdgeRole={toggleEdgeRole}
        copyAsText={copyAsText}
        pasteText={pasteText}
        clearGraph={clearGraph}
        canDelete={Boolean(selectedEdge || selectedNode)}
        canToggle={Boolean(selectedEdge)}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <ExamplesSidebar
          activeId={activeExampleId}
          onLoad={handleLoadExample}
        />
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onEdgeClick={(_, e) => { setSelectedEdge(e.id); setSelectedNode(null); }}
            onNodeClick={(_, n) => { setSelectedNode(n.id); setSelectedEdge(null); }}
            onPaneClick={() => { setSelectedEdge(null); setSelectedNode(null); }}
            fitView
            defaultEdgeOptions={{ type: 'custom' }}
          >
            <Background color="#333" gap={16} />
            <Controls />
            <MiniMap nodeColor={(n) => KIND_COLORS[(n.data as NodeData).kind]?.border ?? '#888'} maskColor="rgba(0,0,0,0.7)" style={{ background: '#222' }} />
          </ReactFlow>
        </div>
        <SidePanel
          analysis={analysis}
          generatedIR={generatedIR}
          selectedEdgeData={selectedEdgeData}
          activeExampleId={activeExampleId}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar(props: {
  pendingRole: 'primary' | 'secondary';
  setPendingRole: (r: 'primary' | 'secondary') => void;
  addNode: (spec: PaletteSpec) => void;
  deleteSelected: () => void;
  toggleEdgeRole: () => void;
  copyAsText: () => void;
  pasteText: () => void;
  clearGraph: () => void;
  canDelete: boolean;
  canToggle: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 12px',
        background: '#222',
        borderBottom: '1px solid #444',
        alignItems: 'center',
        fontFamily: 'monospace',
        fontSize: 12,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ color: '#888' }}>Add:</span>
      {PALETTE.map((spec) => (
        <button
          key={spec.kind}
          onClick={() => props.addNode(spec)}
          style={btnStyle({
            generator: '#4a90e2',
            expression: '#e2a04a',
            sink: '#e24a90',
          }[spec.kind])}
        >
          + {spec.label}
        </button>
      ))}
      <span style={{ marginLeft: 16, color: '#888' }}>Next wire:</span>
      <button
        onClick={() => props.setPendingRole('primary')}
        style={{
          ...btnStyle('#888'),
          background: props.pendingRole === 'primary' ? '#4a90e2' : '#333',
          color: '#fff',
        }}
      >
        Primary (solid)
      </button>
      <button
        onClick={() => props.setPendingRole('secondary')}
        style={{
          ...btnStyle('#888'),
          background: props.pendingRole === 'secondary' ? '#4a90e2' : '#333',
          color: '#fff',
        }}
      >
        Secondary (dashed)
      </button>
      <span style={{ marginLeft: 16, color: '#888' }}>Selected:</span>
      <button onClick={props.toggleEdgeRole} disabled={!props.canToggle} style={btnStyle('#666')}>
        Toggle role
      </button>
      <button onClick={props.deleteSelected} disabled={!props.canDelete} style={btnStyle('#e25555')}>
        Delete
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={props.copyAsText} style={btnStyle('#4a90e2')}>Copy as text</button>
      <button onClick={props.pasteText} style={btnStyle('#666')}>Paste text</button>
      <button onClick={props.clearGraph} style={btnStyle('#666')}>Clear</button>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '4px 10px',
    background: '#333',
    color: '#fff',
    border: `1px solid ${color}`,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'monospace',
  };
}

// ---------------------------------------------------------------------------
// Examples sidebar (left)
// ---------------------------------------------------------------------------

function ExamplesSidebar({ activeId, onLoad }: { activeId: string | null; onLoad: (id: string) => void }) {
  return (
    <div
      style={{
        width: 260,
        background: '#1a1b1e',
        borderRight: '1px solid #444',
        padding: 12,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#ccc',
      }}
    >
      <h3 style={{ fontSize: 13, marginBottom: 8, color: '#fff' }}>Examples</h3>
      <div style={{ color: '#666', marginBottom: 12, fontSize: 10 }}>
        Click to load. Auto-laid out by depth.
      </div>
      {EXAMPLES.map((ex) => (
        <button
          key={ex.id}
          onClick={() => onLoad(ex.id)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            marginBottom: 6,
            background: activeId === ex.id ? '#2a3a55' : '#222',
            color: '#fff',
            border: `1px solid ${activeId === ex.id ? '#4a90e2' : '#444'}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 'bold' }}>{ex.title}</div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right side panel (analysis + selected edge + legend)
// ---------------------------------------------------------------------------

function SidePanel({
  analysis,
  generatedIR,
  selectedEdgeData,
  activeExampleId,
}: {
  analysis: AnalysisResult;
  generatedIR: GeneratedIR;
  selectedEdgeData: Edge<EdgeData> | null | undefined;
  activeExampleId: string | null;
}) {
  const activeExample = activeExampleId ? EXAMPLES.find((e) => e.id === activeExampleId) : null;
  return (
    <div
      style={{
        width: 460,
        background: '#1e1f22',
        borderLeft: '1px solid #444',
        padding: 12,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#ccc',
      }}
    >
      {activeExample && (
        <>
          <h3 style={{ fontSize: 13, marginBottom: 4, color: '#fff' }}>{activeExample.title}</h3>
          <div style={{ color: '#aaa', marginBottom: 12, lineHeight: 1.5 }}>
            {activeExample.description}
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #333', marginBottom: 12 }} />
        </>
      )}

      <h3 style={{ fontSize: 13, marginBottom: 8, color: '#fff' }}>Analysis</h3>

      <Section title="Cycles" count={analysis.cycles.length}>
        {analysis.cycles.length === 0 ? (
          <Empty>No feedback cycles.</Empty>
        ) : (
          analysis.cycles.map((cycle, i) => (
            <div key={i} style={{ color: '#e2c54a', marginBottom: 4 }}>
              {cycle.join(' → ')} → {cycle[0]}
            </div>
          ))
        )}
      </Section>

      <Section title="Cross-domain edges" count={analysis.crossDomainEdges.length}>
        {analysis.crossDomainEdges.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          <div style={{ color: '#e29044' }}>
            {analysis.crossDomainEdges.length} edge(s) cross domain boundaries. Each becomes a LoadField.
          </div>
        )}
      </Section>

      <Section
        title="Errors"
        count={analysis.missingPrimaryBlocks.length + analysis.multiplePrimaryBlocks.length + analysis.primaryOnlyCycles.length}
      >
        {analysis.missingPrimaryBlocks.length === 0 &&
          analysis.multiplePrimaryBlocks.length === 0 &&
          analysis.primaryOnlyCycles.length === 0 ? (
          <Empty>No errors.</Empty>
        ) : (
          <div style={{ color: '#ff8888' }}>
            {analysis.missingPrimaryBlocks.length > 0 && (
              <div>{analysis.missingPrimaryBlocks.length} missing primary input(s)</div>
            )}
            {analysis.multiplePrimaryBlocks.length > 0 && (
              <div>{analysis.multiplePrimaryBlocks.length} block(s) with multiple primary inputs</div>
            )}
            {analysis.primaryOnlyCycles.length > 0 && (
              <div>{analysis.primaryOnlyCycles.length} primary-only cycle(s) — needs a secondary edge to mark the back edge</div>
            )}
          </div>
        )}
      </Section>

      <h3 style={{ fontSize: 13, marginTop: 16, marginBottom: 8, color: '#fff' }}>Selected edge</h3>
      {!selectedEdgeData ? (
        <Empty>Click an edge to see details.</Empty>
      ) : (
        <div>
          <div style={{ color: '#888' }}>{selectedEdgeData.source} → {selectedEdgeData.target}</div>
          <div style={{ marginTop: 4 }}>Role: <strong>{selectedEdgeData.data?.role}</strong></div>
          {selectedEdgeData.data?.annotation && (
            <>
              <div style={{ marginTop: 4 }}>
                Compiler: <strong style={{ color: EDGE_COLORS[selectedEdgeData.data.annotation.kind] }}>{selectedEdgeData.data.annotation.kind}</strong>
              </div>
              <div style={{ marginTop: 6, color: '#aaa' }}>{selectedEdgeData.data.annotation.note}</div>
            </>
          )}
        </div>
      )}

      <h3 style={{ fontSize: 13, marginTop: 16, marginBottom: 8, color: '#fff' }}>Generated IR (pseudo-WGSL)</h3>
      {generatedIR.passes.length === 0 ? (
        <Empty>No passes (graph is empty or has no sinks).</Empty>
      ) : (
        generatedIR.passes.map((pass, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>
              {pass.kind === 'compute' ? '⚙ COMPUTE' : '🖼 RENDER'}
            </div>
            <pre
              style={{
                background: '#111',
                border: '1px solid #333',
                borderRadius: 4,
                padding: 8,
                fontSize: 10,
                lineHeight: 1.4,
                color: '#cdd',
                overflowX: 'auto',
                whiteSpace: 'pre',
                margin: 0,
              }}
            >
              {pass.lines.join('\n')}
            </pre>
          </div>
        ))
      )}

      <h3 style={{ fontSize: 13, marginTop: 16, marginBottom: 8, color: '#fff' }}>Legend</h3>
      <Legend swatch="#4a90e2" label="fused (zero cost)" />
      <Legend swatch="#9a7ae2" label="fanout-let (zero cost, structural sharing)" />
      <Legend swatch="#e29044" label="cross-domain (LoadField)" />
      <Legend swatch="#e2c54a" label="feedback-cycle back-edge (materialized)" />
      <Legend swatch="#e25555" label="error" />
      <div style={{ marginTop: 8, color: '#888' }}>
        Solid line = primary (writable, sets dispatch domain)<br />
        Dashed line = secondary (read-only)
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
        {title.toUpperCase()} {count > 0 && <span style={{ color: '#fff' }}>({count})</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#555', fontStyle: 'italic' }}>{children}</div>;
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <div style={{ width: 16, height: 4, background: swatch, borderRadius: 2 }} />
      <span style={{ fontSize: 10 }}>{label}</span>
    </div>
  );
}
