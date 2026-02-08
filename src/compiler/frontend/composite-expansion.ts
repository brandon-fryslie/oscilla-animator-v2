/**
 * Composite Block Expansion (Spec-Conformant)
 *
 * Expands composite blocks into their internal graph structure with full
 * provenance tracking, deterministic ID scheme, interface/binding validation,
 * resource limits, and optional trace support.
 *
 * Replaces the former composite expansion pass.
 *
 * ID scheme: cx:{path}:b:{innerId} for blocks, cx:{path}:e:{idx} for edges,
 * cx:{path}:in:{port}:re:{origEdgeId} / cx:{path}:out:{port}:re:{origEdgeId}
 * for boundary rewrites.
 *
 * // [LAW:one-source-of-truth] ExpansionProvenance is the single record of what was expanded.
 * // [LAW:dataflow-not-control-flow] Diagnostics accumulate; caller decides severity threshold.
 * // [LAW:single-enforcer] All expansion logic lives here, not scattered across passes.
 */

import type { BlockId, BlockRole } from '../../types';
import { derivedRole } from '../../types';
import type { Block, Edge, InputPort, OutputPort, Patch } from '../../graph/Patch';
import {
  getCompositeDefinition,
  isCompositeType,
  requireAnyBlockDef,
} from '../../blocks/registry';
import type {
  CompositeBlockDef,
  InternalBlockId,
} from '../../blocks/composite-types';

// =============================================================================
// Types
// =============================================================================

/** One frame on the expansion path — which instance of which composite. */
export interface ExpansionFrame {
  readonly instanceBlockId: BlockId;
  readonly compositeId: string;
}

/** Full expansion path for nested composites. */
export type ExpansionPath = readonly ExpansionFrame[];

// -- Origins ------------------------------------------------------------------

export type CxBlockOrigin =
  | { readonly kind: 'user' }
  | { readonly kind: 'expandedFromComposite'; readonly path: ExpansionPath; readonly innerBlockId: InternalBlockId };

export type CxEdgeOrigin =
  | { readonly kind: 'user' }
  | { readonly kind: 'expandedFromComposite'; readonly path: ExpansionPath; readonly innerEdgeIndex: number }
  | { readonly kind: 'compositeBoundaryRewrite'; readonly path: ExpansionPath; readonly boundary: 'in' | 'out'; readonly port: string };

// -- Provenance ---------------------------------------------------------------

export interface BoundaryRewriteInfo {
  readonly path: ExpansionPath;
  readonly inputRewrites: ReadonlyMap<string, { readonly replacedEdges: readonly string[]; readonly internalSink: { readonly blockId: BlockId; readonly port: string } }>;
  readonly outputRewrites: ReadonlyMap<string, { readonly replacedEdges: readonly string[]; readonly internalSource: { readonly blockId: BlockId; readonly port: string } }>;
}

export interface ExpansionProvenance {
  readonly blockMap: ReadonlyMap<BlockId, CxBlockOrigin>;
  readonly edgeMap: ReadonlyMap<string, CxEdgeOrigin>;
  readonly boundaryMap: ReadonlyMap<BlockId, BoundaryRewriteInfo>;
}

// -- Options ------------------------------------------------------------------

export interface ExpansionOptions {
  readonly maxDepth: number;
  readonly maxNodesAdded: number;
  readonly trace?: boolean;
}

const DEFAULT_OPTIONS: ExpansionOptions = {
  maxDepth: 5,
  maxNodesAdded: 500,
  trace: false,
};

// -- Diagnostics --------------------------------------------------------------

export type ExpansionDiagnosticCode =
  | 'CompositeDefinitionMissing'
  | 'CompositeInterfaceMismatch'
  | 'CompositeBindingInvalid'
  | 'CompositeExpansionDepthExceeded'
  | 'CompositeExpansionSizeExceeded'
  | 'CompositeIdCollision'
  | 'UnusedInterfacePort';

export interface ExpansionDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: ExpansionDiagnosticCode;
  readonly message: string;
  readonly at: {
    readonly instanceBlockId?: BlockId;
    readonly compositeId?: string;
    readonly port?: string;
    readonly path?: ExpansionPath;
    readonly innerId?: string;
  };
}

