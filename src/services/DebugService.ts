/**
 * DebugService - Runtime Value Observation
 *
 * Singleton service that bridges runtime slot values to UI queries.
 * Supports both scalar and field (buffer) debug inspection.
 *
 * Field/history tracking supports two modes:
 * - demand-driven (default): only actively inspected targets are tracked
 * - global scalar history mode: scalar history keys are pre-tracked from mapped outputs
 *
 * Data flow: Compiler → (edge-to-slot map) → Runtime → (tap) → DebugService → (query) → UI
 */

import type { ValueSlot } from '../types';
import type { CanonicalType } from '../core/canonical-types';
import { payloadStride, requireInst } from '../core/canonical-types';
import type { UnmappedEdgeInfo, EdgeMetadata } from './mapDebugEdges';
import type { ConstantValue } from './ConstantValueTracker';
import { HistoryService, type KeyResolver, type ResolvedKeyMetadata } from '../ui/debug-viz/HistoryService';
import { getSampleEncoding, serializeKey, type DebugTargetKey, type HistoryView, type BufferHistoryView, type Stride } from '../ui/debug-viz/types';
import type { FieldHistoryView, AggregateFieldStats } from '../ui/debug-viz/FieldStatsAccumulator';
import { FieldStatsAccumulator } from '../ui/debug-viz/FieldStatsAccumulator';
import type { ArenaSlotDescriptor } from '../runtime/ArenaValueStore';
import { arenaDecodeToAoS, arenaRead } from '../runtime/ArenaValueStore';

/**
 * Scalar value result - scalar value from evalValue step.
 */
export interface ScalarValueResult {
  kind: 'scalar';
  value: number;
  slotId: ValueSlot;
  type: CanonicalType;
}

/**
 * Field value result - accumulated stats + raw buffer for direct visualization.
 */
export interface FieldValueResult {
  kind: 'field';
  stats: AggregateFieldStats;
  buffer: Float32Array;
  slotId: ValueSlot;
  type: CanonicalType;
}

/**
 * Field untracked result - field exists but is not currently being tracked.
 * UI should show "hover to inspect" rather than crashing.
 */
export interface FieldUntrackedResult {
  kind: 'field-untracked';
  slotId: ValueSlot;
  type: CanonicalType;
}

/**
 * Constant value result - value from an optimized-away block.
 * Shows compile-time constant instead of runtime value.
 */
export interface ConstantValueResult {
  kind: 'constant';
  value: unknown;
  type: CanonicalType;
  /** Why this is shown as a constant */
  reason: 'const-block' | 'default-value' | 'computed-constant';
  /** Human-readable explanation for UI */
  description: string;
}

/**
 * Discriminated union of all possible debug value results.
 */
export type EdgeValueResult = ScalarValueResult | FieldValueResult | FieldUntrackedResult | ConstantValueResult;

/**
 * Debug service health status.
 */
export interface DebugServiceStatus {
  /** Total edges successfully mapped to slots */
  totalEdgesMapped: number;
  /** Total ports successfully mapped to slots */
  totalPortsMapped: number;
  /** List of edges that couldn't be mapped */
  unmappedEdges: UnmappedEdgeInfo[];
  /** Whether debug system is fully operational (no unmapped edges) */
  isHealthy: boolean;
}

export type DebugServiceIssueLevel = 'warn' | 'error';

export interface DebugServiceIssue {
  readonly level: DebugServiceIssueLevel;
  readonly source: 'tryGetEdgeValue' | 'tryGetPortValue' | 'reporter';
  readonly message: string;
  readonly key?: string;
  readonly detail?: unknown;
}

const MAX_DEBUG_ISSUES = 128;
const ISSUE_THROTTLE_MS = 2000;

/**
 * DebugService - Observation service with demand-driven or global debug tracking
 *
 * Responsibilities:
 * - Store edge-to-slot mapping (set by compiler)
 * - Store slot values (updated by runtime tap)
 * - Track which field slots need materialization (demand-driven)
 * - Provide query API for UI (getEdgeValue)
 *
 * Field tracking contract:
 * - A field is "tracked" when UI actively inspects it (hover/inspector)
 * - Tracked fields MUST have values after runtime starts (throws if not — scheduling bug)
 * - Untracked fields return { kind: 'field-untracked' } (no throw)
 */
