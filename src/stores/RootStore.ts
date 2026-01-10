/**
 * RootStore - Store Composition
 *
 * Creates and owns all child stores.
 * Provides dependency injection (e.g., SelectionStore depends on PatchStore).
 * Single instance accessed via React context.
 */

import { configureMobX } from './configure';
import { PatchStore } from './PatchStore';
import { SelectionStore } from './SelectionStore';
import { ViewportStore } from './ViewportStore';
import { PlaybackStore } from './PlaybackStore';
import { DiagnosticsStore } from './DiagnosticsStore';

export class RootStore {
  readonly patch: PatchStore;
  readonly selection: SelectionStore;
  readonly viewport: ViewportStore;
  readonly playback: PlaybackStore;
  readonly diagnostics: DiagnosticsStore;

  constructor() {
    // Configure MobX strict mode before creating stores
    configureMobX();

    // Create stores
    this.patch = new PatchStore();
    this.selection = new SelectionStore(this.patch); // Inject PatchStore dependency
    this.viewport = new ViewportStore();
    this.playback = new PlaybackStore();
    this.diagnostics = new DiagnosticsStore();
  }
}
