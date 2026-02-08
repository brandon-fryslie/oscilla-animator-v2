/**
 * FrontendResultStore - UI Contract for Frontend Compilation Results
 *
 * Stores the FrontendSnapshot (a stable UI projection of FrontendResult).
 * Provides canonical-address-based queries for port provenance and resolved types.
 *
 * SINGLE SOURCE OF TRUTH for "what does the frontend compiler think about this port?"
 *
 * Design Principles:
 * - FrontendSnapshot is the UI contract (stable, explicit fields)
 * - Canonical addresses are the external query API
 * - Convenience id-based queries for incremental UI migration
 * - Revision coherence: snapshot carries patchRevision
 */

import { makeAutoObservable } from 'mobx';
import type { CanonicalType } from '../core/canonical-types';
import type { FrontendResult, CycleSummary, FrontendError } from '../compiler/frontend';
import type { NormalizedPatch } from '../compiler/frontend/normalize-indexing';
import type { TypedPatch } from '../compiler/ir/patches';
import type { DefaultSource, PortId, TransformStep } from '../types';
import { getBlockAddress, getInputAddress, getOutputAddress } from '../graph/addressing';
import { addressToString } from '../types/canonical-address';

// =============================================================================
// FrontendSnapshot - Stable UI Contract
// =============================================================================

/**
 * Stable UI projection of FrontendResult.
 * UI depends on this, NOT on FrontendResult (compiler internal).
 *
 * All maps are keyed by canonical address strings (e.g., "v1:blocks.my_circle.inputs.pos").
 */
export interface FrontendSnapshot {
  /** Status of the frontend compilation */
  readonly status: 'none' | 'ready';

  /** Patch revision this snapshot was produced from */
  readonly patchRevision: number;

  /** Per-port effective source provenance, keyed by canonical address string */
  readonly portProvenance: ReadonlyMap<string, PortProvenance>;

  /** Per-port resolved type, keyed by canonical address string */
  readonly resolvedPortTypes: ReadonlyMap<string, CanonicalType>;

  /** Frontend errors (present even in partial results) */
  readonly errors: readonly FrontendError[];

  /** Whether the backend can proceed */
  readonly backendReady: boolean;

  /** Cycle summary for UI (future use) */
  readonly cycleSummary: CycleSummary | null;
}

/**
 * Port provenance - where did this port's value come from?
 *
 * Every resolved variant carries optional type and chain data:
 * - sourceType/targetType: resolved types from TypedPatch (undefined if not available)
 * - chain: ordered list of TransformStep (lenses, then adapter if present)
 */
export type PortProvenance =
  | {
      readonly kind: 'userEdge';
      readonly sourceType: CanonicalType | undefined;
      readonly targetType: CanonicalType | undefined;
      readonly chain: readonly TransformStep[];
    }
  | {
      readonly kind: 'defaultSource';
      readonly source: DefaultSource;
      readonly sourceType: CanonicalType | undefined;
      readonly targetType: CanonicalType | undefined;
      readonly chain: readonly TransformStep[];
    }
  | {
      readonly kind: 'adapter';
      readonly adapterType: string;
      readonly sourceType: CanonicalType | undefined;
      readonly targetType: CanonicalType | undefined;
      readonly chain: readonly TransformStep[];
    }
  | { readonly kind: 'unresolved' };

/**
 * Empty snapshot for initial state (before first compilation).
 */
const EMPTY_SNAPSHOT: FrontendSnapshot = {
  status: 'none',
  patchRevision: -1,
  portProvenance: new Map(),
  resolvedPortTypes: new Map(),
  errors: [],
  backendReady: false,
  cycleSummary: null,
};

// =============================================================================
// FrontendResultStore - MobX Store
// =============================================================================

export class FrontendResultStore {
  /** Observable snapshot */
  snapshot: FrontendSnapshot = EMPTY_SNAPSHOT;

  /** Internal blockId → canonicalName map for id-based convenience queries */
  private blockIdToCanonicalName = new Map<string, string>();

