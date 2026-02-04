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
import type { Patch } from '../graph/Patch';
import type { BlockId, PortId } from '../types';
import { getInputAddress, getOutputAddress } from '../graph/addressing';
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
  | { readonly kind: 'defaultSource'; readonly sourceBlockType: string }
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

  constructor() {
    makeAutoObservable(this);
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Update snapshot from a FrontendCompileResult.
   *
   * Builds the canonical address index by translating PortKey → canonical address.
   * Extracts provenance from normalized edges by examining edge roles.
   *
   * @param result - Frontend compilation result (ok or error)
   * @param patchRevision - Current patch revision number
   * @param patch - Original patch (for fallback blockId lookup)
   */
  updateFromFrontendResult(
    result: FrontendResult | { errors: readonly FrontendError[]; normalizedPatch?: any; typedPatch?: any },
    patchRevision: number,
    patch: Patch
  ): void {
    // Check if this is a FrontendResult (ok) or FrontendFailure (error)
    const isOk = 'normalizedPatch' in result && 'typedPatch' in result && 'backendReady' in result;

    if (!isOk) {
      // Partial result from error case
      const errorResult = result as { errors: readonly FrontendError[]; normalizedPatch?: any; typedPatch?: any };
      this.snapshot = {
        status: 'frontendError',
        patchRevision,
        portProvenance: new Map(),
        resolvedPortTypes: errorResult.typedPatch
          ? this.buildResolvedPortTypes(errorResult.typedPatch, errorResult.normalizedPatch)
          : new Map(),
        errors: errorResult.errors,
        backendReady: false,
        cycleSummary: null,
      };
      return;
    }

    // Full result from ok case
    const okResult = result as FrontendResult;
    const { normalizedPatch, typedPatch, cycleSummary, errors, backendReady } = okResult;

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
   * Uses the snapshot's internal blockId→canonicalName map if available,
   * otherwise falls back to blockId as canonicalName.
   */
  private buildCanonicalAddressFromIds(blockId: string, portId: string, dir: 'in' | 'out'): string | null {
    // For now, use blockId as canonicalName (fallback).
    // TODO: Build blockId→canonicalName map during updateFromFrontendResult for better lookup.
    const canonicalName = blockId;
    if (dir === 'in') {
      return `v1:blocks.${canonicalName}.inputs.${portId}`;
    } else {
      return `v1:blocks.${canonicalName}.outputs.${portId}`;
    }
  }

  /**
   * Build resolvedPortTypes map from TypedPatch.
   *
   * Translates PortKey (blockIndex:portName:dir) → canonical address.
   */
  private buildResolvedPortTypes(
    typedPatch: any,
    normalizedPatch: any
  ): ReadonlyMap<string, CanonicalType> {
    const map = new Map<string, CanonicalType>();

    if (!typedPatch?.portTypes || !normalizedPatch?.blocks) {
      return map;
    }

    // Build blockIndex → Block mapping
    const blocksByIndex = new Map<number, any>();
    for (let i = 0; i < normalizedPatch.blocks.length; i++) {
      blocksByIndex.set(i, normalizedPatch.blocks[i]);
    }

    // Iterate portTypes map (keyed by PortKey = "blockIndex:portName:dir")
    for (const [portKey, type] of typedPatch.portTypes) {
      const [blockIndexStr, portName, dir] = portKey.split(':');
      const blockIndex = parseInt(blockIndexStr, 10);
      const block = blocksByIndex.get(blockIndex);

      if (!block) continue;

      // Build canonical address
      const addr = dir === 'in'
        ? getInputAddress(block, portName as PortId)
        : getOutputAddress(block, portName as PortId);

      map.set(addressToString(addr), type as CanonicalType);
    }

    return map;
  }

  /**
   * Build portProvenance map from NormalizedPatch edges.
   *
   * Examines edge roles to determine provenance:
   * - role: { kind: 'default', ... } → defaultSource
   * - role: { kind: 'adapter', ... } → adapter
   * - role: { kind: 'user', ... } → userEdge
   * - (no incoming edges) → unresolved
   */
  private buildPortProvenance(normalizedPatch: any): ReadonlyMap<string, PortProvenance> {
    const map = new Map<string, PortProvenance>();

    if (!normalizedPatch?.blocks || !normalizedPatch?.patch?.edges) {
      return map;
    }

    // Build blockIndex → Block mapping
    const blocksByIndex = new Map<number, any>();
    for (let i = 0; i < normalizedPatch.blocks.length; i++) {
      blocksByIndex.set(i, normalizedPatch.blocks[i]);
    }

    // Build blockId → Block mapping for edge lookup
    const blocksById = new Map<string, any>();
    for (const block of normalizedPatch.blocks) {
      blocksById.set(block.id, block);
    }

    // Iterate patch edges (which have role information)
    for (const edge of normalizedPatch.patch.edges) {
      if (edge.to.kind !== 'port') continue;

      const targetBlock = blocksById.get(edge.to.blockId);
      if (!targetBlock) continue;

      const targetAddr = getInputAddress(targetBlock, edge.to.slotId as PortId);
      const targetAddrStr = addressToString(targetAddr);

      const role = edge.role;

      if (role?.kind === 'default') {
        // Default source edge
        const sourceBlock = blocksById.get(edge.from.blockId);
        map.set(targetAddrStr, {
          kind: 'defaultSource',
          sourceBlockType: sourceBlock?.type ?? 'DefaultSource',
        });
      } else if (role?.kind === 'adapter') {
        // Adapter edge
        const sourceBlock = blocksById.get(edge.from.blockId);
        map.set(targetAddrStr, {
          kind: 'adapter',
          adapterType: sourceBlock?.type ?? 'Adapter',
        });
      } else if (role?.kind === 'user') {
        // User wire
        map.set(targetAddrStr, { kind: 'userEdge' });
      } else {
        // Unknown or missing role - mark as unresolved
        map.set(targetAddrStr, { kind: 'unresolved' });
      }
    }

    return map;
  }
}
