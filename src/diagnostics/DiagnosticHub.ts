/**
 * Diagnostics System - DiagnosticHub
 *
 * Central state manager for diagnostics.
 *
 * Responsibilities:
 * - Subscribe to five core events (GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot)
 * - Maintain separate snapshots for compile/authoring/runtime diagnostics
 * - Provide query methods (getActive, getByRevision, etc.)
 * - Coordinate with authoring validators
 *
 * Snapshot Semantics:
 * - Compile snapshot: **Replaced** on CompileEnd (not merged!)
 * - Authoring snapshot: **Replaced** on GraphCommitted (after validators run)
 * - Runtime diagnostics: **Merged** on RuntimeHealthSnapshot (update counts/expiry)
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/13-event-diagnostics-integration.md
 */

import type { EventHub } from '../events/EventHub';
import type { Diagnostic, DiagnosticFilter } from './types';
import { runAuthoringValidators } from './validators/authoringValidators';

// =============================================================================
// DiagnosticHub Class
// =============================================================================

/**
 * DiagnosticHub manages all diagnostics for a single patch.
 *
 * Architecture:
 * - One DiagnosticHub per RootStore (per patch)
 * - Subscribes to EventHub on construction
 * - Maintains three separate diagnostic stores:
 *   1. Compile snapshots (Map<patchRevision, Diagnostic[]>)
 *   2. Authoring snapshot (Diagnostic[])
 *   3. Runtime diagnostics (Map<id, Diagnostic>)
 *
 * Query Methods:
 * - getActive(): Union of compile + authoring + runtime (for active revision)
 * - getByRevision(rev): Diagnostics for specific revision
 * - getCompileSnapshot(rev): Compile diagnostics only
 * - getAuthoringSnapshot(): Authoring diagnostics only
 */
export class DiagnosticHub {
  // =============================================================================
  // Private State
  // =============================================================================

  // Compile snapshots (keyed by patchRevision)
  private compileSnapshots = new Map<number, Diagnostic[]>();

  // Authoring snapshot (replaced on GraphCommitted)
  private authoringSnapshot: Diagnostic[] = [];

  // Runtime diagnostics (merged on RuntimeHealthSnapshot)
  // Sprint 1: Not fully implemented (deferred to Sprint 2)
  private runtimeDiagnostics = new Map<string, Diagnostic>();

  // Active revision tracking
  private activeRevision: number = 0;
  private pendingCompileRevision: number | null = null;

  // Diagnostics revision (incremented when diagnostic set changes)
  // Used by MobX to trigger reactivity
  private diagnosticsRevision: number = 0;

  // Event subscriptions (for cleanup)
  private unsubscribers: Array<() => void> = [];

  // Reference to patch (for authoring validators)
  private patchGetter: () => any; // Will be set to () => rootStore.patch

  // Callback to notify store of changes (for MobX reactivity)
  private onRevisionChange: (() => void) | null = null;

  // Callback for logging to DiagnosticsStore (for param flow visibility)
  private onLog: ((entry: { level: 'info' | 'warn' | 'error' | 'debug'; message: string }) => void) | null = null;

  // =============================================================================
  // Constructor
  // =============================================================================

  /**
   * Creates a DiagnosticHub and subscribes to EventHub.
   *
   * @param events EventHub instance
   * @param patchId Patch identifier
   * @param patchGetter Function to get current patch (for authoring validators)
   */
  constructor(
    events: EventHub,
    private readonly patchId: string,
    patchGetter: () => any
  ) {
    this.patchGetter = patchGetter;

    // Subscribe to five core events
    this.unsubscribers.push(
      events.on('GraphCommitted', (event) => this.handleGraphCommitted(event))
    );
    this.unsubscribers.push(
      events.on('CompileBegin', (event) => this.handleCompileBegin(event))
    );
    this.unsubscribers.push(
      events.on('CompileEnd', (event) => this.handleCompileEnd(event))
    );
    this.unsubscribers.push(
      events.on('ProgramSwapped', (event) => this.handleProgramSwapped(event))
    );
    this.unsubscribers.push(
      events.on('RuntimeHealthSnapshot', (event) => this.handleRuntimeHealthSnapshot(event))
    );

    // Subscribe to param flow visibility events
    this.unsubscribers.push(
      events.on('ParamChanged', (event) => this.handleParamChanged(event))
    );
    this.unsubscribers.push(
      events.on('BlockLowered', (event) => this.handleBlockLowered(event))
    );
  }

