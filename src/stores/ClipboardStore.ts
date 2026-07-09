/**
 * ClipboardStore — the editor's one clipboard buffer, era-neutral.
 *
 * Holds the last-copied selection as a portable GraphClipboard (neutral adapter
 * vocabulary), so a copy in one canvas can be pasted in another and the buffer
 * survives dockview panel remounts. Owned by RootStore — a single owner with an
 * explicit API, never a module-level global. [LAW:no-shared-mutable-globals]
 *
 * The clipboard only stores; it does not know how to read or write a graph. Turning
 * a selection into a payload and a payload back into blocks is graph-clipboard's
 * job, over the adapter seam. [LAW:decomposition]
 */

import { makeObservable, observable, action } from 'mobx';
import type { GraphClipboard } from '../ui/graphEditor/graph-clipboard';

/** Distance (graph units) each successive paste of one clipboard is nudged. */
const PASTE_STEP = 32;

export class ClipboardStore {
  /** The last-copied selection, or null when the clipboard is empty. */
  content: GraphClipboard | null = null;

  /** How many times the current content has been pasted; resets on copy. */
  private pasteCount = 0;

  constructor() {
    makeObservable(this, {
      content: observable.ref,
      copy: action,
    });
  }

  /** Replace the buffer and restart the paste cascade. */
  copy(content: GraphClipboard): void {
    this.content = content;
    this.pasteCount = 0;
  }

  /**
   * The uniform offset the NEXT paste should use, cascading so repeated pastes of the
   * same clipboard step away from each other instead of stacking on one spot. Pure —
   * reading it advances nothing; the caller calls `commitPaste` only once the paste
   * has actually succeeded, so a failed paste never skips a cascade step. [LAW:no-silent-failure]
   */
  pasteOffset(): { dx: number; dy: number } {
    const step = PASTE_STEP * (this.pasteCount + 1);
    return { dx: step, dy: step };
  }

  /** Advance the cascade after a successful paste. */
  commitPaste(): void {
    this.pasteCount += 1;
  }
}
