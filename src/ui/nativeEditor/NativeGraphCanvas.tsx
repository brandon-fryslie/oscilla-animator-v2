/**
 * src/ui/nativeEditor/NativeGraphCanvas.tsx
 *
 * The native ScenePlan editor's node-graph canvas. It reads the authored patch
 * from `PillarPatchStore` and draws it as a node graph laid out automatically
 * left-to-right (sources left, sinks right). Blocks are NOT hand-draggable — the
 * editor positions them algorithmically, the anti-spaghetti model from the spec.
 *
 * [LAW:one-way-deps] Reads `PillarPatchStore` + the scene catalog only. It does
 *   not touch a renderer, a Three object, or V1's editor contracts.
 * [LAW:one-source-of-truth] Nodes/edges are derived from the authored patch every
 *   render; the canvas stores only the ELK-resolved positions, never block truth.
 * [LAW:no-ambient-temporal-coupling] Relayout is owned by one effect keyed on the
 *   patch topology; config edits (which never change topology) do not reflow it.
 *   Selection/dimming/perspective-rotation is a SECOND, independent derivation that
 *   reads positions but never writes them — focusing or re-rooting a path must not
 *   reflow the graph.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useStores } from '../../stores';
import type { BlockId } from '../../types';
import type { SceneRegistry } from '../../pillars/scene';
import type { PillarPatch } from '../../pillars/types';
import { layoutGraphLeftToRight } from './graphLayout';
import {
  computeFocusPath,
  rotatePerspective,
  stepChain,
  DEFAULT_PERSPECTIVE,
  type ChainDirection,
  type PerspectiveChoices,
} from './chainFocus';
import { SceneBlockNode, computeNodeSize, type SceneBlockNodeData } from './SceneBlockNode';

const nodeTypes: NodeTypes = { sceneBlock: SceneBlockNode };

/** Off-chain elements fade so the focused dataflow stands out (the anti-spaghetti model). */
const ON_CHAIN_OPACITY = 1;
const OFF_CHAIN_OPACITY = 0.3;

/** Arrow keys map to a dataflow direction; the graph flows left→right (sources left). */
const KEY_DIRECTION: Readonly<Record<string, ChainDirection>> = {
  ArrowLeft: 'upstream',
  ArrowRight: 'downstream',
};

/** Build the (unpositioned) reactflow nodes for the authored patch. */
function buildNodes(patch: PillarPatch, registry: SceneRegistry): Node<SceneBlockNodeData>[] {
  return patch.blocks.map((block) => {
    const ports = registry.get(block.type)?.catalog.ports ?? [];
    const data: SceneBlockNodeData = {
      displayName: registry.get(block.type)?.catalog.displayName ?? block.type,
      category: registry.get(block.type)?.catalog.category ?? 'modifier',
      blockId: block.id,
      inputs: ports.filter((p) => p.direction === 'input'),
      outputs: ports.filter((p) => p.direction === 'output'),
    };
    const { width, height } = computeNodeSize(data);
    return {
      id: block.id,
      type: 'sceneBlock',
      position: { x: 0, y: 0 },
      width,
      height,
      data,
    };
  });
}

/**
 * Build the reactflow edges, anchoring each to the source block's sole output.
 *
 * The store invariant guarantees every edge references existing blocks
 * (`PillarPatchStore.removeBlock` prunes edges with their blocks; `addEdge` only
 * wires existing sources), so the source block is always present — the handle map
 * is keyed by block id with no missing-block coercion. The one optionality that
 * legitimately remains is a block whose *type* is unregistered (a stale persisted
 * patch): its output handle is absent, which renders as an unanchored edge and is
 * reported by the validation/diagnostics boundary, not swallowed here.
 */
function buildEdges(patch: PillarPatch, registry: SceneRegistry): Edge[] {
  const outputHandleByBlock = new Map<string, string | undefined>(
    patch.blocks.map((b) => [
      b.id,
      registry.get(b.type)?.catalog.ports.find((p) => p.direction === 'output')?.id,
    ]),
  );
  return patch.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: outputHandleByBlock.get(edge.source),
    targetHandle: edge.inputSlot,
    style: { stroke: '#5a5a72', strokeWidth: 1.5 },
  }));
}

/** A stable signature of the patch *topology* — changes only on add/remove/wire. */
function topologyKey(patch: PillarPatch): string {
  const blocks = patch.blocks.map((b) => `${b.id}:${b.type}`).join(',');
  const edges = patch.edges
    .map((e) => `${e.id}:${e.source}>${e.target}.${e.inputSlot}`)
    .join(',');
  return `${blocks}|${edges}`;
}