class DebugService {
  /** Edge-to-slot-and-type mapping (set by compiler after compilation) */
  private edgeToSlotMap = new Map<string, EdgeMetadata>();

  /** Port-to-slot-and-type mapping (for unconnected output queries) */
  private portToSlotMap = new Map<string, EdgeMetadata>();

  /** Scalar slot values (updated by runtime via tap) */
  private scalarValues = new Map<ValueSlot, number>();

  /** Scalar slots that have received runtime tap writes this compile epoch. */
  private scalarTapSlots = new Set<ValueSlot>();

  /** Field buffer data (updated by runtime via tap) */
  private fieldBuffers = new Map<ValueSlot, Float32Array>();

  /** Field slots that have received runtime tap writes this compile epoch. */
  private fieldTapSlots = new Set<ValueSlot>();

  /** Field slots currently being tracked for debug inspection */
  private trackedFieldSlots = new Set<ValueSlot>();

  /** Reference counts for field slot tracking (supports multiple observers). */
  private trackedFieldSlotRefs = new Map<ValueSlot, number>();

  /** Reference counts for scalar history tracking keys (supports multiple observers). */
  private trackedHistoryRefs = new Map<string, number>();

  /** Global scalar history mode: pre-track mapped scalar history keys. */
  private autoTrackAllDebugData = false;

  /** History keys currently tracked by global sampling mode. */
  private globalHistoryKeys = new Map<string, DebugTargetKey>();

  /** Per-slot accumulated field stats (created on trackField, cleared on recompile) */
  private fieldAccumulators = new Map<ValueSlot, FieldStatsAccumulator>();

  /** Whether runtime has started (at least one value written) */
  private runtimeStarted = false;

  /**
   * Arena reference for direct value reads post-zdru.1/zdru.2.
   * [LAW:one-source-of-truth] Arena is the canonical value store once set.
   * Cleared on setEdgeToSlotMap (recompile invalidates old ProgramState arena).
   */
  private arenaRef: { arena: Float32Array; slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor> } | null = null;

  /** Edges that couldn't be mapped (for error reporting) */
  private unmappedEdges: UnmappedEdgeInfo[] = [];

  /** Constant values for optimized-away edges */
  private constantValues = new Map<string, ConstantValueResult>();

  /**
   * Frontend-sourced map from string block ID to user-facing display name.
   * // [LAW:one-way-deps] Populated by CompileOrchestrator (which owns the Patch),
   * // never by the compiler backend, runtime, or renderer.
   */
  private blockDisplayNames = new Map<string, string>();

  private issues: DebugServiceIssue[] = [];
  private issueReporter: ((issue: DebugServiceIssue) => void) | null = null;
  private issueThrottle = new Map<string, number>();

  /** Temporal history tracking service */
  readonly historyService: HistoryService;

  constructor() {
    // Create resolver that closes over this instance's maps.
    // This avoids circular dependency: HistoryService doesn't import DebugService.
    const resolver: KeyResolver = (key: DebugTargetKey): ResolvedKeyMetadata | undefined => {
      let meta: EdgeMetadata | undefined;
      if (key.kind === 'edge') {
        meta = this.edgeToSlotMap.get(key.edgeId);
      } else {
        const portKey = `${key.blockId}:${key.portName}`;
        meta = this.portToSlotMap.get(portKey);
      }
      if (!meta) return undefined;
      return {
        slotId: meta.slotId,
        type: meta.type,
      };
    };
    this.historyService = new HistoryService(resolver);
  }

  /**
   * Set the edge-to-slot mapping (and optional constant values).
   * Called by compiler after successful compilation.
   */
  setEdgeToSlotMap(map: Map<string, EdgeMetadata>, constantValues?: Map<string, ConstantValue>): void {
    this.edgeToSlotMap = map;
    this.constantValues = constantValues ?? new Map();
    // Slot namespace changed — old values are stale and new slots haven't been written yet.
    // Reset so queries return undefined (graceful) instead of throwing (scheduling bug).
    this.scalarValues.clear();
    this.scalarTapSlots.clear();
    this.fieldBuffers.clear();
    this.fieldTapSlots.clear();
    this.trackedFieldSlots.clear();
    this.trackedFieldSlotRefs.clear();
    this.fieldAccumulators.clear();
    this.runtimeStarted = false;
    // [LAW:one-source-of-truth] Arena belongs to ProgramState; clear stale ref on recompile.
    // setArenaRef() will restore it after this call in setupDebugProbe.
    this.arenaRef = null;
    this.historyService.onMappingChanged();
    this.syncGlobalDebugTracking();
  }

