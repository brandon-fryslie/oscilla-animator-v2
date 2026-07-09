/**
 * useGraphHistoryBinding — binds the active editor's adapter to the single
 * GraphHistoryStore for the lifetime of the editor mount.
 *
 * The history authority lives in RootStore, so it outlives the panel: when dockview
 * rearrangement recreates the adapter, this rebinds the new source under the SAME
 * model key and the undo stacks are kept. [LAW:one-source-of-truth]
 * [LAW:no-ambient-temporal-coupling]
 *
 * Only the two full-editor eras (V1 patch, pillar patch) bind. The composite editor
 * edits a different model with a restricted adapter that carries no history capability,
 * so it is intentionally not wired here.
 */

import { useEffect } from 'react';
import { useStores } from '../../stores';
import type { GraphSnapshotSource } from '../../stores/GraphHistoryStore';

/**
 * @param source the editor's data adapter, which also implements GraphSnapshotSource
 * @param key    the underlying model's stable identity; same key across a remount
 *               keeps the history, a different key starts fresh
 */
export function useGraphHistoryBinding(source: GraphSnapshotSource, key: object): void {
  const { history } = useStores();
  useEffect(() => {
    history.bind(source, key);
    return () => history.unbind(source);
  }, [history, source, key]);
}
