/**
 * src/ui/nativeEditor/modulationTable.ts
 *
 * The Modulation Table's pure model: the authored patch viewed as a routing
 * grid. Rows are input ports (things that receive a value), columns are output
 * ports (things that produce one, one per source block under the editor's
 * sole-output model), and each cell is the connection at that crossing — or an
 * empty, possibly-connectable slot.
 *
 * This is the SAME data the graph view reads (`PillarPatchStore.patch`); the
 * table is a second projection of it, never a second copy. A cell click resolves
 * to a description of a store operation (`ModulationAction`); the React view
 * performs it against the store. So a table edit and a graph edit are literally
 * the same mutation on the same source of truth.
 *
 * [LAW:one-source-of-truth] The grid is derived from the authored patch on every
 *   read; it stores no connection truth of its own.
 * [LAW:effects-at-boundaries] This module is pure — it computes the grid and the
 *   action to take, but never touches the store; the view applies the action.
 * [LAW:dataflow-not-control-flow] A cell carries its edge (or null) and whether it
 *   is connectable as VALUES; `cellAction` maps those values to one of a fixed set
 *   of operations rather than the view branching on block type or wiring state.
 */

import {
  compareScenePorts,
  type SceneRegistry,
  type SceneValueKind,
} from '../../pillars/scene';
import type { PillarBlock, PillarEdge, PillarPatch } from '../../pillars/types';

/**
 * Whether a value produced with kind `from` may feed a port of kind `to` as a
 * route the editor OFFERS. This is the single owner of that policy: both the
 * graph's per-port connection picker and this table read it, so the two views
 * can never disagree on which routes are legal. An adapter-bridgeable pair
 * (`adaptationNeeded`) is deliberately not offered here — only a direct match is.
 *
 * [LAW:single-enforcer] One predicate decides "is this route offerable".
 */
export function kindsConnectable(from: SceneValueKind, to: SceneValueKind): boolean {
  return compareScenePorts(from, to).kind === 'compatible';
}

/** One port of one block — a row (an input) or a column (an output). */
export interface ModulationPortRef {
  readonly blockId: string;
  readonly blockLabel: string;
  readonly portId: string;
  readonly portLabel: string;
  readonly value: SceneValueKind;
}

/**
 * One crossing of a row (input) and a column (output). `edge` is the connection
 * there, or null when the slot is empty. `connectable` says whether an empty slot
 * would accept a wire (compatible kinds, not the block feeding itself). An
 * existing `edge` is shown regardless of `connectable`: a persisted patch can hold
 * a type-invalid route, and the table must let the user see and delete it.
 */
export interface ModulationCell {
  readonly edge: PillarEdge | null;
  readonly connectable: boolean;
}

/** The whole grid: input rows, output columns, and the cell at every crossing. */
export interface ModulationTableModel {
  readonly rows: readonly ModulationPortRef[];
  readonly columns: readonly ModulationPortRef[];
  /** `cells[rowIndex][colIndex]`. */
  readonly cells: readonly (readonly ModulationCell[])[];
}

/** The store operation a cell click performs. */
export type ModulationAction =
  | { readonly kind: 'connect'; readonly source: string; readonly target: string; readonly inputSlot: string }
  | { readonly kind: 'disconnect'; readonly edgeId: string };

/**
 * Derive the routing grid from the authored patch. Rows are every input port of
 * every block; columns are every block that has exactly one output port (the
 * sole-output model the whole editor assumes — a zero-output sink is no column, a
 * multi-output block is skipped rather than silently anchored to one output).
 *
 * [LAW:no-silent-failure] A multi-output block is omitted from the columns, not
 *   collapsed to its first output behind the user's back.
 */
export function buildModulationTable(
  patch: PillarPatch,
  registry: SceneRegistry,
): ModulationTableModel {
  const labelOf = (block: PillarBlock): string =>
    registry.get(block.type)?.catalog.displayName ?? block.type;
  const portsOf = (block: PillarBlock) => registry.get(block.type)?.catalog.ports ?? [];

  const rows: ModulationPortRef[] = patch.blocks.flatMap((block) =>
    portsOf(block)
      .filter((port) => port.direction === 'input')
      .map((port) => ({
        blockId: block.id,
        blockLabel: labelOf(block),
        portId: port.id,
        portLabel: port.label,
        value: port.value,
      })),
  );

  const columns: ModulationPortRef[] = patch.blocks.flatMap((block) => {
    const outputs = portsOf(block).filter((port) => port.direction === 'output');
    if (outputs.length !== 1) return [];
    const output = outputs[0];
    return [
      {
        blockId: block.id,
        blockLabel: labelOf(block),
        portId: output.id,
        portLabel: output.label,
        value: output.value,
      },
    ];
  });

  const cells: ModulationCell[][] = rows.map((row) =>
    columns.map((column) => ({
      edge:
        patch.edges.find(
          (edge) =>
            edge.source === column.blockId &&
            edge.target === row.blockId &&
            edge.inputSlot === row.portId,
        ) ?? null,
      connectable:
        column.blockId !== row.blockId && kindsConnectable(column.value, row.value),
    })),
  );

  return { rows, columns, cells };
}

/**
 * The store operation a click on this cell performs, or null when the cell is
 * inert (an empty, type-incompatible crossing). An occupied cell always
 * disconnects — a route can always be deleted, even a type-invalid one. An empty
 * connectable cell connects.
 *
 * Retarget is NOT a third case: connecting into a row that already has a feeder
 * relies on the store replacing the old wire (its one-feeder-per-input-slot
 * invariant), so "move a connection to a different source" is just a connect into
 * an occupied row. [LAW:dataflow-not-control-flow]
 */
export function cellAction(
  cell: ModulationCell,
  row: ModulationPortRef,
  column: ModulationPortRef,
): ModulationAction | null {
  if (cell.edge !== null) return { kind: 'disconnect', edgeId: cell.edge.id };
  if (cell.connectable) {
    return { kind: 'connect', source: column.blockId, target: row.blockId, inputSlot: row.portId };
  }
  return null;
}
