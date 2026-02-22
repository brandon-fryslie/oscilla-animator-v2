import { describe, it, expect } from 'vitest';
import {
  registerDynamicTopology,
  exportSerializableTopologies,
  installSerializableTopologies,
} from '../registry';
import { PathVerb } from '../types';

function makePathTopology(totalControlPoints: number, closed: boolean) {
  const verbs = closed
    ? [PathVerb.MOVE, PathVerb.LINE, PathVerb.CLOSE] as const
    : [PathVerb.MOVE, PathVerb.LINE] as const;
  const pointsPerVerb = closed
    ? [1, totalControlPoints - 1, 0] as const
    : [1, totalControlPoints - 1] as const;

  return {
    params: [] as const,
    verbs,
    pointsPerVerb,
    totalControlPoints,
    closed,
  };
}

describe('shapes/registry dynamic topology interning', () => {
  it('reuses the same ID for structurally identical topology definitions', () => {
    const topology = makePathTopology(4, true);
    const idA = registerDynamicTopology(topology, 'shape-a');
    const idB = registerDynamicTopology(topology, 'shape-b');
    expect(idB).toBe(idA);
  });

  it('allocates a new ID for a structurally different topology', () => {
    const idA = registerDynamicTopology(makePathTopology(4, true), 'shape-c');
    const idB = registerDynamicTopology(makePathTopology(5, true), 'shape-d');
    expect(idB).not.toBe(idA);
  });
});

describe('shapes/registry topology install/export sync', () => {
  it('exports and re-installs existing topology definitions without conflicts', () => {
    const id = registerDynamicTopology(makePathTopology(6, false), 'shape-e');
    const exported = exportSerializableTopologies([id]);
    expect(exported).toHaveLength(1);
    expect(() => installSerializableTopologies(exported)).not.toThrow();
  });

  it('throws on incompatible topology redefinition for the same ID', () => {
    const id = registerDynamicTopology(makePathTopology(7, false), 'shape-f');
    const incompatible = [{
      ...makePathTopology(8, false),
      id,
    }];
    expect(() => installSerializableTopologies(incompatible)).toThrow(
      `Topology ID collision with incompatible definitions: ${id}`,
    );
  });
});