  /**
   * Set the port-to-slot mapping.
   * Called by compiler after successful compilation.
   */
  setPortToSlotMap(map: Map<string, EdgeMetadata>): void {
    this.portToSlotMap = map;
    this.historyService.onMappingChanged();
    this.syncGlobalDebugTracking();
  }

  /**
   * Toggle global debug sampling mode.
   *
   * When enabled, scalar history is tracked for all mapped scalar targets.
   * Field tracking remains demand-driven to avoid eager field materialization.
   */
  setAutoTrackAllDebugData(enabled: boolean): void {
    if (this.autoTrackAllDebugData === enabled) return;
    this.autoTrackAllDebugData = enabled;
    this.syncGlobalDebugTracking();
  }

  /**
   * Set unmapped edges for error reporting.
   */
  setUnmappedEdges(edges: UnmappedEdgeInfo[]): void {
    this.unmappedEdges = edges;
  }

  /**
   * Set the block display name map.
   * Called by CompileOrchestrator (which owns the Patch) after each compilation.
   * // [LAW:one-way-deps] Only the frontend-aware orchestration layer may call this.
   */
  setBlockDisplayNames(map: ReadonlyMap<string, string>): void {
    this.blockDisplayNames = new Map(map);
  }

  /**
   * Resolve a string block ID to its user-facing display name.
   * Returns undefined if no display name is registered for the given block ID.
   */
  getBlockDisplayName(blockId: string): string | undefined {
    return this.blockDisplayNames.get(blockId);
  }

  /**
   * Wire the arena for direct value reads.
   * Called by CompileOrchestrator after every compile/recompile, after setEdgeToSlotMap.
   *
   * [LAW:one-source-of-truth] Arena is the canonical value store post-zdru.1/zdru.2.
   * Must be called AFTER setEdgeToSlotMap (which clears any stale arena ref).
   */
  setArenaRef(
    arena: Float32Array,
    slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  ): void {
    this.arenaRef = {
      arena,
      slotToArena,
    };
  }

  /**
   * Get debug service health status.
   */
  getStatus(): DebugServiceStatus {
    return {
      totalEdgesMapped: this.edgeToSlotMap.size,
      totalPortsMapped: this.portToSlotMap.size,
      unmappedEdges: this.unmappedEdges,
      isHealthy: this.unmappedEdges.length === 0,
    };
  }

  setIssueReporter(reporter: ((issue: DebugServiceIssue) => void) | null): void {
    this.issueReporter = reporter;
  }

  getIssues(): readonly DebugServiceIssue[] {
    return this.issues;
  }

  clearIssues(): void {
    this.issues = [];
    this.issueThrottle.clear();
  }

  // ===========================================================================
  // Field Tracking API
  // ===========================================================================

  /**
   * Track a field slot for demand-driven materialization.
   * Called by UI when user hovers a field edge or opens a field inspector.
   * Creates a FieldStatsAccumulator for the slot if one doesn't exist.
   */
  trackField(slotId: ValueSlot, type: CanonicalType): void {
    const refs = this.trackedFieldSlotRefs.get(slotId) ?? 0;
    this.trackedFieldSlotRefs.set(slotId, refs + 1);
    if (refs > 0) return;

    this.trackedFieldSlots.add(slotId);
    if (!this.fieldAccumulators.has(slotId)) {
      const stride = payloadStride(type.payload) as Stride;
      this.fieldAccumulators.set(slotId, new FieldStatsAccumulator(stride));
    }
  }

