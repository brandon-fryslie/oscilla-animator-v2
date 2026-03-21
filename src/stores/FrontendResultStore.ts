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
import type { DefaultSource } from '../types';
import { normalizeCanonicalName } from '../core/canonical-name';
import {
  buildFrontendSemanticMaps,
  type BindingControlDescriptor,
  type InputBindingSummary,
  type PortProvenance,
} from '../compiler/frontend/semantic-snapshot';
export type {
  BindingControlDescriptor,
  InputBindingSummary,
  PortProvenance,
} from '../compiler/frontend/semantic-snapshot';

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

  /** Per-input binding semantics, keyed by canonical address string */
  readonly inputBindings: ReadonlyMap<string, InputBindingSummary>;

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
/**
 * Empty snapshot for initial state (before first compilation).
 */
const EMPTY_SNAPSHOT: FrontendSnapshot = {
  status: 'none',
  patchRevision: -1,
  portProvenance: new Map(),
  resolvedPortTypes: new Map(),
  inputBindings: new Map(),
  errors: [],
  backendReady: false,
  cycleSummary: null,
};

function blockCanonicalName(blockId: string): string {
  return normalizeCanonicalName(blockId);
}

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
    const { resolvedPortTypes, portProvenance, inputBindings } = buildFrontendSemanticMaps(
      normalizedPatch,
      typedPatch,
    );

    this.snapshot = {
      status: 'ready',
      patchRevision,
      portProvenance,
      resolvedPortTypes,
      inputBindings,
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

  getInputBinding(canonicalAddr: string): InputBindingSummary | undefined {
    return this.snapshot.inputBindings.get(canonicalAddr);
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

  getInputBindingByIds(blockId: string, portId: string): InputBindingSummary | undefined {
    const addr = this.buildCanonicalAddressFromIds(blockId, portId, 'in');
    return addr ? this.snapshot.inputBindings.get(addr) : undefined;
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
      this.blockIdToCanonicalName.set(block.id as string, blockCanonicalName(block.id as string));
    }
  }
}
