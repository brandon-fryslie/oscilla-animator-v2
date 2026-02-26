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
 * Number of consecutive hot-swap prune passes an instance can stay missing
 * before its continuity state is physically removed.
 */
export const CONTINUITY_DORMANT_PRUNE_HOTSWAPS = 2;

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

  /**
   * Canonical target ownership map: StableTargetId -> instanceId.
   * // [LAW:one-source-of-truth] Target->instance ownership is tracked once
   * and reused by prune/migration logic instead of reparsing string keys.
   */
  targetOwners: Map<StableTargetId, string>;

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

  /**
   * Instances whose domains changed during the current frame.
   * // [LAW:one-source-of-truth] Per-instance change tracking is the canonical continuity
   * change signal; global booleans are derived compatibility surfaces.
   */
  changedInstancesThisFrame: Set<string>;

  /**
   * Tracks how many consecutive prune passes each missing instance has spent
   * in dormant state before hard deletion.
   */
  dormantInstanceMisses: Map<string, number>;
}

export interface ContinuityTargetOwnerBinding {
  readonly targetId: StableTargetId;
  readonly instanceId: string;
}

/**
 * Create initial continuity state.
 *
 * @returns Fresh ContinuityState with empty maps
 */
export function createContinuityState(): ContinuityState {
  return {
    targets: new Map(),
    targetOwners: new Map(),
    mappings: new Map(),
    prevDomains: new Map(),
    placementBasis: new Map(),
    lastTModelMs: 0,
    domainChangeThisFrame: false,
    changedInstancesThisFrame: new Set(),
    dormantInstanceMisses: new Map(),
  };
}

/**
 * Resize a Float32Array preserving the prefix (existing elements keep their values).
 *
 * @param old - Existing buffer
 * @param newLen - New length
 * @returns New buffer with prefix copied from old
 */
export function resizePreservePrefix(old: Float32Array, newLen: number): Float32Array {
  const result = new Float32Array(newLen);
  const copyCount = Math.min(old.length, newLen);
  result.set(old.subarray(0, copyCount));
  return result;
}

/**
 * Get or create target continuity state.
 * Handles buffer reallocation when count changes, preserving existing data
 * for the prefix (elements that existed before the count change).
 *
 * Per spec §5.3: Continuity must never allocate per frame.
 * This function only allocates when count changes.
 *
 * Prefix-stable: existing elements keep their gauge/slew values when count
 * increases or decreases. New elements start at zero.
 *
 * @param continuity - Parent continuity state
 * @param targetId - Stable target ID
 * @param count - Required element count
 * @returns Target continuity state (may be newly allocated)
 */
export function getOrCreateTargetState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  count: number,
  instanceId?: string
): TargetContinuityState {
  if (instanceId !== undefined) {
    continuity.targetOwners.set(targetId, instanceId);
    continuity.dormantInstanceMisses.delete(instanceId);
  }

  let state = continuity.targets.get(targetId);

  if (!state || state.count !== count) {
    if (state) {
      // Resize preserving prefix — existing elements keep their values
      const crossfadeOldBuffer = state.crossfadeOldBuffer
        ? resizePreservePrefix(state.crossfadeOldBuffer, count)
        : undefined;
      state = {
        gaugeBuffer: resizePreservePrefix(state.gaugeBuffer, count),
        slewBuffer: resizePreservePrefix(state.slewBuffer, count),
        count,
        ...(state.crossfadeStartMs !== undefined && { crossfadeStartMs: state.crossfadeStartMs }),
        ...(crossfadeOldBuffer && { crossfadeOldBuffer }),
      };
    } else {
      // Fresh allocation — no prefix to preserve
      state = {
        gaugeBuffer: new Float32Array(count),
        slewBuffer: new Float32Array(count),
        count,
      };
    }
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
  continuity.targetOwners.clear();
  continuity.mappings.clear();
  continuity.prevDomains.clear();
  continuity.placementBasis.clear();
  continuity.lastTModelMs = 0;
  continuity.domainChangeThisFrame = false;
  continuity.changedInstancesThisFrame.clear();
  continuity.dormantInstanceMisses.clear();
}

export function registerContinuityTargetOwners(
  continuity: ContinuityState,
  bindings: Iterable<ContinuityTargetOwnerBinding>,
): void {
  for (const binding of bindings) {
    if (!continuity.targets.has(binding.targetId)) {
      continue;
    }
    // [LAW:one-source-of-truth] Continuity owner bindings are only accepted
    // through structured upstream metadata, never parsed from target strings.
    continuity.targetOwners.set(binding.targetId, binding.instanceId);
  }
}

function collectTrackedInstanceIds(continuity: ContinuityState): Set<string> {
  const trackedInstanceIds = new Set<string>();
  for (const instanceId of continuity.prevDomains.keys()) {
    trackedInstanceIds.add(instanceId);
  }
  for (const instanceId of continuity.mappings.keys()) {
    trackedInstanceIds.add(instanceId);
  }
  for (const instanceId of continuity.placementBasis.keys()) {
    trackedInstanceIds.add(instanceId);
  }
  for (const instanceId of continuity.targetOwners.values()) {
    trackedInstanceIds.add(instanceId);
  }
  return trackedInstanceIds;
}

function pruneInstanceState(continuity: ContinuityState, instanceId: string): void {
  continuity.prevDomains.delete(instanceId);
  continuity.mappings.delete(instanceId);
  continuity.placementBasis.delete(instanceId);
  continuity.dormantInstanceMisses.delete(instanceId);

  for (const [targetId, ownerId] of continuity.targetOwners.entries()) {
    if (ownerId === instanceId) {
      continuity.targetOwners.delete(targetId);
      continuity.targets.delete(targetId);
    }
  }
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
  activeInstanceIds: ReadonlySet<string>,
  ownerBindings?: Iterable<ContinuityTargetOwnerBinding>,
): void {
  if (ownerBindings !== undefined) {
    registerContinuityTargetOwners(continuity, ownerBindings);
  }

  for (const instanceId of activeInstanceIds) {
    continuity.dormantInstanceMisses.delete(instanceId);
  }

  const trackedInstanceIds = collectTrackedInstanceIds(continuity);
  for (const instanceId of trackedInstanceIds) {
    if (!activeInstanceIds.has(instanceId)) {
      const nextMisses = (continuity.dormantInstanceMisses.get(instanceId) ?? 0) + 1;
      if (nextMisses >= CONTINUITY_DORMANT_PRUNE_HOTSWAPS) {
        pruneInstanceState(continuity, instanceId);
      } else {
        continuity.dormantInstanceMisses.set(instanceId, nextMisses);
      }
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
  continuity.changedInstancesThisFrame.clear();
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
  continuity.changedInstancesThisFrame.clear();
}
