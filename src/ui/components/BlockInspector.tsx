/**
 * BlockInspector — the dockview inspector panel, reseated onto the SelectionDetail seam.
 *
 * The rich block/edge/port/type-preview rendering that used to live here (reading
 * the V1 patch, the frontend result snapshot, and the block registry directly) now
 * lives in the ONE neutral `SelectionDetailView`, fed by whichever era's
 * `SelectionDetail` provider is in scope (V1 in this boot, scene in the native
 * boot). This panel is a thin mount, so the same inspector lights up in both boots
 * and holds no era opinion. [LAW:one-source-of-truth]
 */

import React from 'react';
import { SelectionDetailView } from '../graphEditor/SelectionDetailView';

export function BlockInspector() {
  return <SelectionDetailView />;
}
