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
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useStores } from '../../stores';
import type { SceneRegistry } from '../../pillars/scene';
import type { PillarPatch } from '../../pillars/types';
import { layoutGraphLeftToRight } from './graphLayout';
import { SceneBlockNode, computeNodeSize, type SceneBlockNodeData } from './SceneBlockNode';

const nodeTypes: NodeTypes = { sceneBlock: SceneBlockNode };

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

/** Build the reactflow edges, anchoring each to the source block's sole output. */
function buildEdges(patch: PillarPatch, registry: SceneRegistry): Edge[] {
  return patch.edges.map((edge) => {
    const sourceOutput = registry
      .get(patch.blocks.find((b) => b.id === edge.source)?.type ?? '')
      ?.catalog.ports.find((p) => p.direction === 'output');
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: sourceOutput?.id,
      targetHandle: edge.inputSlot,
      style: { stroke: '#5a5a72', strokeWidth: 1.5 },
    };
  });
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
  const { pillarPatch } = useStores();
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
    void layoutGraphLeftToRight(base.nodes, base.edges).then((positioned) => {
      if (cancelled) return;
      setNodes(positioned);
      setEdges(base.edges);
      // Fit after the new positions paint so the whole graph is visible.
      requestAnimationFrame(() => {
        if (!cancelled) fitView({ padding: 0.15, duration: 200 });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [base, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#0f0f17' }}
    >
      <Background color="#23233a" gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
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
