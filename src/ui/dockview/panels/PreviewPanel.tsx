/**
 * Preview Panel Wrapper
 *
 * Wraps CanvasTab for Dockview with canvas ready callback and external write bus.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { CanvasTab } from '../../components/app/CanvasTab';
import type { ExternalWriteBus } from '../../../runtime/ExternalChannel';

export const PreviewPanel: React.FC<IDockviewPanelProps<{
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  externalWriteBus?: ExternalWriteBus;
}>> = ({ params }) => {
  return (
    <CanvasTab
      onCanvasReady={params?.onCanvasReady}
      externalWriteBus={params?.externalWriteBus}
    />
  );
};