  constructor() {
    makeAutoObservable(this);
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Update snapshot from a successful FrontendResult.
   *
   * Builds the canonical address index by translating PortKey → canonical address.
   * Extracts provenance from normalized edges by examining edge roles.
   */
  updateFromFrontendResult(
    result: FrontendResult,
    patchRevision: number,
  ): void {
    const { normalizedPatch, typedPatch, cycleSummary, errors, backendReady } = result;

    // Build blockId → canonicalName map
    this.rebuildBlockIdMap(normalizedPatch);

    // Build canonical address maps
    const resolvedPortTypes = this.buildResolvedPortTypes(typedPatch, normalizedPatch);
    const portProvenance = this.buildPortProvenance(normalizedPatch, typedPatch);

    this.snapshot = {
      status: 'ready',
      patchRevision,
      portProvenance,
      resolvedPortTypes,
      errors,
      backendReady,
      cycleSummary,
    };
  }

  /**
   * Clear the snapshot (reset to empty state).
   */
  clear(): void {
    this.snapshot = EMPTY_SNAPSHOT;
  }

  // ===========================================================================
  // Queries (Canonical Address Based)
  // ===========================================================================

  /**
   * Check if a port has a materialized default source.
   *
   * @param canonicalAddr - Canonical address string (e.g., "v1:blocks.my_circle.inputs.pos")
   * @returns true if the port has a default source
   */
  hasDefaultSource(canonicalAddr: string): boolean {
    const prov = this.snapshot.portProvenance.get(canonicalAddr);
    return prov?.kind === 'defaultSource';
  }

  /**
   * Get resolved type for a port.
   *
   * @param canonicalAddr - Canonical address string
   * @returns Resolved CanonicalType, or undefined if not resolved
   */
  getResolvedPortType(canonicalAddr: string): CanonicalType | undefined {
    return this.snapshot.resolvedPortTypes.get(canonicalAddr);
  }

  /**
   * Get provenance for a port.
   *
   * @param canonicalAddr - Canonical address string
   * @returns PortProvenance, or undefined if not known
   */
  getPortProvenance(canonicalAddr: string): PortProvenance | undefined {
    return this.snapshot.portProvenance.get(canonicalAddr);
  }

  /**
   * Get provenance for a port (id-based query).
   *
   * @param blockId - Block ID
   * @param portId - Port ID
   * @param dir - Port direction ('in' or 'out')
   * @returns PortProvenance, or undefined if not known
   */
  getPortProvenanceByIds(blockId: string, portId: string, dir: 'in' | 'out'): PortProvenance | undefined {
    const addr = this.buildCanonicalAddressFromIds(blockId, portId, dir);
    return addr ? this.getPortProvenance(addr) : undefined;
  }

  // ===========================================================================
  // Convenience Queries (BlockId + PortId Based)
  // ===========================================================================

  /**
   * Check if a port has a materialized default source (id-based query).
   *
   * @param blockId - Block ID
   * @param portId - Port ID
   * @returns true if the port has a default source
   */
  hasDefaultSourceByIds(blockId: string, portId: string): boolean {
    const addr = this.buildCanonicalAddressFromIds(blockId, portId, 'in');
    return addr ? this.hasDefaultSource(addr) : false;
  }

  /**
   * Get the DefaultSource descriptor for a port (id-based query).
   *
   * Returns the DefaultSource from provenance if this port has a materialized
   * default source, undefined otherwise.
   */
  getDefaultSourceByIds(blockId: string, portId: string): DefaultSource | undefined {
    const addr = this.buildCanonicalAddressFromIds(blockId, portId, 'in');
    if (!addr) return undefined;
    const prov = this.snapshot.portProvenance.get(addr);
    return prov?.kind === 'defaultSource' ? prov.source : undefined;
  }

  /**
   * Get resolved type for a port (id-based query).
   *
   * @param blockId - Block ID
   * @param portId - Port ID
   * @param dir - Port direction ('in' or 'out')
   * @returns Resolved CanonicalType, or undefined if not resolved
   */
  getResolvedPortTypeByIds(blockId: string, portId: string, dir: 'in' | 'out'): CanonicalType | undefined {
    const addr = this.buildCanonicalAddressFromIds(blockId, portId, dir);
    return addr ? this.getResolvedPortType(addr) : undefined;
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /**
   * Build canonical address from blockId + portId.
   * Uses the blockId→canonicalName map built during updateFromFrontendResult.
   */
  private buildCanonicalAddressFromIds(blockId: string, portId: string, dir: 'in' | 'out'): string | null {
    const canonicalName = this.blockIdToCanonicalName.get(blockId);
    if (!canonicalName) return null;
    if (dir === 'in') {
      return `v1:blocks.${canonicalName}.inputs.${portId}`;
    } else {
      return `v1:blocks.${canonicalName}.outputs.${portId}`;
    }
  }

  /**
   * Build blockId → canonicalName map from NormalizedPatch blocks.
   */
  private rebuildBlockIdMap(normalizedPatch: NormalizedPatch): void {
    this.blockIdToCanonicalName.clear();
    for (const block of normalizedPatch.blocks) {
      const addr = getBlockAddress(block);
      this.blockIdToCanonicalName.set(block.id as string, addr.canonicalName);
    }
  }

  /**
   * Build resolvedPortTypes map from TypedPatch.
   *
   * Translates PortKey (blockIndex:portName:dir) → canonical address.
   */
  private buildResolvedPortTypes(
    typedPatch: TypedPatch,
    normalizedPatch: NormalizedPatch,
  ): ReadonlyMap<string, CanonicalType> {
    const map = new Map<string, CanonicalType>();

    if (!typedPatch.portTypes) {
      return map;
    }

    // Iterate portTypes map (keyed by PortKey = "blockIndex:portName:dir")
    for (const [portKey, type] of typedPatch.portTypes) {
      const [blockIndexStr, portName, dir] = portKey.split(':');
      const blockIndex = parseInt(blockIndexStr, 10);
      const block = normalizedPatch.blocks[blockIndex];

      if (!block) continue;

      // Build canonical address
      const addr = dir === 'in'
        ? getInputAddress(block, portName as PortId)
        : getOutputAddress(block, portName as PortId);

      map.set(addressToString(addr), type);
    }

    return map;
  }

  /**
   * Build portProvenance map from NormalizedPatch.
   *
   * Uses the original patch edges (which have role information) to determine provenance.
   * When typedPatch is available, enriches with resolved types and transform chain.
   */
  private buildPortProvenance(
    normalizedPatch: NormalizedPatch,
    typedPatch: TypedPatch | null,
  ): ReadonlyMap<string, PortProvenance> {
    const map = new Map<string, PortProvenance>();

    // Build blockId → Block mapping for edge lookup (edges reference blockId)
    const blocksById = new Map<string, typeof normalizedPatch.blocks[number]>();
    for (const block of normalizedPatch.blocks) {
      blocksById.set(block.id as string, block);
    }

    // Helper to resolve a port type from TypedPatch
    const resolvePortType = (blockId: string, portName: string, dir: 'in' | 'out'): CanonicalType | undefined => {
      if (!typedPatch?.portTypes) return undefined;
      const idx = normalizedPatch.blockIndex.get(blockId as any);
      if (idx === undefined) return undefined;
      const key = `${idx}:${portName}:${dir}`;
      return typedPatch.portTypes.get(key as any);
    };

    // Helper to build transform chain for an edge.
    // Walks normalized edges from the original source to the final target,
    // collecting intermediate adapter/lens blocks.
    const buildChain = (sourceBlockId: string, sourcePortId: string, targetBlockId: string, targetPortId: string): TransformStep[] => {
      if (!typedPatch) return [];

      const chain: TransformStep[] = [];

      // Look through normalized patch edges for adapter/lens blocks between source and target.
      // These blocks were inserted by normalization (pass2Adapters) and have role.kind === 'derived'
      // with meta.kind === 'adapter'. We walk the edge chain:
      // source.out → [lens1.in, lens1.out → lens2.in, lens2.out → ...] → target.in
      //
      // Strategy: follow the path from source output through any intermediate blocks.
      // Build an adjacency map from the normalized patch's original edges (which include lens/adapter edges).
      const normalizedEdges = normalizedPatch.patch.edges;

      // Find the chain by tracing from sourceBlockId.sourcePortId to targetBlockId.targetPortId
      // through intermediate adapter/lens blocks.
      let currentBlockId = sourceBlockId;
      let currentPortId = sourcePortId;
      const visited = new Set<string>();
      const MAX_CHAIN_DEPTH = 10;

      for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
        // Find edge from current block/port
        const nextEdge = normalizedEdges.find(e =>
          e.from.kind === 'port' &&
          e.from.blockId === currentBlockId &&
          e.from.slotId === currentPortId &&
          e.to.kind === 'port' &&
          !visited.has(e.id)
        );

        if (!nextEdge || nextEdge.to.kind !== 'port') break;
        visited.add(nextEdge.id);

        const nextBlockId = nextEdge.to.blockId;
        const nextPortId = nextEdge.to.slotId;

        // If we've reached the target, we're done
        if (nextBlockId === targetBlockId && nextPortId === targetPortId) break;

        // This is an intermediate block (lens or adapter)
        const intermediateBlock = blocksById.get(nextBlockId);
        if (!intermediateBlock) break;

        const inType = resolvePortType(nextBlockId, nextPortId, 'in');

        // Find the output port of the intermediate block
        const outEdge = normalizedEdges.find(e =>
          e.from.kind === 'port' &&
          e.from.blockId === nextBlockId &&
          !visited.has(e.id)
        );

        const outPortId = outEdge?.from.slotId ?? 'out';
        const outType = resolvePortType(nextBlockId, outPortId, 'out');

        // Determine if this is a lens or adapter based on block ID pattern
        const isLens = (nextBlockId as string).startsWith('_lens_');

        if (isLens) {
          chain.push({
            kind: 'lens',
            lens: {
              lensId: intermediateBlock.type,
              params: {},
            },
          });
        } else if (inType && outType) {
          chain.push({
            kind: 'adapter',
            from: inType,
            to: outType,
            adapter: intermediateBlock.type,
          });
        }

        // Continue from the intermediate block's output
        currentBlockId = nextBlockId;
        currentPortId = outPortId;
      }

      return chain;
    };

    // Iterate original patch edges (which have role information)
    for (const edge of normalizedPatch.patch.edges) {
      if (edge.to.kind !== 'port') continue;

      const targetBlock = blocksById.get(edge.to.blockId);
      if (!targetBlock) continue;

      const targetAddr = getInputAddress(targetBlock, edge.to.slotId as PortId);
      const targetAddrStr = addressToString(targetAddr);

      const role = edge.role;

      // Resolve source and target types
      const sourceType = resolvePortType(edge.from.blockId, edge.from.slotId, 'out');
      const targetType = resolvePortType(edge.to.blockId, edge.to.slotId, 'in');

      // Build transform chain
      const chain = buildChain(edge.from.blockId, edge.from.slotId, edge.to.blockId, edge.to.slotId);

      if (role.kind === 'default') {
        const sourceBlock = blocksById.get(edge.from.blockId);
        map.set(targetAddrStr, {
          kind: 'defaultSource',
          source: {
            blockType: sourceBlock?.type ?? 'DefaultSource',
            output: edge.from.slotId,
            params: sourceBlock?.params,
          },
          sourceType,
          targetType,
          chain,
        });
      } else if (role.kind === 'adapter') {
        const sourceBlock = blocksById.get(edge.from.blockId);
        map.set(targetAddrStr, {
          kind: 'adapter',
          adapterType: sourceBlock?.type ?? 'Adapter',
          sourceType,
          targetType,
          chain,
        });
      } else if (role.kind === 'user') {
        map.set(targetAddrStr, {
          kind: 'userEdge',
          sourceType,
          targetType,
          chain,
        });
      } else {
        map.set(targetAddrStr, { kind: 'unresolved' });
      }
    }

    return map;
  }
}