  // =============================================================================
  // Event Handlers (Five-Event Contract)
  // =============================================================================

  /**
   * Handles GraphCommitted event.
   *
   * Action:
   * - Run authoring validators
   * - Replace authoring snapshot
   * - Increment diagnostics revision
   */
  private handleGraphCommitted(event: {
    type: 'GraphCommitted';
    patchId: string;
    patchRevision: number;
  }): void {
    if (event.patchId !== this.patchId) {
      return;
    }

    // Run authoring validators
    const patch = this.patchGetter();
    const diagnostics = runAuthoringValidators(patch, event.patchRevision);

    // Replace authoring snapshot
    this.authoringSnapshot = diagnostics;

    // Increment revision to trigger UI updates
    this.incrementRevision();
  }

  /**
   * Handles CompileBegin event.
   *
   * Action:
   * - Set pendingCompileRevision
   */
  private handleCompileBegin(event: {
    type: 'CompileBegin';
    patchId: string;
    patchRevision: number;
  }): void {
    if (event.patchId !== this.patchId) {
      return;
    }

    this.pendingCompileRevision = event.patchRevision;
  }

  /**
   * Handles CompileEnd event.
   *
   * Action:
   * - **Replace** compile snapshot for this revision (not merge!)
   * - Increment diagnostics revision
   */
  private handleCompileEnd(event: {
    type: 'CompileEnd';
    patchId: string;
    patchRevision: number;
    diagnostics: readonly Diagnostic[];
  }): void {
    if (event.patchId !== this.patchId) {
      return;
    }

    // Replace compile snapshot (not merge!)
    this.compileSnapshots.set(event.patchRevision, [...event.diagnostics]);

    // Clear pending compile
    if (this.pendingCompileRevision === event.patchRevision) {
      this.pendingCompileRevision = null;
    }

    // Increment revision to trigger UI updates
    this.incrementRevision();
  }

  /**
   * Handles ProgramSwapped event.
   *
   * Action:
   * - Update activeRevision pointer
   * - Increment diagnostics revision
   */
  private handleProgramSwapped(event: {
    type: 'ProgramSwapped';
    patchId: string;
    patchRevision: number;
  }): void {
    if (event.patchId !== this.patchId) {
      return;
    }

    this.activeRevision = event.patchRevision;

    // Increment revision to trigger UI updates
    this.incrementRevision();
  }

  /**
   * Handles RuntimeHealthSnapshot event.
   *
   * Action:
   * - Merge runtime diagnostics (update counts, expiry)
   *
   * Sprint 1: Not fully implemented (deferred to Sprint 2).
   */
  private handleRuntimeHealthSnapshot(event: {
    type: 'RuntimeHealthSnapshot';
    diagnosticsDelta?: {
      raised: readonly Diagnostic[];
      resolved: readonly string[];
    };
  }): void {
    if (!event.diagnosticsDelta) return;

    // Add raised diagnostics
    for (const diag of event.diagnosticsDelta.raised) {
      this.runtimeDiagnostics.set(diag.id, diag);
    }

    // Remove resolved diagnostics
    for (const id of event.diagnosticsDelta.resolved) {
      this.runtimeDiagnostics.delete(id);
    }

    // Increment revision to trigger UI updates
    this.incrementRevision();
  }

  // =============================================================================
  // Param Flow Visibility Event Handlers
  // =============================================================================

