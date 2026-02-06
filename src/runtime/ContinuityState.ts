/**
 * Continuity State Module
 *
 * Stores all state needed for smooth transitions across domain changes
 * and parameter edits.
 *
 * Per spec topics/11-continuity-system.md §5:
 * - Continuity is a post-materialization pass operating on buffers
 * - Continuity state holds stable pooled buffers for gauge and slew
 * - Keys must be stable across recompiles
 *
 * @module runtime/ContinuityState
 */

import type { DomainInstance } from '../compiler/ir/types';
import type { PlacementBasisBuffers } from './PlacementBasis';

// =============================================================================
// Branded Types
// =============================================================================

/**
 * Branded type for stable target identification.
 * Survives across recompiles unlike raw slot indices (spec §6.1).
 */
export type StableTargetId = string & { readonly __brand: 'StableTargetId' };

/**
 * Compute stable target ID from semantic information (spec §6.1).
 *
 * Stable derivation from:
 * - semantic role (position, radius, etc.)
 * - instanceId (which instance this targets)
 * - portName (which output port)
 *
 * This ensures continuity state persists across recompiles.
 *
 * @param semantic - Semantic role of the target
 * @param instanceId - Instance ID
 * @param portName - Port name
 * @returns Stable target ID
 */
export function computeStableTargetId(
  semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
  instanceId: string,
  portName: string
): StableTargetId {
  return `${semantic}:${instanceId}:${portName}` as StableTargetId;
}

// =============================================================================
// Mapping State
// =============================================================================

/**
 * Mapping from new element indices to old element indices (spec §3.3).
 * Used to transfer state when domain count changes.
 *
 * newToOld[i] = old index for element i, or -1 if element is new (unmapped).
 * For identity mappings, newToOld[i] === i (array allocated once at domain creation).
 *
 * Single representation, single code path everywhere.
 */
export interface MappingState {
  readonly newToOld: Int32Array;
}

// =============================================================================
// Target Continuity State
// =============================================================================

/**
 * Per-target continuity buffers.
 *
 * Each continuity target has:
 * - gaugeBuffer: Offset values (Δ) for x_eff = x_base + Δ
 * - slewBuffer: Current smoothed values (y) for slew filter
 * - crossfade state for buffer blending (spec §3.7)
 */
export interface TargetContinuityState {
  /** Gauge offset buffer (Δ) - x_eff = x_base + Δ */
  gaugeBuffer: Float32Array;

  /** Slew state buffer (y) - current smoothed value */
  slewBuffer: Float32Array;

  /** Current element count */
  count: number;

  /** Crossfade: When crossfade started (t_model_ms) */
  crossfadeStartMs?: number;

  /** Crossfade: Snapshot of old effective values for blending */
  crossfadeOldBuffer?: Float32Array;
}

// =============================================================================
// Complete Continuity State
// =============================================================================

/**
 * Complete continuity state for runtime (spec §5.1).
 *
 * This state is:
 * - Preserved across frames
 * - Preserved across hot-swap
 * - Preserved across export stepping
 * - Never reset except by explicit user action
 */
export interface ContinuityState {
  /** Per-target continuity buffers, keyed by StableTargetId */
  targets: Map<StableTargetId, TargetContinuityState>;

  /** Current mapping state per instance */
  mappings: Map<string, MappingState>;

  /** Previous domain instances (for change detection) */
  prevDomains: Map<string, DomainInstance>;

  /** Per-instance placement basis, keyed by InstanceId */
  readonly placementBasis: Map<string, PlacementBasisBuffers>;

  /** Last t_model_ms for slew delta computation */
  lastTModelMs: number;

  /** Flag indicating domain change occurred this frame */
  domainChangeThisFrame: boolean;
}

/**
 * Create initial continuity state.
 *
 * @returns Fresh ContinuityState with empty maps
 */
export function createContinuityState(): ContinuityState {
  return {
    targets: new Map(),
    mappings: new Map(),
    prevDomains: new Map(),
    placementBasis: new Map(),
    lastTModelMs: 0,
    domainChangeThisFrame: false,
  };
}

/**
 * Get or create target continuity state.
 * Handles buffer reallocation when count changes.
 *
 * Per spec §5.3: Continuity must never allocate per frame.
 * This function only allocates when count changes.
 *
 * @param continuity - Parent continuity state
 * @param targetId - Stable target ID
 * @param count - Required element count
 * @returns Target continuity state (may be newly allocated)
 */
export function getOrCreateTargetState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  count: number
): TargetContinuityState {
  let state = continuity.targets.get(targetId);

  if (!state || state.count !== count) {
    // Allocate new buffers
    state = {
      gaugeBuffer: new Float32Array(count),
      slewBuffer: new Float32Array(count),
      count,
    };
    continuity.targets.set(targetId, state);
  }

  return state;
}

/**
 * Clear all continuity state.
 * Used for explicit reset (e.g., user action, new patch load).
 *
 * @param continuity - Continuity state to clear
 */
export function clearContinuityState(continuity: ContinuityState): void {
  continuity.targets.clear();
  continuity.mappings.clear();
  continuity.prevDomains.clear();
  continuity.placementBasis.clear();
  continuity.lastTModelMs = 0;
  continuity.domainChangeThisFrame = false;
}

/**
 * Remove entries for instances that no longer exist in the active program.
 * Call after hot-swap to prevent unbounded accumulation of stale state.
 *
 * @param continuity - Continuity state to prune
 * @param activeInstanceIds - Set of instance IDs in the current program
 */
export function pruneStaleContinuity(
  continuity: ContinuityState,
  activeInstanceIds: ReadonlySet<string>
): void {
  for (const id of continuity.prevDomains.keys()) {
    if (!activeInstanceIds.has(id)) {
      continuity.prevDomains.delete(id);
    }
  }
  for (const id of continuity.mappings.keys()) {
    if (!activeInstanceIds.has(id)) {
      continuity.mappings.delete(id);
    }
  }
  for (const id of continuity.placementBasis.keys()) {
    if (!activeInstanceIds.has(id)) {
      continuity.placementBasis.delete(id);
    }
  }
}

/**
 * Reset frame-local flags at start of frame.
 *
 * @param continuity - Continuity state
 */
export function beginContinuityFrame(continuity: ContinuityState): void {
  continuity.domainChangeThisFrame = false;
}

/**
 * Finalize continuity frame.
 * Updates time tracking.
 *
 * @param continuity - Continuity state
 * @param tModelMs - Current model time in milliseconds
 */
export function finalizeContinuityFrame(
  continuity: ContinuityState,
  tModelMs: number
): void {
  continuity.lastTModelMs = tModelMs;
  continuity.domainChangeThisFrame = false;
}
