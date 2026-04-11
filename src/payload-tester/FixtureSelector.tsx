import React, { useState } from 'react';
import type { PayloadFixture } from '../render/rust/fixtures';

interface FixtureSelectorProps {
  fixtures: readonly PayloadFixture[];
  initialSelectedId?: string;
  onSelect: (fixture: PayloadFixture) => void;
}

export const FixtureSelector: React.FC<FixtureSelectorProps> = ({ fixtures, initialSelectedId, onSelect }) => {
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? fixtures[0]?.id);

  const handleSelect = (fixture: PayloadFixture) => {
    setSelectedId(fixture.id);
    onSelect(fixture);
  };

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
          onClick={() => handleSelect(fixture)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            marginBottom: 4,
            background: fixture.id === selectedId ? '#2a2a3a' : 'transparent',
            border: fixture.id === selectedId ? '1px solid #667' : '1px solid #333',
            borderRadius: 4,
            color: fixture.id === selectedId ? '#eee' : '#ccc',
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