  /**
   * Stop tracking a field slot.
   * Called when user stops hovering or closes inspector.
   */
  untrackField(slotId: ValueSlot): void {
    const refs = this.trackedFieldSlotRefs.get(slotId) ?? 0;
    if (refs <= 1) {
      this.trackedFieldSlotRefs.delete(slotId);
    } else {
      this.trackedFieldSlotRefs.set(slotId, refs - 1);
      return;
    }

    this.trackedFieldSlots.delete(slotId);
    this.fieldBuffers.delete(slotId);
    this.fieldAccumulators.delete(slotId);
  }

  /**
   * Check if a field slot is currently tracked.
   */
  isFieldTracked(slotId: ValueSlot): boolean {
    return this.trackedFieldSlots.has(slotId);
  }

  /**
   * Get all currently tracked field slots.
   * Used by runtime tap to determine which fields to materialize.
   */
  getTrackedFieldSlots(): ReadonlySet<ValueSlot> {
    return this.trackedFieldSlots;
  }

  /**
   * Track scalar history for a debug target key with ref-count semantics.
   * Mirrors trackField/untrackField behavior so multiple views can observe safely.
   */
  trackHistoryKey(key: DebugTargetKey): void {
    const serialized = serializeKey(key);
    const refs = this.trackedHistoryRefs.get(serialized) ?? 0;
    this.trackedHistoryRefs.set(serialized, refs + 1);
    if (refs > 0) return;
    if (!this.globalHistoryKeys.has(serialized)) {
      this.historyService.track(key);
    }
  }

  /**
   * Stop tracking scalar history for a debug target key with ref-count semantics.
   */
  untrackHistoryKey(key: DebugTargetKey): void {
    const serialized = serializeKey(key);
    const refs = this.trackedHistoryRefs.get(serialized) ?? 0;
    if (refs <= 1) {
      this.trackedHistoryRefs.delete(serialized);
      if (!this.globalHistoryKeys.has(serialized)) {
        this.historyService.untrack(key);
      }
      return;
    }
    this.trackedHistoryRefs.set(serialized, refs - 1);
  }

  // ===========================================================================
  // Value Update API (called by runtime tap)
  // ===========================================================================

  /**
   * Update a scalar slot value.
   * Called by runtime tap after each scalar slot write.
   */
  updateSlotValue(slotId: ValueSlot, value: number): void {
    this.runtimeStarted = true;
    this.scalarValues.set(slotId, value);
    this.scalarTapSlots.add(slotId);
    this.historyService.onSlotWrite(slotId, value);
  }

  /**
   * Update a field (buffer) slot value.
   * Called by runtime tap after each field materialization.
   * Stores a copy of the buffer and feeds the accumulator.
   */
  updateFieldValue(slotId: ValueSlot, buffer: ArrayBufferView): void {
    this.runtimeStarted = true;
    this.fieldTapSlots.add(slotId);
    // Reuse existing buffer if same length to avoid per-frame allocation
    const src = buffer as Float32Array;
    let copy = this.fieldBuffers.get(slotId);
    if (!copy || copy.length !== src.length) {
      copy = new Float32Array(src.length);
      this.fieldBuffers.set(slotId, copy);
    }
    copy.set(src);

    // Feed accumulator for accumulated stats + temporal history
    const acc = this.fieldAccumulators.get(slotId);
    if (acc) {
      const stride = acc.stride as number;
      const count = stride > 0 ? src.length / stride : 0;
      acc.update(src, count);
    }
  }

  // ===========================================================================
  // Query API (called by UI)
  // ===========================================================================

  /**
   * Query edge value by edge ID.
   *
   * Behavior by cardinality:
   * - Scalar: returns ScalarValueResult (throws if no value after runtime started)
   * - Field + tracked: returns FieldValueResult (throws if no value after runtime started)
   * - Field + untracked: returns FieldUntrackedResult (no throw)
   *
   * @returns undefined if edge not in mapping (runtime not yet compiled this edge)
   * @throws If scalar/tracked-field slot has no value after runtime started (scheduling bug)
   */
  getEdgeValue(edgeId: string): EdgeValueResult | undefined {
    // [LAW:one-source-of-truth] Debug queries are sourced from canonical debug
    // stores (arena-backed reads/tap caches), not the generic object map.
    const meta = this.edgeToSlotMap.get(edgeId);
    if (!meta) {
      // Edge not in mapping - this indicates the compiler failed to register
      // the edge's source output in debugIndex. This is a compiler bug.
      throw new Error(
        `[DebugService.getEdgeValue] Edge '${edgeId}' not found in edge-to-slot mapping. ` +
        `This indicates a compiler bug - the edge's source output was not registered in debugIndex.`
      );
    }

    if (requireInst(meta.type.extent.cardinality, 'cardinality').kind === 'many') {
      return this.queryFieldValue(meta);
    }
    return this.queryScalarValue(meta);
  }

