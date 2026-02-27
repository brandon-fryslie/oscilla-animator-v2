import { describe, it, expect } from 'vitest';
import {
  registerDynamicTopology,
  exportSerializableTopologies,
  exportTopologyBankU32,
  TopologyBankFlag,
  TopologyBankWord,
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
  it('exports packed u32 records from the canonical topology registry', () => {
    const id = registerDynamicTopology(makePathTopology(9, true), 'shape-topology-bank');
    const bank = exportTopologyBankU32([id]);

    expect(bank.wordsPerRecord).toBe(TOPOLOGY_BANK_WORDS);
    expect(bank.ids).toEqual([id]);
    expect(bank.data.length).toBe(TOPOLOGY_BANK_WORDS);
    expect(bank.data[0]).toBe(id);
    expect(bank.data[1]).toBe(3); // MOVE, LINE, CLOSE
    expect(bank.data[2]).toBe(9);
    expect(bank.data[3]).toBe(TopologyBankFlag.IsPath | TopologyBankFlag.Closed);
    expect(bank.indexById.get(id)).toBe(0);
    expect(bank.revision).toBe(getTopologyRegistryRevision());
  });

  it('keeps revision stable across export-only reads', () => {
    const id = registerDynamicTopology(makePathTopology(10, true), 'shape-topology-bank-revision-read');
    const revisionBefore = getTopologyRegistryRevision();
    const first = exportTopologyBankU32([id]);
    const second = exportTopologyBankU32([id]);

    expect(first.revision).toBe(revisionBefore);
    expect(second.revision).toBe(revisionBefore);
    expect(getTopologyRegistryRevision()).toBe(revisionBefore);
    expect(Array.from(second.data)).toEqual(Array.from(first.data));
  });

  it('bumps revision exactly on new topology registration and reflects it in bank export', () => {
    const revisionBefore = getTopologyRegistryRevision();
    // Use a structurally unique topology so registration cannot intern to an existing ID.
    const uniquePoints = revisionBefore + 1000;
    const id = registerDynamicTopology(makePathTopology(uniquePoints, false), 'shape-topology-bank-revision-bump');
    const revisionAfter = getTopologyRegistryRevision();
    const bank = exportTopologyBankU32([id]);

    expect(revisionAfter).toBe(revisionBefore + 1);
    expect(bank.revision).toBe(revisionAfter);
    expect(bank.data[TopologyBankWord.Id]).toBe(id);
    expect(bank.data[TopologyBankWord.TotalControlPoints]).toBe(uniquePoints);
  });
});
