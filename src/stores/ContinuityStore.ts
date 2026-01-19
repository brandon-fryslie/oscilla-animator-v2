/**
 * Continuity Store
 *
 * MobX store for exposing continuity system state to the UI.
 * Provides observable summaries of targets, mappings, and domain changes.
 *
 * Updated from runtime state at 5Hz to minimize overhead while
 * providing responsive UI updates.
 *
 * Per Continuity-UI Sprint 3: SPRINT-20260118-continuity-panel-PLAN.md
 */

import { makeObservable, observable, action, runInAction } from 'mobx';
import type { ContinuityState, StableTargetId, MappingState } from '../runtime/ContinuityState';

// =============================================================================
// Summary Types
// =============================================================================

/**
 * Summary of a continuity target for UI display.
 */
export interface TargetSummary {
  /** Stable target ID */
  id: StableTargetId;
  /** Semantic role (position, radius, etc.) */
  semantic: string;
  /** Instance ID this target belongs to */
  instanceId: string;
  /** Element count */
  count: number;
  /** Slew progress 0-1 (1 = complete) */
  slewProgress: number;
}

/**
 * Summary of a domain mapping for UI display.
 */
export interface MappingSummary {
  /** Instance ID */
  instanceId: string;
  /** Mapping kind */
  kind: 'identity' | 'byId' | 'byPosition';
  /** Number of elements with mapping from previous domain */
  mapped: number;
  /** Number of new elements without mapping */
  unmapped: number;
}

/**
 * Summary of a domain change event for history display.
 */
export interface DomainChangeEvent {
  /** Instance ID that changed */
  instanceId: string;
  /** Old element count */
  oldCount: number;
  /** New element count */
  newCount: number;
  /** Model time when change occurred (ms) */
  tMs: number;
  /** Mapping used for continuity */
  mappingKind: 'identity' | 'byId' | 'byPosition' | 'none';
}

// =============================================================================
// ContinuityStore
// =============================================================================

/**
 * MobX store for continuity system state.
 *
 * Provides observable state for:
 * - Active continuity targets
 * - Current mappings
 * - Domain change history
 */
export class ContinuityStore {
  /** Active continuity targets */
  targets: TargetSummary[] = [];

  /** Current domain mappings */
  mappings: MappingSummary[] = [];

  /** Whether a domain change occurred this frame */
  domainChangeThisFrame: boolean = false;

  /** Time of last domain change (model time ms) */
  lastDomainChangeMs: number = 0;

  /** Recent domain change history (last 10 events) */
  recentChanges: DomainChangeEvent[] = [];

  /** Total domain changes since session start */
  totalDomainChanges: number = 0;

  constructor() {
    makeObservable(this, {
      targets: observable,
      mappings: observable,
      domainChangeThisFrame: observable,
      lastDomainChangeMs: observable,
      recentChanges: observable,
      totalDomainChanges: observable,
      updateFromRuntime: action,
      recordDomainChange: action,
      clear: action,
    });
  }

  /**
   * Update store from runtime continuity state.
   * Called at 5Hz from animation loop.
   *
   * @param continuity - Runtime continuity state
   * @param tMs - Current model time in milliseconds
   */
  updateFromRuntime(continuity: ContinuityState, tMs: number): void {
    // Extract target summaries
    const targets: TargetSummary[] = [];
    for (const [id, state] of continuity.targets) {
      const parts = (id as string).split(':');
      targets.push({
        id,
        semantic: parts[0] || 'unknown',
        instanceId: parts[1] || 'unknown',
        count: state.count,
        slewProgress: 1.0, // TODO: Compute actual slew progress from buffer analysis
      });
    }

    // Extract mapping summaries
    const mappings: MappingSummary[] = [];
    for (const [instanceId, mapping] of continuity.mappings) {
      const { mapped, unmapped } = countMappedElements(mapping);
      mappings.push({
        instanceId,
        kind: mapping.kind,
        mapped,
        unmapped,
      });
    }

    runInAction(() => {
      this.targets = targets;
      this.mappings = mappings;
      this.domainChangeThisFrame = continuity.domainChangeThisFrame;
      if (continuity.domainChangeThisFrame) {
        this.lastDomainChangeMs = tMs;
      }
    });
  }

  /**
   * Record a domain change event for history.
   * Called from main.ts when domain change is detected.
   */
  recordDomainChange(
    instanceId: string,
    oldCount: number,
    newCount: number,
    tMs: number,
    mappingKind: 'identity' | 'byId' | 'byPosition' | 'none' = 'none'
  ): void {
    runInAction(() => {
      this.recentChanges.unshift({
        instanceId,
        oldCount,
        newCount,
        tMs,
        mappingKind,
      });

      // Keep only last 10 events
      if (this.recentChanges.length > 10) {
        this.recentChanges.pop();
      }

      this.totalDomainChanges++;
      this.lastDomainChangeMs = tMs;
    });
  }

  /**
   * Clear all continuity tracking.
   */
  clear(): void {
    runInAction(() => {
      this.targets = [];
      this.mappings = [];
      this.domainChangeThisFrame = false;
      this.lastDomainChangeMs = 0;
      this.recentChanges = [];
      this.totalDomainChanges = 0;
    });
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Count mapped vs unmapped elements in a mapping.
 */
function countMappedElements(mapping: MappingState): { mapped: number; unmapped: number } {
  if (mapping.kind === 'identity') {
    return { mapped: mapping.count, unmapped: 0 };
  }

  // For byId and byPosition mappings
  let mapped = 0;
  let unmapped = 0;
  for (const idx of mapping.newToOld) {
    if (idx >= 0) {
      mapped++;
    } else {
      unmapped++;
    }
  }
  return { mapped, unmapped };
}
