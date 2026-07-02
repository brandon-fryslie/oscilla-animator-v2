/**
 * src/ui/nativeEditor/modulationTable.ts
 *
 * The Modulation Table's pure model: the authored patch viewed as a routing grid.
 * Rows are input ports (things that receive a value), columns are output ports
 * (things that produce one, one per source block under the editor's sole-output
 * model), and each cell is the ROUTE at that crossing — or an empty, possibly-
 * connectable slot.
 *
 * A route is not always a single edge. A scalar route may pass through transform
 * blocks (Scale/Offset/Clamp) between its source and the input it feeds. Those
 * transform blocks are ROUTE-INTERNAL: they never appear as their own grid row or
 * column (that would multiply the grid and defeat the compact-spreadsheet purpose).
 * Instead the table traces each input back through any transforms to the ultimate
 * non-transform source, and the cell at (input, source) carries the transform
 * chain, edited in place. A transform is identified by its typed catalog category
 * (`'transform'`), never a name heuristic. [LAW:types-are-the-program]
 *
 * This is the SAME data the graph view reads (`PillarPatchStore.patch`); the table
 * is a second projection of it, never a second copy. A cell interaction resolves
 * to a description of a store operation (`ModulationAction`); the React view
 * performs it against the store. So a table edit and a graph edit are literally the
 * same mutation on the same source of truth.
 *
 * [LAW:one-source-of-truth] The grid is derived from the authored patch on every
 *   read; it stores no connection truth of its own. A transform's parameters live
 *   in its block config, not duplicated on the route.
 * [LAW:effects-at-boundaries] This module is pure — it computes the grid and the
 *   action to take, but never touches the store; the view applies the action.
 * [LAW:dataflow-not-control-flow] A cell carries its route (or null) and whether it
 *   is connectable as VALUES; the action builders map those values to one of a
 *   fixed set of operations rather than the view branching on block type or wiring.
 */

