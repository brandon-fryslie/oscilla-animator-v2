/**
 * Payload Tester Layout
 *
 * A dedicated dockview layout for the WASM renderer payload tester.
 * Shows only: fixture selector (left), payload editor (center-left),
 * preview canvas (center-right), and diagnostic console (bottom).
 *
 * No patch editor, block library, graph, or settings.
 */

import type { DockviewApi } from 'dockview';

export function createPayloadTesterLayout(api: DockviewApi): void {
  // Left: fixture selector (narrow)
  const fixtureGroup = api.addGroup();
  api.addPanel({
    id: 'fixture-selector',
    component: 'fixture-selector',
    title: 'Fixtures',
    position: {
      referenceGroup: fixtureGroup.id,
      direction: 'within',
    },
  });

  // Center: payload editor + preview side by side (even split)
  const editorGroup = api.addGroup({
    referenceGroup: fixtureGroup,
    direction: 'right',
  });
  api.addPanel({
    id: 'payload-editor',
    component: 'payload-editor',
    title: 'Payload Editor',
    position: {
      referenceGroup: editorGroup.id,
      direction: 'within',
    },
    minimumWidth: 300,
  });

  const previewGroup = api.addGroup({
    referenceGroup: editorGroup,
    direction: 'right',
  });
  api.addPanel({
    id: 'preview',
    component: 'preview',
    title: 'Preview',
    position: {
      referenceGroup: previewGroup.id,
      direction: 'within',
    },
    minimumWidth: 200,
    minimumHeight: 200,
  });

  // Bottom: diagnostic console (full width)
  const bottomGroup = api.addGroup({
    referenceGroup: editorGroup,
    direction: 'below',
  });
  api.addPanel({
    id: 'diagnostic-console',
    component: 'diagnostic-console',
    title: 'Console',
    position: {
      referenceGroup: bottomGroup.id,
      direction: 'within',
    },
  });

  // Size constraints
  fixtureGroup.api.setConstraints({ minimumWidth: 180, maximumWidth: 300 });
  fixtureGroup.api.setSize({ width: 220 });
  bottomGroup.api.setSize({ height: 200 });
}

/**
 * Check if the current URL requests the payload tester layout.
 * Usage: navigate to ?layout=payload-tester
 */
export function isPayloadTesterLayoutRequested(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('layout') === 'payload-tester';
}
