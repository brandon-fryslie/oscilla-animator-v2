import { describe, expect, it } from 'vitest';
import { ClipboardStore } from '../ClipboardStore';
import type { GraphClipboard } from '../../ui/graphEditor/graph-clipboard';

const EMPTY: GraphClipboard = { blocks: [], edges: [] };

describe('ClipboardStore paste count', () => {
  it('commit advances the count, copy resets it', () => {
    const store = new ClipboardStore();
    store.copy(EMPTY);
    expect(store.pasteCount).toBe(0);

    store.commitPaste();
    store.commitPaste();
    expect(store.pasteCount).toBe(2);

    // Copying fresh content restarts the cascade — the caller (handlePaste) only
    // commits after a successful paste, so a failed paste leaves the count put.
    store.copy(EMPTY);
    expect(store.pasteCount).toBe(0);
  });
});
