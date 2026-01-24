/**
 * Editor Settings
 *
 * Settings for the flow editor (React Flow).
 */

import { defineSettings } from '../defineSettings';

export interface EditorSettings extends Record<string, unknown> {
  showMinimap: boolean;
}

export const editorSettings = defineSettings<EditorSettings>('editor', {
  defaults: {
    showMinimap: true,
  },
  ui: {
    label: 'Editor',
    description: 'Flow editor settings',
    order: 20,
    fields: {
      showMinimap: {
        label: 'Show Minimap',
        description: 'Display minimap in bottom-right of flow editor',
        control: 'toggle',
      },
    },
  },
});
