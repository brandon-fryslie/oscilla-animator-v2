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
import type { FrontendResult, FrontendFailure, CycleSummary, FrontendError } from '../compiler/frontend';
import type { NormalizedPatch } from '../compiler/frontend/normalize-indexing';
import type { TypedPatch } from '../compiler/ir/patches';
import type { DefaultSource, PortId } from '../types';
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
  readonly status: 'none' | 'frontendOk' | 'frontendError';

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
 */
export type PortProvenance =
  | { readonly kind: 'userEdge' }
  | { readonly kind: 'defaultSource'; readonly source: DefaultSource }
  | { readonly kind: 'adapter'; readonly adapterType: string }
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
    const portProvenance = this.buildPortProvenance(normalizedPatch);

    this.snapshot = {
      status: 'frontendOk',
      patchRevision,
      portProvenance,
      resolvedPortTypes,
      errors,
      backendReady,
      cycleSummary,
    };
  }

  /**
   * Update snapshot from a FrontendFailure (partial data).
   */
  updateFromFrontendFailure(
    failure: FrontendFailure,
    patchRevision: number,
  ): void {
    if (failure.normalizedPatch) {
      this.rebuildBlockIdMap(failure.normalizedPatch);
    }

    this.snapshot = {
      status: 'frontendError',
      patchRevision,
      portProvenance: failure.normalizedPatch
        ? this.buildPortProvenance(failure.normalizedPatch)
        : new Map(),
      resolvedPortTypes: failure.typedPatch && failure.normalizedPatch
        ? this.buildResolvedPortTypes(failure.typedPatch, failure.normalizedPatch)
        : new Map(),
      errors: failure.errors,
      backendReady: false,
      cycleSummary: null,
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
   */
  private buildPortProvenance(normalizedPatch: NormalizedPatch): ReadonlyMap<string, PortProvenance> {
    const map = new Map<string, PortProvenance>();

    // Build blockId → Block mapping for edge lookup (edges reference blockId)
    const blocksById = new Map<string, typeof normalizedPatch.blocks[number]>();
    for (const block of normalizedPatch.blocks) {
      blocksById.set(block.id as string, block);
    }

    // Iterate original patch edges (which have role information)
    for (const edge of normalizedPatch.patch.edges) {
      if (edge.to.kind !== 'port') continue;

      const targetBlock = blocksById.get(edge.to.blockId);
      if (!targetBlock) continue;

      const targetAddr = getInputAddress(targetBlock, edge.to.slotId as PortId);
      const targetAddrStr = addressToString(targetAddr);

      const role = edge.role;

      if (role.kind === 'default') {
        const sourceBlock = blocksById.get(edge.from.blockId);
        map.set(targetAddrStr, {
          kind: 'defaultSource',
          source: {
            blockType: sourceBlock?.type ?? 'DefaultSource',
            output: edge.from.slotId,
            params: sourceBlock?.params,
          },
        });
      } else if (role.kind === 'adapter') {
        const sourceBlock = blocksById.get(edge.from.blockId);
        map.set(targetAddrStr, {
          kind: 'adapter',
          adapterType: sourceBlock?.type ?? 'Adapter',
        });
      } else if (role.kind === 'user') {
        map.set(targetAddrStr, { kind: 'userEdge' });
      } else {
        map.set(targetAddrStr, { kind: 'unresolved' });
      }
    }

    return map;
  }
}
