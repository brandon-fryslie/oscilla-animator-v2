/**
 * InspectorExpressionField — the era-specific realization of an `expression`
 * config field for the neutral inspector.
 *
 * The SelectionDetail seam projects an expression block's body as a neutral
 * `ConfigField` of kind `expression` (blockId + value). Rendering it needs the
 * rich `SharedExpressionEditor` (autocomplete over the live V1 patch), which is
 * irreducibly V1-coupled — a React editor cannot live inside the pure detail
 * provider. So the neutral view mounts THIS leaf for an expression field; it pulls
 * the V1 patch itself, exactly as V1EdgeDecorator legitimately holds the lens
 * surface behind its seam. The pillar provider emits no expression fields, so this
 * never renders in the native boot. Full expression-editor disposition is owned by
 * the expression-editor ticket (editor-ux .12); this preserves V1 today.
 * [LAW:decomposition]
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { SharedExpressionEditor } from './SharedExpressionEditor';
import type { BlockId } from '../../types';

export const InspectorExpressionField = observer(function InspectorExpressionField({
  blockId,
  value,
}: {
  blockId: string;
  value: string;
}) {
  const { patch } = useStores();
  return (
    <SharedExpressionEditor
      blockId={blockId as BlockId}
      value={value}
      patch={patch.patch}
      showPopOutButton
      maxLength={4000}
    />
  );
});