  /**
   * Handles ParamChanged event.
   *
   * Action:
   * - Log to LogPanel for param flow visibility
   */
  private handleParamChanged(event: {
    type: 'ParamChanged';
    patchId: string;
    patchRevision: number;
    blockId: string;
    blockType: string;
    paramKey: string;
    oldValue: unknown;
    newValue: unknown;
  }): void {
    if (event.patchId !== this.patchId) return;

    // Format values for display
    const formatValue = (v: unknown): string => {
      if (typeof v === 'number') return v.toString();
      if (typeof v === 'string') return `"${v}"`;
      if (v === undefined) return 'undefined';
      if (v === null) return 'null';
      return JSON.stringify(v);
    };

    this.log({
      level: 'info',
      message: `[Param] ${event.blockType}#${event.blockId}.${event.paramKey}: ${formatValue(event.oldValue)} → ${formatValue(event.newValue)}`,
    });
  }

  /**
   * Handles BlockLowered event.
   *
   * Action:
   * - Log instance creation for compiler visibility
   */
  private handleBlockLowered(event: {
    type: 'BlockLowered';
    compileId: string;
    patchRevision: number;
    blockId: string;
    blockType: string;
    instanceId?: string;
    instanceCount?: number;
  }): void {
    // Only log for blocks that create instances (e.g., Array)
    if (event.instanceCount !== undefined) {
      this.log({
        level: 'info',
        message: `[Compiler] ${event.blockType}#${event.blockId} created instance ${event.instanceId || 'unknown'} with count=${event.instanceCount}`,
      });
    }
  }

  // =============================================================================
  // Query Methods
  // =============================================================================

  /**
   * Returns all active diagnostics (union of compile + authoring + runtime).
   *
   * "Active" means:
   * - Compile diagnostics for activeRevision (if available)
   * - OR compile diagnostics for pendingCompileRevision (if compile failed, no ProgramSwapped)
   * - Authoring diagnostics (always current)
   * - Runtime diagnostics (current session)
   *
   * Deduplicates by ID (compile diagnostics take precedence).
   */
  getActive(): Diagnostic[] {
    const result: Diagnostic[] = [];
    const seen = new Set<string>();

    // Add compile diagnostics for active revision
    let compileDiags = this.compileSnapshots.get(this.activeRevision);

    // If no diagnostics for active revision, check for failed compile at pending revision
    // This handles the case where compilation failed (no ProgramSwapped emitted)
    if (!compileDiags && this.pendingCompileRevision !== null) {
      compileDiags = this.compileSnapshots.get(this.pendingCompileRevision);
    }

    // Also check for the most recent compile snapshot if we still have nothing
    // This ensures compile errors are visible even if revision tracking is off
    if (!compileDiags && this.compileSnapshots.size > 0) {
      const maxRevision = Math.max(...this.compileSnapshots.keys());
      compileDiags = this.compileSnapshots.get(maxRevision);
    }

    if (compileDiags) {
      for (const diag of compileDiags) {
        result.push(diag);
        seen.add(diag.id);
      }
    }

    // Add authoring diagnostics (skip duplicates)
    for (const diag of this.authoringSnapshot) {
      if (!seen.has(diag.id)) {
        result.push(diag);
        seen.add(diag.id);
      }
    }

    // Add runtime diagnostics (skip duplicates)
    for (const diag of this.runtimeDiagnostics.values()) {
      if (!seen.has(diag.id)) {
        result.push(diag);
        seen.add(diag.id);
      }
    }

    return result;
  }

  /**
   * Returns diagnostics for a specific patch revision.
   *
   * @param patchRevision Patch revision number
   * @returns Diagnostics for that revision (compile + authoring if matching)
   */
  getByRevision(patchRevision: number): Diagnostic[] {
    const result: Diagnostic[] = [];
    const seen = new Set<string>();

    // Add compile diagnostics for this revision
    const compileDiags = this.compileSnapshots.get(patchRevision);
    if (compileDiags) {
      for (const diag of compileDiags) {
        result.push(diag);
        seen.add(diag.id);
      }
    }

    // Add authoring diagnostics if they match this revision
    for (const diag of this.authoringSnapshot) {
      if (diag.scope.patchRevision === patchRevision && !seen.has(diag.id)) {
        result.push(diag);
        seen.add(diag.id);
      }
    }

    return result;
  }

