import React from 'react';
import type { PayloadFixture } from '../render/rust/fixtures';

interface FixtureSelectorProps {
  fixtures: readonly PayloadFixture[];
  onSelect: (fixture: PayloadFixture) => void;
}

export const FixtureSelector: React.FC<FixtureSelectorProps> = ({ fixtures, onSelect }) => {
  return (
    <div style={{ padding: 8, fontSize: 13 }}>
      <div style={{
        marginBottom: 8,
        fontWeight: 600,
        color: '#aaa',
        textTransform: 'uppercase',
        fontSize: 11,
        letterSpacing: 0.5,
      }}>
        Fixtures
      </div>
      {fixtures.map((fixture) => (
        <button
          key={fixture.id}
          onClick={() => onSelect(fixture)}
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