  /**
   * Non-throwing edge query for UI polling/hover paths.
   *
   * Missing mapping or transient runtime unavailability returns undefined.
   * Strict callers should use getEdgeValue() to preserve invariant exceptions.
   */
  tryGetEdgeValue(edgeId: string): EdgeValueResult | undefined {
    const meta = this.edgeToSlotMap.get(edgeId);
    if (!meta) return undefined;
    try {
      if (requireInst(meta.type.extent.cardinality, 'cardinality').kind === 'many') {
        return this.queryFieldValue(meta);
      }
      return this.queryScalarValue(meta);
    } catch (error) {
      // [LAW:no-silent-fallbacks] Polling paths remain non-throwing for UI stability,
      // but suppressed query failures must still be observable.
      this.recordIssue({
        level: 'error',
        source: 'tryGetEdgeValue',
        key: `edge:${edgeId}`,
        message: `Suppressed debug query failure for edge '${edgeId}'`,
        detail: error,
      });
      return undefined;
    }
  }

  /**
   * Query port value by block ID and port name.
   */
  getPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    const key = `${blockId}:${portName}`;
    const meta = this.portToSlotMap.get(key);
    if (!meta) {
      return undefined;
    }

    if (requireInst(meta.type.extent.cardinality, 'cardinality').kind === 'many') {
      return this.queryFieldValue(meta);
    }
    return this.queryScalarValue(meta);
  }

  /**
   * Non-throwing port query for UI polling/hover paths.
   *
   * Missing mapping or transient runtime unavailability returns undefined.
   * Strict callers should use getPortValue() for invariant exceptions.
   */
  tryGetPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    const key = `${blockId}:${portName}`;
    const meta = this.portToSlotMap.get(key);
    if (!meta) return undefined;
    try {
      if (requireInst(meta.type.extent.cardinality, 'cardinality').kind === 'many') {
        return this.queryFieldValue(meta);
      }
      return this.queryScalarValue(meta);
    } catch (error) {
      // [LAW:no-silent-fallbacks] Polling paths remain non-throwing for UI stability,
      // but suppressed query failures must still be observable.
      this.recordIssue({
        level: 'error',
        source: 'tryGetPortValue',
        key: `port:${blockId}:${portName}`,
        message: `Suppressed debug query failure for port '${blockId}.${portName}'`,
        detail: error,
      });
      return undefined;
    }
  }

  /**
   * Get port metadata (cardinality, slot, type) without querying value.
   * Used by UI to derive tracking policy and chart shape for port probes.
   */
  getPortMetadata(blockId: string, portName: string): EdgeMetadata | undefined {
    return this.portToSlotMap.get(`${blockId}:${portName}`);
  }

  /**
   * Get edge metadata (cardinality, slot, type) without querying value.
   * Used by UI to determine whether to track a field before polling.
   */
  getEdgeMetadata(edgeId: string): EdgeMetadata | undefined {
    return this.edgeToSlotMap.get(edgeId);
  }

  /**
   * Get temporal history for a field slot.
   * Returns undefined if slot is not tracked or has no accumulator.
   */
  getFieldHistory(slotId: ValueSlot): FieldHistoryView | undefined {
    return this.fieldAccumulators.get(slotId)?.getHistory();
  }

  /**
   * Get instance-0 sparkline history for a field slot.
   * Returns undefined if slot is not tracked or has no accumulator.
   */
  getFieldInstanceHistory(slotId: ValueSlot): HistoryView | undefined {
    return this.fieldAccumulators.get(slotId)?.getInstanceHistory();
  }

  /**
   * Get buffer history (2D time×instance) for a field slot.
   * Used by RasterHeatmap visualization.
   * Returns undefined if slot is not tracked or has no accumulator.
   */
  getFieldBufferHistory(slotId: ValueSlot): BufferHistoryView | undefined {
    return this.fieldAccumulators.get(slotId)?.getBufferHistory();
  }

  /**
   * Clear all stored data.
   * Called when patch is unloaded or recompiled.
   */
  clear(): void {
    this.edgeToSlotMap.clear();
    this.portToSlotMap.clear();
    this.scalarValues.clear();
    this.scalarTapSlots.clear();
    this.fieldBuffers.clear();
    this.fieldTapSlots.clear();
    this.trackedFieldSlots.clear();
    this.trackedFieldSlotRefs.clear();
    this.trackedHistoryRefs.clear();
    this.globalHistoryKeys.clear();
    this.fieldAccumulators.clear();
    this.unmappedEdges = [];
    this.blockDisplayNames.clear();
    this.runtimeStarted = false;
    this.arenaRef = null;
    this.historyService.clear();
    this.clearIssues();
  }

  /**
   * Build desired global tracking sets and reconcile with current tracking state.
   */
  private syncGlobalDebugTracking(): void {
    const desiredHistory = new Map<string, DebugTargetKey>();

    if (this.autoTrackAllDebugData) {
      for (const [edgeId, meta] of this.edgeToSlotMap) {
        if (this.isScalarHistoryEligible(meta.type)) {
          const key: DebugTargetKey = { kind: 'edge', edgeId };
          desiredHistory.set(serializeKey(key), key);
        }
      }

      for (const [portKey, meta] of this.portToSlotMap) {
        if (this.isScalarHistoryEligible(meta.type)) {
          const parsed = this.parseDebugPortKey(portKey);
          if (parsed) {
            const key: DebugTargetKey = { kind: 'port', blockId: parsed.blockId, portName: parsed.portName };
            desiredHistory.set(serializeKey(key), key);
          }
        }
      }
    }

    for (const [serialized, key] of desiredHistory) {
      if (this.globalHistoryKeys.has(serialized)) continue;
      this.globalHistoryKeys.set(serialized, key);
      if ((this.trackedHistoryRefs.get(serialized) ?? 0) === 0) {
        this.historyService.track(key);
      }
    }

    for (const [serialized, key] of Array.from(this.globalHistoryKeys.entries())) {
      if (desiredHistory.has(serialized)) continue;
      this.globalHistoryKeys.delete(serialized);
      if ((this.trackedHistoryRefs.get(serialized) ?? 0) === 0) {
        this.historyService.untrack(key);
      }
    }
  }

  /**
   * Scalar history supports one-cardinality sampleable payloads only.
   */
  private isScalarHistoryEligible(type: CanonicalType): boolean {
    const cardinality = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (cardinality !== 'one') return false;
    return getSampleEncoding(type.payload).sampleable;
  }

  /**
   * Parse debug port key `${blockId}:${portName}` from the right.
   */
  private parseDebugPortKey(portKey: string): { blockId: string; portName: string } | null {
    const idx = portKey.lastIndexOf(':');
    if (idx <= 0 || idx >= portKey.length - 1) return null;
    return {
      blockId: portKey.slice(0, idx),
      portName: portKey.slice(idx + 1),
    };
  }

  private recordIssue(issue: DebugServiceIssue): void {
    const throttleKey = `${issue.source}:${issue.key ?? issue.message}`;
    const now = Date.now();
    const last = this.issueThrottle.get(throttleKey) ?? 0;
    if (now - last < ISSUE_THROTTLE_MS) {
      return;
    }
    this.issueThrottle.set(throttleKey, now);

    this.issues.push(issue);
    if (this.issues.length > MAX_DEBUG_ISSUES) {
      this.issues.splice(0, this.issues.length - MAX_DEBUG_ISSUES);
    }

    try {
      this.issueReporter?.(issue);
    } catch (reporterError) {
      this.issues.push({
        level: 'error',
        source: 'reporter',
        message: 'DebugService issue reporter failed',
        detail: reporterError,
      });
      if (this.issues.length > MAX_DEBUG_ISSUES) {
        this.issues.splice(0, this.issues.length - MAX_DEBUG_ISSUES);
      }
    }
  }

  // ===========================================================================
  // Private Query Helpers
  // ===========================================================================

  private queryScalarValue(meta: EdgeMetadata): ScalarValueResult | undefined {
    // [LAW:one-source-of-truth] Arena is the canonical value source post-zdru.1.
    // Read directly from arena when available and the slot has a valid descriptor.
    if (this.arenaRef) {
      const desc = this.arenaRef.slotToArena.get(meta.slotId);
      if (desc && desc.offset >= 0) {
        if (!this.runtimeStarted) return undefined;
        const value = arenaRead(this.arenaRef.arena, desc, 0, 0);
        // Backfill history from queried arena values when runtime tap doesn't write this slot.
        // [LAW:single-enforcer] HistoryService remains the single history storage path.
        if (!this.scalarTapSlots.has(meta.slotId)) {
          this.historyService.onSlotWrite(meta.slotId, value);
        }
        return { kind: 'scalar', value, slotId: meta.slotId, type: meta.type };
      }
    }
    // Fallback: read from scalar write snapshots (stepped/debug snapshots).
    const value = this.scalarValues.get(meta.slotId);
    if (value === undefined) {
      if (!this.runtimeStarted) {
        return undefined;
      }
      throw new Error(
        `[DebugService.getEdgeValue] Slot ${meta.slotId} has no value. ` +
        `Runtime has started but this slot was never written to - this is a scheduling bug.`
      );
    }
    return { kind: 'scalar', value, slotId: meta.slotId, type: meta.type };
  }

  private queryFieldValue(meta: EdgeMetadata): FieldValueResult | FieldUntrackedResult | undefined {
    // If not tracked, return untracked result (no throw)
    if (!this.trackedFieldSlots.has(meta.slotId)) {
      return { kind: 'field-untracked', slotId: meta.slotId, type: meta.type };
    }

    // [LAW:one-source-of-truth] Arena is the canonical value source post-zdru.2.
    // Zero-copy view into the arena — always current without a per-query copy.
    if (this.arenaRef) {
      const desc = this.arenaRef.slotToArena.get(meta.slotId);
      if (desc && desc.offset >= 0) {
        if (!this.runtimeStarted) return undefined;
        const buffer = arenaDecodeToAoS(this.arenaRef.arena, desc);
        // Backfill accumulator histories from queried arena values when runtime tap
        // doesn't write this field slot (common for derived/arena-only paths).
        if (!this.fieldTapSlots.has(meta.slotId)) {
          const fallbackAcc = this.fieldAccumulators.get(meta.slotId);
          if (fallbackAcc) {
            const stride = fallbackAcc.stride as number;
            const count = stride > 0 ? buffer.length / stride : 0;
            fallbackAcc.update(buffer, count);
          }
        }
        const acc = this.fieldAccumulators.get(meta.slotId);
        const stats: AggregateFieldStats = acc
          ? acc.getAccumulatedStats()
          : { count: 0, stride: 0 as Stride, min: new Float32Array(4), max: new Float32Array(4), mean: new Float32Array(4) };
        return { kind: 'field', stats, buffer, slotId: meta.slotId, type: meta.type };
      }
    }

    // Fallback: read from field write snapshots (stepped/debug snapshots).
    const buffer = this.fieldBuffers.get(meta.slotId);
    if (!buffer) {
      if (!this.runtimeStarted) {
        return undefined;
      }
      throw new Error(
        `[DebugService.getEdgeValue] Slot ${meta.slotId} is a tracked field but has no value. ` +
        `Runtime has started but this slot was never written to - this is a scheduling bug.`
      );
    }

    // Read accumulated stats from accumulator (or fallback to zeros)
    const acc = this.fieldAccumulators.get(meta.slotId);
    const stats: AggregateFieldStats = acc
      ? acc.getAccumulatedStats()
      : { count: 0, stride: 0 as Stride, min: new Float32Array(4), max: new Float32Array(4), mean: new Float32Array(4) };

    return {
      kind: 'field',
      stats,
      buffer,
      slotId: meta.slotId,
      type: meta.type,
    };
  }
}

/**
 * Singleton instance.
 * Exported for use by compiler, runtime, and UI.
 */
export const debugService = new DebugService();