  /**
   * Returns compile diagnostics for a specific revision.
   *
   * @param patchRevision Patch revision number
   * @returns Compile diagnostics only (or empty array if none)
   */
  getCompileSnapshot(patchRevision: number): Diagnostic[] {
    return this.compileSnapshots.get(patchRevision) || [];
  }

  /**
   * Returns authoring diagnostics (always current).
   */
  getAuthoringSnapshot(): Diagnostic[] {
    return [...this.authoringSnapshot];
  }

  /**
   * Returns runtime diagnostics (current session).
   * Sprint 1: Not fully implemented (deferred to Sprint 2).
   */
  getRuntimeDiagnostics(): Diagnostic[] {
    return Array.from(this.runtimeDiagnostics.values());
  }

  /**
   * Returns diagnostics filtered by severity.
   *
   * @param severity Severity level to filter by
   * @returns Diagnostics with that severity
   */
  getBySeverity(severity: Diagnostic['severity']): Diagnostic[] {
    return this.filter(this.getActive(), { severity: [severity] });
  }

  /**
   * Returns diagnostics filtered by domain.
   *
   * @param domain Domain to filter by
   * @returns Diagnostics in that domain
   */
  getByDomain(domain: Diagnostic['domain']): Diagnostic[] {
    return this.filter(this.getActive(), { domain: [domain] });
  }

  /**
   * Filters diagnostics by criteria.
   *
   * @param diagnostics Diagnostics to filter
   * @param filter Filter criteria
   * @returns Filtered diagnostics
   */
  filter(diagnostics: Diagnostic[], filter: DiagnosticFilter): Diagnostic[] {
    return diagnostics.filter((diag) => {
      // Filter by severity
      if (filter.severity) {
        const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
        if (!severities.includes(diag.severity)) return false;
      }

      // Filter by domain
      if (filter.domain) {
        const domains = Array.isArray(filter.domain) ? filter.domain : [filter.domain];
        if (!domains.includes(diag.domain)) return false;
      }

      // Filter by code
      if (filter.code) {
        const codes = Array.isArray(filter.code) ? filter.code : [filter.code];
        if (!codes.includes(diag.code)) return false;
      }

      // Filter by target kind
      if (filter.targetKind && diag.primaryTarget.kind !== filter.targetKind) {
        return false;
      }

      // Filter by patch revision
      if (filter.patchRevision !== undefined && diag.scope.patchRevision !== filter.patchRevision) {
        return false;
      }

      return true;
    });
  }

  // =============================================================================
  // Revision Tracking (for MobX Reactivity)
  // =============================================================================

  /**
   * Returns the current diagnostics revision.
   * MobX will track this getter and trigger re-renders when it changes.
   */
  getDiagnosticsRevision(): number {
    return this.diagnosticsRevision;
  }

  /**
   * Increments the diagnostics revision.
   * Call this whenever the diagnostic set changes.
   */
  private incrementRevision(): void {
    this.diagnosticsRevision++;
    // Notify store of change for MobX reactivity
    if (this.onRevisionChange) {
      this.onRevisionChange();
    }
  }

  /**
   * Sets the callback to be called when diagnostics revision changes.
   * Used by DiagnosticsStore for MobX reactivity.
   */
  setOnRevisionChange(callback: () => void): void {
    this.onRevisionChange = callback;
  }

  /**
   * Sets the callback for logging to DiagnosticsStore.
   * Used for param flow visibility events.
   */
  setOnLog(callback: (entry: { level: 'info' | 'warn' | 'error' | 'debug'; message: string }) => void): void {
    this.onLog = callback;
  }

  /**
   * Logs an entry via the callback (if set).
   */
  private log(entry: { level: 'info' | 'warn' | 'error' | 'debug'; message: string }): void {
    if (this.onLog) {
      this.onLog(entry);
    }
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  /**
   * Disposes the hub and unsubscribes from events.
   */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }
}
