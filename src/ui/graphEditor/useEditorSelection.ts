/**
 * useEditorSelection — the neutral selection surface the inspector reads.
 *
 * What is currently selected (a block, an edge, a port, or a library type preview)
 * is era-neutral state — ids only — shared by both boots through the one
 * SelectionStore. This hook projects that store into a neutral `EditorSelectionRef`
 * and exposes block navigation, so an inspector never imports a store to learn what
 * to inspect. Selection ownership (multi-select, clipboard) is the selection
 * ticket's concern; this is the minimal read the detail seam needs. [LAW:decomposition]
 */

import { useStores } from '../../stores';
import type { BlockId, PortId } from '../../types';
import type { PortRef } from './type-oracle';

export type EditorSelectionRef =
  | { readonly kind: 'none' }
  | { readonly kind: 'typePreview'; readonly blockType: string }
  | { readonly kind: 'block'; readonly blockId: string }
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'port'; readonly ref: PortRef };

export interface EditorSelection {
  readonly ref: EditorSelectionRef;
  selectBlock(blockId: string): void;
  selectPort(blockId: string, portId: string): void;
}

/**
 * Read the current selection as a neutral ref. Precedence mirrors the V1
 * inspector's: a type preview wins, then a port, then an edge, then a block.
 * [LAW:dataflow-not-control-flow]
 */
export function useEditorSelection(): EditorSelection {
  const { selection } = useStores();
  const ref = toRef(selection.previewType, selection.selectedPort, selection.selectedEdgeId, selection.selectedBlockId);
  return {
    ref,
    selectBlock: (blockId: string) => selection.selectBlock(blockId as BlockId),
    selectPort: (blockId: string, portId: string) =>
      selection.selectPort(blockId as BlockId, portId as PortId),
  };
}

function toRef(
  previewType: string | null,
  selectedPort: { blockId: string; portId: string } | null,
  selectedEdgeId: string | null,
  selectedBlockId: string | null,
): EditorSelectionRef {
  if (previewType) return { kind: 'typePreview', blockType: previewType };
  if (selectedPort) return { kind: 'port', ref: { blockId: selectedPort.blockId, portId: selectedPort.portId } };
  if (selectedEdgeId) return { kind: 'edge', edgeId: selectedEdgeId };
  if (selectedBlockId) return { kind: 'block', blockId: selectedBlockId };
  return { kind: 'none' };
}
