import React, { useEffect } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { observer } from 'mobx-react-lite';
import type { BlockId } from '../../../types';
import { useStores } from '../../../stores';
import { ExpressionEditorWorkbench } from '../../components/ExpressionEditorWorkbench';

export interface ExpressionEditorPanelParams {
  readonly blockId?: string;
}

export const ExpressionEditorPanel: React.FC<IDockviewPanelProps<ExpressionEditorPanelParams>> = observer(function ExpressionEditorPanel({
  params,
}) {
  const { expressionEditor } = useStores();

  useEffect(() => {
    if (params?.blockId) {
      expressionEditor.openForBlock(params.blockId as BlockId);
    }
  }, [params?.blockId, expressionEditor]);

  return <ExpressionEditorWorkbench blockId={expressionEditor.activeBlockId} />;
});
