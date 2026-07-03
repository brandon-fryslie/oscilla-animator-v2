/**
 * src/ui/nativeEditor/SceneBlockNode.tsx
 *
 * The reactflow node renderer for one authored scene block. It draws the block's
 * display name, its category accent, and a typed handle for each catalog port —
 * inputs on the left, outputs on the right, each colored by its SceneValueKind.
 *
 * [LAW:types-are-the-program] The node is driven entirely by catalog data
 *   (displayName, category, typed ports). It does NOT depend on V1's port
 *   contract (combineMode + InferenceCanonicalType), which scene ports — typed by
 *   SceneValueKind — do not have. Forcing PillarBlock through that contract would
 *   be a false type; this node speaks the scene vocabulary directly.
 * [LAW:one-source-of-truth] Node geometry lives in the constants below and is
 *   exported via `computeNodeSize`, so the canvas hands ELK the same dimensions
 *   the node actually renders at — handle anchors and layout spacing cannot drift.
 */
import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import type {
  SceneBlockCategory,
  ScenePortDeclaration,
  SceneValueKind,
} from '../../pillars/scene';

export const HEADER_HEIGHT = 28;
export const ROW_HEIGHT = 22;
const V_PADDING = 8;
export const NODE_WIDTH = 184;

/** The data a `SceneBlockNode` reads — derived from the catalog, never authored. */
export interface SceneBlockNodeData {
  readonly displayName: string;
  readonly category: SceneBlockCategory;
  readonly blockId: string;
  readonly inputs: readonly ScenePortDeclaration[];
  readonly outputs: readonly ScenePortDeclaration[];
}

/** Node height fits the busier side (inputs vs outputs); at least one row. */
export function computeNodeSize(data: SceneBlockNodeData): {
  width: number;
  height: number;
} {
  const rows = Math.max(data.inputs.length, data.outputs.length, 1);
  return { width: NODE_WIDTH, height: HEADER_HEIGHT + rows * ROW_HEIGHT + V_PADDING };
}

/** Vertical center of the i-th port row, measured from the node's top. */
function rowCenter(index: number): number {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

const CATEGORY_ACCENT: Record<SceneBlockCategory, string> = {
  instance: '#7c5cff',
  modifier: '#3a9bdc',
  draw: '#e06c4f',
  material: '#2bb3a3',
  asset: '#d9a441',
  color: '#d65db1',
  signal: '#7dcf5b',
  // A scalar→scalar transform on a route (Scale/Offset/Clamp) — a scalar sibling
  // of `modifier`, so it takes a related-but-distinct teal from modifier's blue.
  transform: '#5bc0be',
};

const VALUE_KIND_COLOR: Record<SceneValueKind, string> = {
  instanceBundle: '#9b7cff',
  geometry: '#5bb0ec',
  materialShell: '#3fd0bd',
  texture: '#e0a64f',
  camera: '#9aa0b5',
  color: '#ef8fd0',
  scalar: '#7fd98a',
  mask: '#e8d055',
};

export const SceneBlockNode: React.FC<NodeProps<SceneBlockNodeData>> = ({ data }) => {
  const { width, height } = computeNodeSize(data);
  const accent = CATEGORY_ACCENT[data.category];

  return (
    <div
      data-testid={`native-graph-node-${data.blockId}`}
      style={{
        width,
        height,
        background: '#1d1d29',
        border: `1px solid ${accent}`,
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        color: '#e6e6ef',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          lineHeight: `${HEADER_HEIGHT}px`,
          padding: '0 10px',
          fontWeight: 600,
          fontSize: 12,
          borderBottom: '1px solid #2a2a38',
          background: `${accent}22`,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}
        title={`${data.displayName} (${data.blockId})`}
      >
        {data.displayName}
      </div>

      {data.inputs.map((port, i) => (
        <PortRow key={`in-${port.id}`} port={port} side="left" top={rowCenter(i)} blockId={data.blockId} />
      ))}
      {data.outputs.map((port, i) => (
        <PortRow key={`out-${port.id}`} port={port} side="right" top={rowCenter(i)} blockId={data.blockId} />
      ))}
    </div>
  );
};

const PortRow: React.FC<{
  port: ScenePortDeclaration;
  side: 'left' | 'right';
  top: number;
  blockId: string;
}> = ({ port, side, top, blockId }) => {
  const color = VALUE_KIND_COLOR[port.value];
  const isLeft = side === 'left';
  return (
    <>
      <Handle
        type={isLeft ? 'target' : 'source'}
        position={isLeft ? Position.Left : Position.Right}
        id={port.id}
        data-testid={`native-graph-handle-${blockId}-${port.id}`}
        style={{ top, background: color, border: '1px solid #11111a', width: 9, height: 9 }}
        isConnectable={false}
      />
      <span
        style={{
          position: 'absolute',
          top: top - ROW_HEIGHT / 2,
          [isLeft ? 'left' : 'right']: 10,
          height: ROW_HEIGHT,
          lineHeight: `${ROW_HEIGHT}px`,
          color: '#b7b7c8',
          maxWidth: NODE_WIDTH / 2 - 6,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          textAlign: isLeft ? 'left' : 'right',
        }}
        title={`${port.label}: ${port.value}`}
      >
        {port.label}
      </span>
    </>
  );
};