import {
  compareScenePorts,
  type SceneCatalogConfigField,
  type SceneConfigControl,
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

/** One editable parameter of a transform block on a route. */
export interface RouteTransformField {
  readonly key: string;
  readonly label: string;
  readonly control: SceneConfigControl;
  readonly value: unknown;
}

/**
 * A transform block sitting on a route, with exactly what the in-cell editor needs
 * to show and edit it. Its parameters are read from the block's config — the one
 * source of truth — never copied onto the route.
 */
export interface RouteTransform {
  readonly blockId: string;
  readonly type: string;
  readonly displayName: string;
  readonly fields: readonly RouteTransformField[];
}

/**
 * The route feeding one input, traced back through any transform blocks to its
 * ultimate non-transform source. `transforms` is in source→input order (empty for
 * a direct wire). `inputEdgeId` is the edge into the row's own input — the last hop
 * — which disconnecting the route must remove alongside the transform blocks.
 */
export interface ModulationRoute {
  readonly sourceBlockId: string;
  readonly transforms: readonly RouteTransform[];
  readonly inputEdgeId: string;
}

/**
 * One crossing of a row (input) and a column (output). `route` is the traced route
 * whose source is this column, or null when no route from this column reaches this
 * input. `connectable` says whether an empty slot would accept a wire (compatible
 * kinds, not the block feeding itself). An existing `route` is shown regardless of
 * `connectable`: a persisted patch can hold a type-invalid route, and the table
 * must let the user see and delete it.
 */
export interface ModulationCell {
  readonly route: ModulationRoute | null;
  readonly connectable: boolean;
}

/** The whole grid: input rows, output columns, and the cell at every crossing. */
export interface ModulationTableModel {
  readonly rows: readonly ModulationPortRef[];
  readonly columns: readonly ModulationPortRef[];
  /** `cells[rowIndex][colIndex]`. */
  readonly cells: readonly (readonly ModulationCell[])[];
}

/**
 * The store operation an interaction performs. `connect`/`disconnect` are the
 * primary cell click; the rest are the in-cell transform-chain affordance on an
 * occupied cell. Each carries exactly the block/edge ids the store needs, computed
 * purely from the route so the view stays effect-free. [LAW:effects-at-boundaries]
 */
export type ModulationAction =
  | { readonly kind: 'connect'; readonly source: string; readonly target: string; readonly inputSlot: string }
  // Tear down a whole route: remove its transform blocks (each cascades its edges)
  // and the edge into the input. A direct route is `transformBlockIds: []`.
  | {
      readonly kind: 'disconnect';
      readonly inputEdgeId: string;
      readonly transformBlockIds: readonly string[];
    }
  // Insert a new transform at the input end of an existing route: the block now
  // feeding `target.inputSlot` (`upstreamBlockId`) is rewired through the new block.
  | {
      readonly kind: 'appendTransform';
      readonly transformType: string;
      readonly upstreamBlockId: string;
      readonly target: string;
      readonly inputSlot: string;
    }
  // Splice a transform out of a route, bridging its upstream to its downstream.
  | {
      readonly kind: 'removeTransform';
      readonly blockId: string;
      readonly upstreamBlockId: string;
      readonly downstreamTarget: string;
      readonly downstreamInputSlot: string;
    }
  // Retune one transform parameter.
  | { readonly kind: 'setTransformConfig'; readonly blockId: string; readonly key: string; readonly value: unknown };

/** A transform type the editor may append to a route. */
export interface TransformPaletteEntry {
  readonly type: string;
  readonly displayName: string;
}

/** The transform blocks the in-cell editor offers, read from the catalog category. */
export function transformPalette(registry: SceneRegistry): readonly TransformPaletteEntry[] {
  return registry.catalog
    .filter((block) => block.category === 'transform')
    .map((block) => ({ type: block.type, displayName: block.displayName }));
}

/**
 * Derive the routing grid from the authored patch. Rows are every input port of
 * every non-transform block; columns are every non-transform block that has exactly
 * one output port (the sole-output model the whole editor assumes). Transform
 * blocks are excluded from both — they are route-internal, shown inside the cells
 * of the routes they sit on, never as their own row or column.
 *
 * [LAW:no-silent-failure] A multi-output block is omitted from the columns, not
 *   collapsed to its first output behind the user's back.
 * [LAW:types-are-the-program] Transform exclusion reads the typed `'transform'`
 *   category, so the grid can never accidentally surface a transform as a route.
 */
export function buildModulationTable(
  patch: PillarPatch,
  registry: SceneRegistry,
): ModulationTableModel {
  const labelOf = (block: PillarBlock): string =>
    registry.get(block.type)?.catalog.displayName ?? block.type;
  const portsOf = (block: PillarBlock) => registry.get(block.type)?.catalog.ports ?? [];
  const isTransform = (block: PillarBlock): boolean =>
    registry.get(block.type)?.catalog.category === 'transform';

  const routableBlocks = patch.blocks.filter((block) => !isTransform(block));

  const rows: ModulationPortRef[] = routableBlocks.flatMap((block) =>
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

  const columns: ModulationPortRef[] = routableBlocks.flatMap((block) => {
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

  // Each input has at most one feeder, so its route is a property of the row; it
  // lands in whichever column matches the traced source. Trace once per row.
  const routeByRow: (ModulationRoute | null)[] = rows.map((row) =>
    traceRoute(patch, registry, row.blockId, row.portId),
  );

  const cells: ModulationCell[][] = rows.map((row, rowIndex) => {
    const route = routeByRow[rowIndex];
    return columns.map((column) => ({
      route: route !== null && route.sourceBlockId === column.blockId ? route : null,
      connectable:
        column.blockId !== row.blockId && kindsConnectable(column.value, row.value),
    }));
  });

  return { rows, columns, cells };
}

/**
 * Trace the route feeding `(inputBlockId, inputPortId)` back through any transform
 * blocks to its ultimate non-transform source. Returns null when the input is
 * unwired, or when the chain dangles at a transform whose own input is unwired (a
 * broken route the compiler surfaces as a diagnostic — the grid, which can only
 * place a route under a source column, shows nothing rather than a phantom source).
 */
function traceRoute(
  patch: PillarPatch,
  registry: SceneRegistry,
  inputBlockId: string,
  inputPortId: string,
): ModulationRoute | null {
  const blockById = (id: string): PillarBlock | undefined =>
    patch.blocks.find((b) => b.id === id);
  const isTransform = (block: PillarBlock): boolean =>
    registry.get(block.type)?.catalog.category === 'transform';

  const transforms: RouteTransform[] = [];
  let target = inputBlockId;
  let slot = inputPortId;
  let inputEdgeId: string | null = null;
  const seen = new Set<string>();

  for (;;) {
    const edge = patch.edges.find((e) => e.target === target && e.inputSlot === slot);
    if (edge === undefined) {
      // Unwired: no route into the row, or a dangling transform chain (which the
      // compiler surfaces). Either way there is no source column to place it under.
      return null;
    }
    if (inputEdgeId === null) inputEdgeId = edge.id;

    const source = blockById(edge.source);
    if (source === undefined || !isTransform(source)) {
      // Reached the ultimate source (or a dangling edge — no route to show).
      return source === undefined
        ? null
        : { sourceBlockId: source.id, transforms, inputEdgeId };
    }

    // A transform on the route. Guard against a cycle before recursing upstream.
    if (seen.has(source.id)) return null;
    seen.add(source.id);
    transforms.unshift(routeTransform(registry, source));

    const upstreamSlot = soleInputPortId(registry, source.type);
    if (upstreamSlot === null) return null; // not a linear transform — cannot trace
    target = source.id;
    slot = upstreamSlot;
  }
}

/** Build the editor-facing view of a transform block from its config + catalog. */
function routeTransform(registry: SceneRegistry, block: PillarBlock): RouteTransform {
  const catalog = registry.get(block.type)?.catalog;
  const displayName = catalog?.displayName ?? block.type;
  const fields: RouteTransformField[] = (catalog?.configFields ?? []).map(
    (field: SceneCatalogConfigField) => ({
      key: field.key,
      label: field.label,
      control: field.control,
      value: block.config[field.key],
    }),
  );
  return { blockId: block.id, type: block.type, displayName, fields };
}

/** The id of a block type's sole input port, or null if it does not have exactly one. */
export function soleInputPortId(registry: SceneRegistry, blockType: string): string | null {
  const inputs = (registry.get(blockType)?.catalog.ports ?? []).filter(
    (port) => port.direction === 'input',
  );
  return inputs.length === 1 ? inputs[0].id : null;
}

/**
 * The store operation a click on this cell performs, or null when the cell is
 * inert (an empty, type-incompatible crossing). An occupied cell disconnects the
 * whole route — direct wire or transform chain, a route can always be deleted, even
 * a type-invalid one. An empty connectable cell connects a direct route.
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
  if (cell.route !== null) {
    return {
      kind: 'disconnect',
      inputEdgeId: cell.route.inputEdgeId,
      transformBlockIds: cell.route.transforms.map((t) => t.blockId),
    };
  }
  if (cell.connectable) {
    return { kind: 'connect', source: column.blockId, target: row.blockId, inputSlot: row.portId };
  }
  return null;
}

/**
 * Insert a transform at the input end of an existing route: the block currently
 * feeding the input (the last transform, or the source for a direct route) is
 * rewired through the new transform. The application composes `addBlock` +
 * two `addEdge`s; the second replaces the input's feeder (one-per-slot), so the
 * route becomes `… → newTransform → input`.
 */
export function appendTransformAction(
  route: ModulationRoute,
  row: ModulationPortRef,
  transformType: string,
): ModulationAction {
  const upstream =
    route.transforms.length === 0
      ? route.sourceBlockId
      : route.transforms[route.transforms.length - 1].blockId;
  return {
    kind: 'appendTransform',
    transformType,
    upstreamBlockId: upstream,
    target: row.blockId,
    inputSlot: row.portId,
  };
}

/**
 * Splice the transform at `index` out of a route, bridging its upstream to its
 * downstream so the route stays connected. The downstream is the next transform's
 * input, or the row's input for the last transform.
 */
export function removeTransformAction(
  route: ModulationRoute,
  row: ModulationPortRef,
  registry: SceneRegistry,
  index: number,
): ModulationAction {
  const transform = route.transforms[index];
  const upstreamBlockId =
    index === 0 ? route.sourceBlockId : route.transforms[index - 1].blockId;
  const next = route.transforms[index + 1];
  const downstreamTarget = next === undefined ? row.blockId : next.blockId;
  const downstreamInputSlot =
    next === undefined ? row.portId : (soleInputPortId(registry, next.type) ?? '');
  return {
    kind: 'removeTransform',
    blockId: transform.blockId,
    upstreamBlockId,
    downstreamTarget,
    downstreamInputSlot,
  };
}

/** Retune one parameter of a transform on a route. */
export function setTransformConfigAction(
  blockId: string,
  key: string,
  value: unknown,
): ModulationAction {
  return { kind: 'setTransformConfig', blockId, key, value };
}
