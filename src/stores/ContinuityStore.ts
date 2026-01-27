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

import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import type { ContinuityState, StableTargetId, MappingState } from '../runtime/ContinuityState';
import type { RuntimeState } from '../runtime/RuntimeState';

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
 * - Continuity config controls
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

  /** Reference to RuntimeState for accessing continuityConfig */
  private runtimeStateRef: RuntimeState | null = null;

  /**
   * Observable config version counter.
   * Incremented when config values change to trigger MobX reactivity.
   * This is needed because RuntimeState.continuityConfig is a plain object,
   * not MobX observable, so we need a way to notify observers.
   * @internal
   */
  configVersion: number = 0;

  constructor() {
    makeObservable<ContinuityStore, 'configVersion'>(this, {
      targets: observable,
      mappings: observable,
      domainChangeThisFrame: observable,
      lastDomainChangeMs: observable,
      recentChanges: observable,
      totalDomainChanges: observable,
      configVersion: observable,
      decayExponent: computed,
      tauMultiplier: computed,
      baseTauMs: computed,
      setRuntimeStateRef: action,
      updateFromRuntime: action,
      recordDomainChange: action,
      setDecayExponent: action,
      setTauMultiplier: action,
      setBaseTauMs: action,
      triggerTestPulse: action,
      resetToDefaults: action,
      clearContinuityState: action,
      clear: action,
    });
  }

  /**
   * Set the RuntimeState reference for accessing config.
   * Called from main.ts after RuntimeState is created.
   */
  setRuntimeStateRef(state: RuntimeState): void {
    this.runtimeStateRef = state;
  }

  /**
   * Get current decay exponent from RuntimeState config.
   * Depends on configVersion to trigger reactivity when values change.
   */
  get decayExponent(): number {
    // Access configVersion to establish MobX dependency
    void this.configVersion;
    return this.runtimeStateRef?.continuityConfig.decayExponent ?? 0.7;
  }

  /**
   * Get current tau multiplier from RuntimeState config.
   * Depends on configVersion to trigger reactivity when values change.
   */
  get tauMultiplier(): number {
    // Access configVersion to establish MobX dependency
    void this.configVersion;
    return this.runtimeStateRef?.continuityConfig.tauMultiplier ?? 1.0;
  }

  /**
   * Get current base tau duration (ms) from RuntimeState config.
   * Depends on configVersion to trigger reactivity when values change.
   */
  get baseTauMs(): number {
    // Access configVersion to establish MobX dependency
    void this.configVersion;
    return this.runtimeStateRef?.continuityConfig.baseTauMs ?? 150;
  }

  /**
   * Set decay exponent (0.1-2.0).
   */
  setDecayExponent(value: number): void {
    if (this.runtimeStateRef) {
      this.runtimeStateRef.continuityConfig.decayExponent = value;
      this.configVersion++;
    }
  }

  /**
   * Set tau multiplier (0.5-3.0).
   */
  setTauMultiplier(value: number): void {
    if (this.runtimeStateRef) {
      this.runtimeStateRef.continuityConfig.tauMultiplier = value;
      this.configVersion++;
    }
  }

  /**
   * Set base tau duration in milliseconds (50-500ms).
   */
  setBaseTauMs(value: number): void {
    if (this.runtimeStateRef) {
      this.runtimeStateRef.continuityConfig.baseTauMs = value;
      this.configVersion++;
    }
  }

  /**
   * Trigger a test pulse to preview continuity behavior.
   * Injects a pulse into position targets' gauge buffers.
   *
   * @param magnitude - Pulse size (default: 50 for 50px offset)
   * @param targetSemantic - Target semantic ('position' | 'radius' | etc., or undefined for all)
   */
  triggerTestPulse(magnitude: number = 50, targetSemantic?: string): void {
    if (this.runtimeStateRef) {
      this.runtimeStateRef.continuityConfig.testPulseRequest = {
        magnitude,
        targetSemantic,
        appliedFrameId: undefined, // Will be set when applied
      };
      this.configVersion++;
    }
  }

  /**
   * Reset continuity config to defaults.
   */
  resetToDefaults(): void {
    if (this.runtimeStateRef) {
      this.runtimeStateRef.continuityConfig.decayExponent = 0.7;
      this.runtimeStateRef.continuityConfig.tauMultiplier = 1.0;
      this.runtimeStateRef.continuityConfig.baseTauMs = 150;
      this.configVersion++;
    }
  }

  /**
   * Clear all continuity state (buffers, mappings, history).
   */
  clearContinuityState(): void {
    if (this.runtimeStateRef) {
      this.runtimeStateRef.continuity.targets.clear();
      this.runtimeStateRef.continuity.mappings.clear();
      this.runtimeStateRef.continuity.lastTModelMs = 0;
      this.runtimeStateRef.continuity.domainChangeThisFrame = false;
    }
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
    tMs: number
  ): void {
    runInAction(() => {
      this.recentChanges.unshift({
        instanceId,
        oldCount,
        newCount,
        tMs,
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
