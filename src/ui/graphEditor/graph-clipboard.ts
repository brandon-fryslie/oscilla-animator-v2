/**
 * graph-clipboard — era-neutral copy / paste / duplicate, expressed once as pure
 * operations over the GraphDataAdapter seam.
 *
 * These operations ask for nothing but the neutral adapter: they read a block's
 * whole authored truth (type, params, displayName, position) through it and
 * re-mint that truth back through it. Because the seam already carries everything
 * needed to recreate a block, BOTH eras (V1 PatchStore, pillar PillarPatchStore)
 * get copy/paste/duplicate from this ONE module — no private variant per era.
 * [LAW:composability] [LAW:one-source-of-truth]
 *
 * The payload is neutral, portable data — the structured form of a clipboard
 * selection. When the patch-dsl text form lands it REPLACES this shape (the
 * clipboard becomes dsl text), it does not grow alongside it. [LAW:one-source-of-truth]
 */

import { runInAction, toJS } from 'mobx';
import type { GraphDataAdapter } from './types';

/**
 * One block captured for the clipboard, in neutral vocabulary. `localId` is the
 * block's id at copy time; it is used only to re-link internal edges within this
 * payload and is never re-used as a graph id — paste re-mints fresh ids.
 */
export interface ClipboardBlock {
  readonly localId: string;
  readonly type: string;
  readonly params: Record<string, unknown>;
  /** Absolute copy-time position; paste applies one uniform offset to all. */
  readonly position: { readonly x: number; readonly y: number };
}

/** An edge internal to the copied selection (both endpoints captured), by localId. */
export interface ClipboardEdge {
  readonly sourceLocalId: string;
  readonly sourcePortId: string;
  readonly targetLocalId: string;
  readonly targetPortId: string;
}

/** A portable selection: some blocks and the edges wholly within them. */
export interface GraphClipboard {
  readonly blocks: readonly ClipboardBlock[];
  readonly edges: readonly ClipboardEdge[];
}

/**
 * Capture the given blocks (and only the edges wholly among them) into a portable
 * payload. Returns null when the selection captures no block, so a caller never
 * stores an empty clipboard. Absolute positions are kept so paste preserves the
 * selection's relative layout with a single uniform offset.
 */
export function copyBlocks(
  adapter: GraphDataAdapter,
  ids: Iterable<string>,
): GraphClipboard | null {
  const selected = new Set<string>();
  for (const id of ids) {
    if (adapter.blocks.has(id)) selected.add(id);
  }
  if (selected.size === 0) return null;

  const blocks: ClipboardBlock[] = [];
  for (const id of selected) {
    const block = adapter.blocks.get(id)!;
    blocks.push({
      localId: id,
      type: block.type,
      // toJS produces an independent plain-JS copy (block.params is a MobX observable),
      // so later edits to the live graph never mutate the payload. [LAW:effects-at-boundaries]
      params: toJS(block.params),
      position: adapter.getBlockPosition(id) ?? { x: 0, y: 0 },
    });
  }

  // Internal edges only: an edge with an endpoint outside the selection has no
  // counterpart to re-link to, so it is not part of what "these blocks" means.
  const edges: ClipboardEdge[] = [];
  for (const edge of adapter.edges) {
    if (!selected.has(edge.sourceBlockId) || !selected.has(edge.targetBlockId)) continue;
    edges.push({
      sourceLocalId: edge.sourceBlockId,
      sourcePortId: edge.sourcePortId,
      targetLocalId: edge.targetBlockId,
      targetPortId: edge.targetPortId,
    });
  }

  return { blocks, edges };
}

/**
 * Re-mint a payload into the graph, offset uniformly from its captured positions,
 * and return the new block ids (for reselecting the pasted result). Params and
 * display name are restored through the adapter's optional capabilities; internal
 * edges are re-wired against the fresh ids.
 *
 * The whole paste runs in ONE mobx action so it lands as a single authored-state
 * change — hence a single undo checkpoint, not one per block. [LAW:no-mode-explosion]
 *
 * Paste is all-or-nothing: a mobx action batches notifications but does NOT roll back
 * on throw, so this compensates by hand — any block added before a failure is removed
 * and the error is rethrown, leaving no orphaned, half-wired blocks. [LAW:no-silent-failure]
 */
export function pasteClipboard(
  adapter: GraphDataAdapter,
  clip: GraphClipboard,
  offset: { readonly dx: number; readonly dy: number },
): string[] {
  return runInAction(() => {
    const localToNew = new Map<string, string>();
    const added: string[] = [];

    try {
      for (const block of clip.blocks) {
        const newId = adapter.addBlock(block.type, {
          x: block.position.x + offset.dx,
          y: block.position.y + offset.dy,
        });
        added.push(newId);
        localToNew.set(block.localId, newId);

        const paramCount = Object.keys(block.params).length;
        if (paramCount > 0) {
          if (adapter.updateBlockParams) {
            adapter.updateBlockParams(newId, structuredClone(block.params));
          } else {
            // The block carries params but this adapter can't set them; the paste
            // cannot be faithful. Surface it loudly rather than dropping the data
            // silently. (Both live adapters implement updateBlockParams, so this is
            // a guard against a future param-less adapter being wired to clipboard.)
            // [LAW:no-silent-failure]
            console.warn(
              `graph-clipboard: pasted '${block.type}' lost ${paramCount} param(s) — ` +
                `this adapter has no updateBlockParams.`,
            );
          }
        }
        // Display name is intentionally NOT restored: the store is the single enforcer
        // of name uniqueness, and a copy's authored name necessarily collides with the
        // still-present source, so the freshly added block keeps the store's unique
        // auto-name rather than us forcing a name only to have it rejected. [LAW:single-enforcer]
      }

      for (const edge of clip.edges) {
        // Every internal edge's endpoints were captured, so both ids resolve; a miss
        // is a real defect, so read them non-optionally and let a bad payload fail loudly.
        const source = requireMapped(localToNew, edge.sourceLocalId);
        const target = requireMapped(localToNew, edge.targetLocalId);
        adapter.addEdge(source, edge.sourcePortId, target, edge.targetPortId);
      }

      return [...localToNew.values()];
    } catch (err) {
      // Undo the blocks added so far (removeBlock also drops their edges) so a failed
      // paste leaves the graph exactly as it found it, then resurface the error.
      for (const id of added) adapter.removeBlock(id);
      throw err;
    }
  });
}

function requireMapped(map: ReadonlyMap<string, string>, localId: string): string {
  const id = map.get(localId);
  if (id === undefined) {
    throw new Error(`graph-clipboard: internal edge references uncaptured block '${localId}'`);
  }
  return id;
}