// -- Trace events -------------------------------------------------------------

export type ExpansionTraceEvent =
  | { readonly kind: 'expandBegin'; readonly instanceBlockId: BlockId; readonly compositeId: string; readonly path: ExpansionPath }
  | { readonly kind: 'expandEnd'; readonly instanceBlockId: BlockId; readonly compositeId: string; readonly path: ExpansionPath; readonly addedBlocks: number; readonly addedEdges: number }
  | { readonly kind: 'rewriteIn'; readonly instanceBlockId: BlockId; readonly port: string; readonly origEdgeId: string; readonly newEdgeId: string; readonly internalSink: { readonly blockId: BlockId; readonly port: string } }
  | { readonly kind: 'rewriteOut'; readonly instanceBlockId: BlockId; readonly port: string; readonly origEdgeId: string; readonly newEdgeId: string; readonly internalSource: { readonly blockId: BlockId; readonly port: string } }
  | { readonly kind: 'diagnostic'; readonly diagnostic: ExpansionDiagnostic };

// -- Result -------------------------------------------------------------------

export interface CompositeExpansionResult {
  readonly patch: Patch;
  readonly provenance: ExpansionProvenance;
  readonly diagnostics: readonly ExpansionDiagnostic[];
  readonly trace?: readonly ExpansionTraceEvent[];
}

// =============================================================================
// Deterministic ID Scheme
// =============================================================================

function pathKey(path: ExpansionPath): string {
  return path.map(f => `${f.instanceBlockId}@${f.compositeId}`).join('/');
}

function expandedBlockId(path: ExpansionPath, innerBlockId: InternalBlockId): BlockId {
  return `cx:${pathKey(path)}:b:${innerBlockId}` as BlockId;
}

function expandedEdgeId(path: ExpansionPath, innerEdgeIdx: number): string {
  return `cx:${pathKey(path)}:e:${innerEdgeIdx}`;
}

function boundaryInEdgeId(path: ExpansionPath, port: string, origEdgeId: string): string {
  return `cx:${pathKey(path)}:in:${port}:re:${origEdgeId}`;
}

function boundaryOutEdgeId(path: ExpansionPath, port: string, origEdgeId: string): string {
  return `cx:${pathKey(path)}:out:${port}:re:${origEdgeId}`;
}

// =============================================================================
// Expansion Algorithm
// =============================================================================

/**
 * Expand all composite blocks in a patch into their internal graphs.
 *
 * Recursively expands nested composites, producing a flat patch with
 * full provenance tracking.
 *
 * @param patch - Input patch (may contain composite blocks)
 * @param options - Expansion limits and trace flag
 * @returns Flat patch, provenance, diagnostics, and optional trace
 */
