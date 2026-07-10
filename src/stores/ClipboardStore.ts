/**
 * ClipboardStore — the editor's one clipboard buffer, era-neutral.
 *
 * Holds the last-copied selection as a portable GraphClipboard (neutral adapter
 * vocabulary), so a copy in one canvas can be pasted in another and the buffer
 * survives dockview panel remounts. Owned by RootStore — a single owner with an
 * explicit API, never a module-level global. [LAW:no-shared-mutable-globals]
 *
 * This holds only era-neutral STATE: the payload and how many times it has been
 * pasted. Turning a selection into a payload, a payload back into blocks, and the
 * paste OFFSET geometry all live in the UI's graph-clipboard module — presentation
 * concerns that must not create a stores→UI dependency. [LAW:one-way-deps] [LAW:decomposition]
 */

import { makeObservable, observable, action } from 'mobx';
import type { GraphClipboard } from '../ui/graphEditor/graph-clipboard';

export class ClipboardStore {
  /** The last-copied selection, or null when the clipboard is empty. */
  content: GraphClipboard | null = null;

  /**
   * How many times the current content has been pasted; resets on copy. The UI maps
   * this to the cascading paste offset, so repeated pastes don't stack on one spot.
   */
  pasteCount = 0;

  constructor() {
    makeObservable(this, {
      content: observable.ref,
      pasteCount: observable,
      copy: action,
      commitPaste: action,
    });
  }

  /** Replace the buffer and restart the paste cascade. */
  copy(content: GraphClipboard): void {
    this.content = content;
    this.pasteCount = 0;
  }

  /** Record a successful paste, advancing the cascade. */
  commitPaste(): void {
    this.pasteCount += 1;
  }
}
