/**
 * RootStore - Store Composition
 *
 * Creates and owns all child stores.
 * Provides dependency injection (e.g., SelectionStore depends on PatchStore).
 * Single instance accessed via React context.
 *
 * Extended with EventHub and DiagnosticHub for event-driven diagnostics.
 */

import { reaction } from 'mobx';
import { configureMobX } from './configure';
import { PatchStore } from './PatchStore';
import { SelectionStore } from './SelectionStore';
import { ViewportStore } from './ViewportStore';
import { PlaybackStore } from './PlaybackStore';
import { DiagnosticsStore } from './DiagnosticsStore';
import { EventHub } from '../events/EventHub';
import { DiagnosticHub } from '../diagnostics/DiagnosticHub';

export class RootStore {
  readonly patch: PatchStore;
  readonly selection: SelectionStore;
  readonly viewport: ViewportStore;
  readonly playback: PlaybackStore;
  readonly diagnostics: DiagnosticsStore;
  readonly events: EventHub;

  // Patch revision tracking (for diagnostics)
  private patchRevision: number = 0;

  constructor() {
    // Configure MobX strict mode before creating stores
    configureMobX();

    // Create stores
    this.patch = new PatchStore();
    this.selection = new SelectionStore(this.patch); // Inject PatchStore dependency
    this.viewport = new ViewportStore();
    this.playback = new PlaybackStore();

    // Create EventHub
    this.events = new EventHub();

    // Create DiagnosticHub and DiagnosticsStore
    const diagnosticHub = new DiagnosticHub(
      this.events,
      'patch-0',
      () => this.patch.patch
    );
    this.diagnostics = new DiagnosticsStore(diagnosticHub);

    // Wire patch mutations to emit GraphCommitted events
    this.setupGraphCommittedEmission();
  }

  /**
   * Sets up MobX reaction to emit GraphCommitted events on patch changes.
   *
   * Strategy:
   * - Track block count and edge count as a proxy for mutations
   * - When either changes, emit GraphCommitted event
   * - Increment patchRevision counter
   *
   * Note: This is a simplified implementation for Sprint 1.
   * Future improvements:
   * - Track actual mutation types (add/remove/modify)
   * - Provide accurate diffSummary
   * - Identify affectedBlockIds
   */
  private setupGraphCommittedEmission(): void {
    reaction(
      () => ({
        blockCount: this.patch.blocks.size,
        edgeCount: this.patch.edges.length,
      }),
      () => {
        this.patchRevision++;
        this.events.emit({
          type: 'GraphCommitted',
          patchId: 'patch-0',
          patchRevision: this.patchRevision,
          reason: 'userEdit',
          diffSummary: {
            blocksAdded: 0, // TODO: Track actual changes in Sprint 2
            blocksRemoved: 0,
            edgesChanged: 0,
          },
        });
      }
    );
  }

  /**
   * Returns the current patch revision number.
   * Used by compiler and other systems for diagnostics scoping.
   */
  getPatchRevision(): number {
    return this.patchRevision;
  }
}