const GraphInner: React.FC = observer(() => {
  const { pillarPatch, selection } = useStores();
  const { patch, registry } = pillarPatch;
  const { fitView } = useReactFlow();

  const key = topologyKey(patch);
  // Rebuild base graph whenever topology changes; positions come from ELK below.
  const base = useMemo(
    () => ({ nodes: buildNodes(patch, registry), edges: buildEdges(patch, registry) }),
    [key],
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    let cancelled = false;
    layoutGraphLeftToRight(base.nodes, base.edges)
      .then((positioned) => {
        if (cancelled) return;
        setNodes(positioned);
        setEdges(base.edges);
        // Fit after the new positions paint so the whole graph is visible.
        requestAnimationFrame(() => {
          if (!cancelled) fitView({ padding: 0.15, duration: 200 });
        });
      })
      // [LAW:no-silent-failure] An ELK rejection must surface, not vanish — a
      // swallowed layout error would leave the graph blank with no signal.
      .catch((err: unknown) => {
        console.error('Native graph layout failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [base, fitView]);

  // --- Chain focus (view state; deliberately separate from the layout above) ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The perspective: which branch is followed at each pivot. Resets with a fresh
  // selection and accumulates as right-clicks rotate pivots; the lit path is derived.
  const [choices, setChoices] = useState<PerspectiveChoices>(DEFAULT_PERSPECTIVE);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // A selection survives only as long as its block does; a topology change that
  // removes the focused block clears focus rather than dimming the whole graph.
  // [LAW:one-source-of-truth] The patch's block set decides what is selectable.
  useEffect(() => {
    if (selectedId !== null && !patch.blocks.some((b) => b.id === selectedId)) {
      setSelectedId(null);
      setChoices(DEFAULT_PERSPECTIVE);
    }
  }, [key, selectedId, patch.blocks]);

  // The focused dataflow path; `null` when nothing is selected means "dim nothing".
  const focusPath = useMemo(
    () => (selectedId === null ? null : computeFocusPath(patch.edges, selectedId, choices)),
    [selectedId, choices, key, patch.edges],
  );

  // Dimming is a pure overlay on the laid-out nodes/edges: it adds opacity (and a
  // ring on the selected node) without touching positions, so it never reflows.
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const onChain = focusPath === null || focusPath.has(node.id);
        const selected = node.id === selectedId;
        return {
          ...node,
          style: {
            ...node.style,
            opacity: onChain ? ON_CHAIN_OPACITY : OFF_CHAIN_OPACITY,
            ...(selected
              ? { boxShadow: '0 0 0 2px #e6e6ef', borderRadius: 8 }
              : {}),
          },
        };
      }),
    [nodes, focusPath, selectedId],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const onChain =
          focusPath === null || (focusPath.has(edge.source) && focusPath.has(edge.target));
        return {
          ...edge,
          style: { ...edge.style, opacity: onChain ? ON_CHAIN_OPACITY : OFF_CHAIN_OPACITY },
        };
      }),
    [edges, focusPath],
  );

  // A fresh selection starts from the default perspective — clicking a block is "show
  // me this block's path following first branches", and rotation builds from there.
  // The local selectedId drives the focus-path visualization; publishing to the
  // shared SelectionStore in parallel lets the inspector panel populate this block's
  // detail from the Graph tab too — the same neutral selection surface the Mature
  // canvas writes. [LAW:one-source-of-truth]
  const selectNode: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedId(node.id);
    setChoices(DEFAULT_PERSPECTIVE);
    selection.selectBlock(node.id as BlockId);
    wrapperRef.current?.focus();
  }, [selection]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setChoices(DEFAULT_PERSPECTIVE);
    selection.clearSelection();
  }, [selection]);

  // Right-click rotates the perspective at a pivot to follow a different branch. The
  // selection holds; only the followed branch changes, so the lit path re-roots
  // without reflowing the graph. A non-pivot returns the same choices (a no-op).
  const rotateAt: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      if (selectedId === null) return;
      setChoices((current) => rotatePerspective(patch.edges, selectedId, current, node.id));
    },
    [selectedId, patch.edges],
  );

  // Arrow keys step the selection along the followed path; the key→direction map keeps
  // the variability in data, so the handler is one lookup, not a branch per key. The
  // perspective is preserved so arrowing walks exactly the path that is lit.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (selectedId === null) return;
      const direction = KEY_DIRECTION[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      const next = stepChain(patch.edges, selectedId, direction, choices);
      if (next !== null) {
        setSelectedId(next);
        selection.selectBlock(next as BlockId);
      }
    },
    [selectedId, choices, patch.edges, selection],
  );

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="native-graph-focus"
      style={{ width: '100%', height: '100%', outline: 'none' }}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={selectNode}
        onNodeContextMenu={rotateAt}
        onPaneClick={clearSelection}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#0f0f17' }}
      >
        <Background color="#23233a" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
});

export const NativeGraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} data-testid="native-graph-canvas" style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <GraphInner />
      </ReactFlowProvider>
    </div>
  );
};
