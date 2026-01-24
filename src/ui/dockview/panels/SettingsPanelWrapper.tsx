/**
 * SettingsPanelWrapper - Dockview Panel Wrapper for Settings
 *
 * Wraps SettingsPanel for use in Dockview.
 * The same SettingsPanel component is also used in the Toolbar drawer.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { SettingsPanel } from '../../components/SettingsPanel';

export const SettingsPanelWrapper: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <SettingsPanel />
    </div>
  );
};