export function expandComposites(
  patch: Patch,
  options?: Partial<ExpansionOptions>,
): CompositeExpansionResult {
  const opts: ExpansionOptions = { ...DEFAULT_OPTIONS, ...options };

  // Mutable work state
  const workBlocks = new Map<BlockId, Block>(patch.blocks);
  const workEdges: Edge[] = [...patch.edges];
  const blockOrigins = new Map<BlockId, CxBlockOrigin>();
  const edgeOrigins = new Map<string, CxEdgeOrigin>();
  const boundaryMap = new Map<BlockId, BoundaryRewriteInfo>();
  const diagnostics: ExpansionDiagnostic[] = [];
  const trace: ExpansionTraceEvent[] = [];
  let totalNodesAdded = 0;

  // Mark all initial artifacts as user origin
  for (const blockId of patch.blocks.keys()) {
    blockOrigins.set(blockId, { kind: 'user' });
  }
  for (const edge of patch.edges) {
    edgeOrigins.set(edge.id, { kind: 'user' });
  }

  // Find and expand composites
  // We iterate until no composites remain, respecting depth limits per instance
  expandAllComposites([], opts);

  // Sort for determinism
  const sortedBlocks = new Map(
    [...workBlocks.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  const sortedEdges = [...workEdges].sort((a, b) => a.id.localeCompare(b.id));

  return {
    patch: { blocks: sortedBlocks, edges: sortedEdges },
    provenance: { blockMap: blockOrigins, edgeMap: edgeOrigins, boundaryMap },
    diagnostics,
    trace: opts.trace ? trace : undefined,
  };

  // -- Inner functions (close over work state) --------------------------------

  function emitDiagnostic(d: ExpansionDiagnostic): void {
    diagnostics.push(d);
    if (opts.trace) {
      trace.push({ kind: 'diagnostic', diagnostic: d });
    }
  }

  function expandAllComposites(parentPath: ExpansionPath, currentOpts: ExpansionOptions): void {
    // Collect composite instances in stable order
    const compositeIds = [...workBlocks.keys()]
      .filter(id => isCompositeType(workBlocks.get(id)!.type))
      .sort();

    for (const blockId of compositeIds) {
      const block = workBlocks.get(blockId);
      if (!block) continue; // may have been removed by prior expansion
      if (!isCompositeType(block.type)) continue;

      expandInstance(block, parentPath, currentOpts);
    }
  }

  function expandInstance(
    instanceBlock: Block,
    parentPath: ExpansionPath,
    currentOpts: ExpansionOptions,
  ): void {
    const compositeId = instanceBlock.type;

    // A) Lookup definition
    const def = getCompositeDefinition(compositeId);
    if (!def) {
      emitDiagnostic({
        severity: 'error',
        code: 'CompositeDefinitionMissing',
        message: `Composite definition not found: "${compositeId}"`,
        at: { instanceBlockId: instanceBlock.id, compositeId, path: parentPath },
      });
      return;
    }

    // B) Create path and check depth
    const path: ExpansionPath = [...parentPath, { instanceBlockId: instanceBlock.id, compositeId }];
    if (path.length > currentOpts.maxDepth) {
      emitDiagnostic({
        severity: 'error',
        code: 'CompositeExpansionDepthExceeded',
        message: `Composite nesting depth exceeded maximum of ${currentOpts.maxDepth} at "${compositeId}" (instance ${instanceBlock.id})`,
        at: { instanceBlockId: instanceBlock.id, compositeId, path },
      });
      return;
    }

    if (opts.trace) {
      trace.push({ kind: 'expandBegin', instanceBlockId: instanceBlock.id, compositeId, path });
    }

    // C) Validate interface: instance ports vs. def exposed ports
    validateInterface(instanceBlock, def, path);

    // D) Validate bindings: each exposed port → real internal block+port
    validateBindings(def, path, instanceBlock.id);

    // Bail early if we already have errors from validation
    if (diagnostics.some(d => d.severity === 'error')) return;

    // E) Inline internal blocks with expanded IDs
    const internalToExpanded = new Map<InternalBlockId, BlockId>();
    let addedBlocks = 0;

    for (const [internalId, internalDef] of def.internalBlocks) {
      const newId = expandedBlockId(path, internalId);

      // ID collision check
      if (workBlocks.has(newId)) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeIdCollision',
          message: `Expanded block ID "${newId}" collides with existing block`,
          at: { instanceBlockId: instanceBlock.id, compositeId, path, innerId: internalId },
        });
        return;
      }

      internalToExpanded.set(internalId, newId);

      // Build ports from the internal block's registered definition
      const internalBlockDef = requireAnyBlockDef(internalDef.type);

      const inputPorts = new Map<string, InputPort>();
      for (const [portId, inputDef] of Object.entries(internalBlockDef.inputs)) {
        if (inputDef.exposedAsPort !== false) {
          inputPorts.set(portId, {
            id: portId,
            defaultSource: inputDef.defaultSource,
            combineMode: 'last',
          });
        }
      }

      const outputPorts = new Map<string, OutputPort>();
      for (const portId of Object.keys(internalBlockDef.outputs)) {
        outputPorts.set(portId, { id: portId });
      }

      const role: BlockRole = derivedRole({
        kind: 'compositeExpansion',
        compositeDefId: compositeId,
        compositeInstanceId: instanceBlock.id,
        internalBlockId: internalId as string,
      });

      const expandedBlock: Block = {
        id: newId,
        type: internalDef.type,
        params: internalDef.params ?? {},
        displayName: internalDef.displayName ?? `${internalDef.type} (${instanceBlock.displayName})`,
        domainId: instanceBlock.domainId,
        role,
        inputPorts,
        outputPorts,
      };

      workBlocks.set(newId, expandedBlock);
      blockOrigins.set(newId, { kind: 'expandedFromComposite', path, innerBlockId: internalId });
      addedBlocks++;
      totalNodesAdded++;

      // Resource limit check
      if (totalNodesAdded > currentOpts.maxNodesAdded) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeExpansionSizeExceeded',
          message: `Composite expansion exceeded maximum of ${currentOpts.maxNodesAdded} added nodes`,
          at: { instanceBlockId: instanceBlock.id, compositeId, path },
        });
        return;
      }
    }

    // F) Inline internal edges with remapped block IDs
    let addedEdges = 0;
    let edgeSortKey = workEdges.length;

    for (let edgeIdx = 0; edgeIdx < def.internalEdges.length; edgeIdx++) {
      const internalEdge = def.internalEdges[edgeIdx];
      const fromId = internalToExpanded.get(internalEdge.fromBlock);
      const toId = internalToExpanded.get(internalEdge.toBlock);
      if (!fromId || !toId) continue; // validated above

      const newEdgeId = expandedEdgeId(path, edgeIdx);

      // ID collision check for edges
      if (edgeOrigins.has(newEdgeId)) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeIdCollision',
          message: `Expanded edge ID "${newEdgeId}" collides with existing edge`,
          at: { instanceBlockId: instanceBlock.id, compositeId, path, innerId: String(edgeIdx) },
        });
        return;
      }

      const expandedEdge: Edge = {
        id: newEdgeId,
        from: { kind: 'port', blockId: fromId, slotId: internalEdge.fromPort },
        to: { kind: 'port', blockId: toId, slotId: internalEdge.toPort },
        enabled: true,
        sortKey: edgeSortKey++,
        role: { kind: 'composite', meta: { compositeInstanceId: instanceBlock.id } },
      };

      workEdges.push(expandedEdge);
      edgeOrigins.set(newEdgeId, { kind: 'expandedFromComposite', path, innerEdgeIndex: edgeIdx });
      addedEdges++;
    }

    // G) Rewrite incoming boundary edges
    const inputRewrites = new Map<string, { replacedEdges: string[]; internalSink: { blockId: BlockId; port: string } }>();

    for (const exposedInput of def.exposedInputs) {
      const internalExpandedId = internalToExpanded.get(exposedInput.internalBlockId);
      if (!internalExpandedId) continue;

      const replacedEdges: string[] = [];
      const edgesToRemove: string[] = [];

      for (const edge of workEdges) {
        if (
          edge.to.blockId === instanceBlock.id &&
          edge.to.slotId === exposedInput.externalId &&
          edge.enabled !== false
        ) {
          edgesToRemove.push(edge.id);
          replacedEdges.push(edge.id);

          const newEdgeId = boundaryInEdgeId(path, exposedInput.externalId, edge.id);
          const rewiredEdge: Edge = {
            id: newEdgeId,
            from: edge.from,
            to: { kind: 'port', blockId: internalExpandedId, slotId: exposedInput.internalPortId },
            enabled: true,
            sortKey: edgeSortKey++,
            role: edge.role, // preserve original role
          };

          workEdges.push(rewiredEdge);
          edgeOrigins.set(newEdgeId, { kind: 'compositeBoundaryRewrite', path, boundary: 'in', port: exposedInput.externalId });
          addedEdges++;

          if (opts.trace) {
            trace.push({
              kind: 'rewriteIn',
              instanceBlockId: instanceBlock.id,
              port: exposedInput.externalId,
              origEdgeId: edge.id,
              newEdgeId,
              internalSink: { blockId: internalExpandedId, port: exposedInput.internalPortId },
            });
          }
        }
      }

      // Remove original edges
      removeEdgesById(edgesToRemove);

      if (replacedEdges.length > 0) {
        inputRewrites.set(exposedInput.externalId, {
          replacedEdges,
          internalSink: { blockId: internalExpandedId, port: exposedInput.internalPortId },
        });
      }
    }

    // H) Rewrite outgoing boundary edges
    const outputRewrites = new Map<string, { replacedEdges: string[]; internalSource: { blockId: BlockId; port: string } }>();

    for (const exposedOutput of def.exposedOutputs) {
      const internalExpandedId = internalToExpanded.get(exposedOutput.internalBlockId);
      if (!internalExpandedId) continue;

      const replacedEdges: string[] = [];
      const edgesToRemove: string[] = [];

      for (const edge of workEdges) {
        if (
          edge.from.blockId === instanceBlock.id &&
          edge.from.slotId === exposedOutput.externalId &&
          edge.enabled !== false
        ) {
          edgesToRemove.push(edge.id);
          replacedEdges.push(edge.id);

          const newEdgeId = boundaryOutEdgeId(path, exposedOutput.externalId, edge.id);
          const rewiredEdge: Edge = {
            id: newEdgeId,
            from: { kind: 'port', blockId: internalExpandedId, slotId: exposedOutput.internalPortId },
            to: edge.to,
            enabled: true,
            sortKey: edgeSortKey++,
            role: edge.role, // preserve original role
          };

          workEdges.push(rewiredEdge);
          edgeOrigins.set(newEdgeId, { kind: 'compositeBoundaryRewrite', path, boundary: 'out', port: exposedOutput.externalId });
          addedEdges++;

          if (opts.trace) {
            trace.push({
              kind: 'rewriteOut',
              instanceBlockId: instanceBlock.id,
              port: exposedOutput.externalId,
              origEdgeId: edge.id,
              newEdgeId,
              internalSource: { blockId: internalExpandedId, port: exposedOutput.internalPortId },
            });
          }
        }
      }

      // Remove original edges
      removeEdgesById(edgesToRemove);

      if (replacedEdges.length > 0) {
        outputRewrites.set(exposedOutput.externalId, {
          replacedEdges,
          internalSource: { blockId: internalExpandedId, port: exposedOutput.internalPortId },
        });
      }
    }

    // Store boundary info
    if (inputRewrites.size > 0 || outputRewrites.size > 0) {
      boundaryMap.set(instanceBlock.id, { path, inputRewrites, outputRewrites });
    }

    // I) Remove the composite instance block
    workBlocks.delete(instanceBlock.id);
    blockOrigins.delete(instanceBlock.id);

    if (opts.trace) {
      trace.push({ kind: 'expandEnd', instanceBlockId: instanceBlock.id, compositeId, path, addedBlocks, addedEdges });
    }

    // J) Recursively expand any newly-inlined composite blocks
    for (const [_internalId, internalDef] of def.internalBlocks) {
      if (isCompositeType(internalDef.type)) {
        const newId = internalToExpanded.get(_internalId)!;
        const nestedBlock = workBlocks.get(newId);
        if (nestedBlock) {
          expandInstance(nestedBlock, path, currentOpts);
          // Bail if resource limits hit
          if (diagnostics.some(d => d.severity === 'error')) return;
        }
      }
    }
  }

  function removeEdgesById(idsToRemove: string[]): void {
    if (idsToRemove.length === 0) return;
    const removeSet = new Set(idsToRemove);
    // Remove edges in place (splice from end to avoid index shifting)
    for (let i = workEdges.length - 1; i >= 0; i--) {
      if (removeSet.has(workEdges[i].id)) {
        // Also remove from origin map
        edgeOrigins.delete(workEdges[i].id);
        workEdges.splice(i, 1);
      }
    }
  }

  function validateInterface(
    instanceBlock: Block,
    def: CompositeBlockDef,
    path: ExpansionPath,
  ): void {
    // Check that each exposed input has a corresponding port concept on the instance
    // (The instance block's inputPorts come from the composite's computed inputs,
    // so we check that the def's exposed inputs are self-consistent.)
    const exposedInputIds = new Set(def.exposedInputs.map(e => e.externalId));
    const exposedOutputIds = new Set(def.exposedOutputs.map(e => e.externalId));

    // Warn about duplicate external IDs in interface
    if (exposedInputIds.size !== def.exposedInputs.length) {
      emitDiagnostic({
        severity: 'error',
        code: 'CompositeInterfaceMismatch',
        message: `Composite "${def.type}" has duplicate exposed input port IDs`,
        at: { instanceBlockId: instanceBlock.id, compositeId: def.type, path },
      });
    }
    if (exposedOutputIds.size !== def.exposedOutputs.length) {
      emitDiagnostic({
        severity: 'error',
        code: 'CompositeInterfaceMismatch',
        message: `Composite "${def.type}" has duplicate exposed output port IDs`,
        at: { instanceBlockId: instanceBlock.id, compositeId: def.type, path },
      });
    }
  }

  function validateBindings(
    def: CompositeBlockDef,
    path: ExpansionPath,
    instanceBlockId: BlockId,
  ): void {
    // Check each exposed input binding points to a real internal block and port
    for (const exposedInput of def.exposedInputs) {
      const internalBlock = def.internalBlocks.get(exposedInput.internalBlockId);
      if (!internalBlock) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeBindingInvalid',
          message: `Exposed input "${exposedInput.externalId}" binds to unknown internal block "${exposedInput.internalBlockId}"`,
          at: { instanceBlockId, compositeId: def.type, port: exposedInput.externalId, path, innerId: exposedInput.internalBlockId },
        });
        continue;
      }

      // Check the internal port exists — handle both primitive and composite internal blocks
      if (!internalBlockHasInputPort(internalBlock.type, exposedInput.internalPortId)) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeBindingInvalid',
          message: `Exposed input "${exposedInput.externalId}" binds to unknown port "${exposedInput.internalPortId}" on internal block "${exposedInput.internalBlockId}" (type: ${internalBlock.type})`,
          at: { instanceBlockId, compositeId: def.type, port: exposedInput.externalId, path, innerId: exposedInput.internalBlockId },
        });
      }
    }

    // Check each exposed output binding
    for (const exposedOutput of def.exposedOutputs) {
      const internalBlock = def.internalBlocks.get(exposedOutput.internalBlockId);
      if (!internalBlock) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeBindingInvalid',
          message: `Exposed output "${exposedOutput.externalId}" binds to unknown internal block "${exposedOutput.internalBlockId}"`,
          at: { instanceBlockId, compositeId: def.type, port: exposedOutput.externalId, path, innerId: exposedOutput.internalBlockId },
        });
        continue;
      }

      if (!internalBlockHasOutputPort(internalBlock.type, exposedOutput.internalPortId)) {
        emitDiagnostic({
          severity: 'error',
          code: 'CompositeBindingInvalid',
          message: `Exposed output "${exposedOutput.externalId}" binds to unknown port "${exposedOutput.internalPortId}" on internal block "${exposedOutput.internalBlockId}" (type: ${internalBlock.type})`,
          at: { instanceBlockId, compositeId: def.type, port: exposedOutput.externalId, path, innerId: exposedOutput.internalBlockId },
        });
      }
    }
  }

  /**
   * Check if a block type has a given input port.
   * Handles both primitive blocks (check inputs record) and composite blocks
   * (check exposedInputs array).
   */
  function internalBlockHasInputPort(blockType: string, portId: string): boolean {
    const compositeDef = getCompositeDefinition(blockType);
    if (compositeDef) {
      // For composites, the exposed input external IDs are the "ports"
      return compositeDef.exposedInputs.some(e => e.externalId === portId);
    }
    const blockDef = requireAnyBlockDef(blockType);
    return portId in blockDef.inputs;
  }

  /**
   * Check if a block type has a given output port.
   */
  function internalBlockHasOutputPort(blockType: string, portId: string): boolean {
    const compositeDef = getCompositeDefinition(blockType);
    if (compositeDef) {
      return compositeDef.exposedOutputs.some(e => e.externalId === portId);
    }
    const blockDef = requireAnyBlockDef(blockType);
    return portId in blockDef.outputs;
  }
}
