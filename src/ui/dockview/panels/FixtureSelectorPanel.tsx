/**
 * Fixture Selector Panel
 *
 * Lists available payload fixtures for the payload tester.
 * Clicking a fixture fires a custom event that the PayloadEditorPanel listens for.
 */

import React, { useCallback } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { PAYLOAD_FIXTURES, type PayloadFixture } from '../../../render/rust/fixtures';

/** Custom event for fixture selection, consumed by PayloadEditorPanel. */
export const FIXTURE_SELECTED_EVENT = 'payload-tester:fixture-selected';

export function dispatchFixtureSelected(fixture: PayloadFixture): void {
  window.dispatchEvent(
    new CustomEvent(FIXTURE_SELECTED_EVENT, { detail: fixture })
  );
}

export const FixtureSelectorPanel: React.FC<IDockviewPanelProps> = () => {
  const handleClick = useCallback((fixture: PayloadFixture) => {
    dispatchFixtureSelected(fixture);
  }, []);

  return (
    <div style={{ padding: 8, height: '100%', overflow: 'auto', fontSize: 13 }}>
      <div style={{ marginBottom: 8, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>
        Fixtures
      </div>
      {PAYLOAD_FIXTURES.map((fixture) => (
        <button
          key={fixture.id}
          onClick={() => handleClick(fixture)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            marginBottom: 4,
            background: 'transparent',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#ccc',
            cursor: 'pointer',
            fontSize: 12,
          }}
          title={fixture.description}
        >
          <div style={{ fontWeight: 500 }}>{fixture.name}</div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{fixture.description}</div>
        </button>
      ))}
    </div>
  );
};
