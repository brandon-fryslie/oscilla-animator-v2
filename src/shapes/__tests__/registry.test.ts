import { describe, it, expect } from 'vitest';
import {
  registerDynamicTopology,
  exportSerializableTopologies,
  exportTopologyBankU32,
  TopologyBankFlag,
  TOPOLOGY_BANK_WORDS,
  getTopologyRegistryRevision,
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

describe('shapes/registry topology bank export', () => {
  it('exports packed 8-word headers + payload heap from the canonical topology registry', () => {
    const id = registerDynamicTopology(makePathTopology(9, true), 'shape-topology-bank');
    const bank = exportTopologyBankU32([id]);

    expect(bank.wordsPerRecord).toBe(TOPOLOGY_BANK_WORDS);
    expect(bank.ids).toEqual([id]);
    expect(bank.headers.length).toBe(TOPOLOGY_BANK_WORDS);
    expect(bank.payload.length).toBe(9);
    expect(bank.payloadWordStart).toBe(TOPOLOGY_BANK_WORDS);
    expect(bank.data.length).toBe(TOPOLOGY_BANK_WORDS + 9);
    expect(bank.headers[0]).toBe(9); // vertexCount
    expect(bank.headers[1]).toBe(9); // indexCount
    expect(bank.headers[2]).toBe(TOPOLOGY_BANK_WORDS); // absolute payload start
    expect(bank.headers[3]).toBe(0); // baseVertex
    expect(bank.headers[4]).toBe(TopologyBankFlag.IsPath | TopologyBankFlag.Closed);
    expect(Array.from(bank.payload)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(bank.indexById.get(id)).toBe(0);
    expect(bank.revision).toBe(getTopologyRegistryRevision());
  });
});
