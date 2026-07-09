import { describe, expect, it } from 'vitest';
import { ClipboardStore } from '../ClipboardStore';
import type { GraphClipboard } from '../../ui/graphEditor/graph-clipboard';

const EMPTY: GraphClipboard = { blocks: [], edges: [] };

describe('ClipboardStore paste cascade', () => {
  it('peeking the offset does not advance the cascade; only commit does', () => {
    const store = new ClipboardStore();
    store.copy(EMPTY);

    // Reading the offset twice without committing returns the SAME step — a paste
    // that threw (so never committed) must not skip a cascade step. [LAW:no-silent-failure]
    const first = store.pasteOffset();
    expect(store.pasteOffset()).toEqual(first);

    store.commitPaste();
    const second = store.pasteOffset();
    expect(second.dx).toBeGreaterThan(first.dx);
    expect(second.dy).toBeGreaterThan(first.dy);
  });

  it('copy restarts the cascade', () => {
    const store = new ClipboardStore();
    store.copy(EMPTY);
    const start = store.pasteOffset();
    store.commitPaste();
    store.commitPaste();
    expect(store.pasteOffset().dx).toBeGreaterThan(start.dx);

    store.copy(EMPTY);
    expect(store.pasteOffset()).toEqual(start);
  });
});
