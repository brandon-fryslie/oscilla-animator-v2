/**
 * Composite HCL Round-Trip Tests
 *
 * Validates that CompositeBlockDef → HCL → CompositeBlockDef preserves fidelity.
 * Tests all library composites + edge cases.
 */

import { describe, it, expect } from 'vitest';
import { serializeCompositeToHCL } from '../composite-serialize';
import { deserializeCompositeFromHCL } from '../composite-deserialize';
import type { CompositeBlockDef } from '../../blocks/composite-types';
import { internalBlockId } from '../../blocks/composite-types';
import {
  SmoothNoiseComposite,
  PingPongComposite,
  ColorCycleComposite,
  DelayedTriggerComposite,
} from '../../blocks/composites/library';

/**
 * Compare two CompositeBlockDefs for structural equality.
 * Ignores inputs/outputs (computed fields) and readonly (runtime metadata).
 * Normalizes displayName (undefined === blockId as string).
 */
function compositeDefsEqual(a: CompositeBlockDef, b: CompositeBlockDef): boolean {
  if (a.type !== b.type) return false;
  if (a.label !== b.label) return false;
  if (a.category !== b.category) return false;
  if (a.description !== b.description) return false;
  if (a.capability !== b.capability) return false;

  // Compare internal blocks
  if (a.internalBlocks.size !== b.internalBlocks.size) return false;
  for (const [id, blockA] of a.internalBlocks) {
    const blockB = b.internalBlocks.get(id);
    if (!blockB) return false;
    if (blockA.type !== blockB.type) return false;
    if (JSON.stringify(blockA.params) !== JSON.stringify(blockB.params)) return false;

    // Normalize displayName: undefined is equivalent to blockId as string
    const displayNameA = blockA.displayName ?? (id as string);
    const displayNameB = blockB.displayName ?? (id as string);
    if (displayNameA !== displayNameB) return false;
  }

  // Compare internal edges
  if (a.internalEdges.length !== b.internalEdges.length) return false;
  const sortedA = [...a.internalEdges].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  const sortedB = [...b.internalEdges].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  for (let i = 0; i < sortedA.length; i++) {
    if (JSON.stringify(sortedA[i]) !== JSON.stringify(sortedB[i])) return false;
  }

  // Compare exposed inputs
  if (a.exposedInputs.length !== b.exposedInputs.length) return false;
  const sortedInputsA = [...a.exposedInputs].sort((x, y) => x.externalId.localeCompare(y.externalId));
  const sortedInputsB = [...b.exposedInputs].sort((x, y) => x.externalId.localeCompare(y.externalId));
  for (let i = 0; i < sortedInputsA.length; i++) {
    const ia = sortedInputsA[i];
    const ib = sortedInputsB[i];
    if (ia.externalId !== ib.externalId) return false;
    if (ia.externalLabel !== ib.externalLabel) return false;
    if (ia.internalBlockId !== ib.internalBlockId) return false;
    if (ia.internalPortId !== ib.internalPortId) return false;
  }

  // Compare exposed outputs
  if (a.exposedOutputs.length !== b.exposedOutputs.length) return false;
  const sortedOutputsA = [...a.exposedOutputs].sort((x, y) => x.externalId.localeCompare(y.externalId));
  const sortedOutputsB = [...b.exposedOutputs].sort((x, y) => x.externalId.localeCompare(y.externalId));
  for (let i = 0; i < sortedOutputsA.length; i++) {
    const oa = sortedOutputsA[i];
    const ob = sortedOutputsB[i];
    if (oa.externalId !== ob.externalId) return false;
    if (oa.externalLabel !== ob.externalLabel) return false;
    if (oa.internalBlockId !== ob.internalBlockId) return false;
    if (oa.internalPortId !== ob.internalPortId) return false;
  }

  return true;
}

describe('Composite Serializer', () => {
  it('emits composite header with type', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('composite "SmoothNoise" {');
  });

  it('emits metadata attributes', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('label = "Smooth Noise"');
    expect(hcl).toContain('category = "composite"');
    expect(hcl).toContain('capability = "state"');
    expect(hcl).toContain('description = "Smooth random values - Noise filtered through Lag for organic modulation"');
  });

  it('emits internal blocks with types and displayNames', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('block "Noise" "noise"');
    expect(hcl).toContain('block "Lag" "lag"');
  });

  it('emits internal block params', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('smoothing = 0.9');
  });

  it('emits internal edges as outputs {}', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('outputs {');
    // The edge is from noise.out to lag.target
    expect(hcl).toContain('out = lag.target');
  });

  it('emits expose_input blocks', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('expose_input "x" {');
    expect(hcl).toContain('block = "noise"');
    expect(hcl).toContain('port = "x"');
    expect(hcl).toContain('label = "X"');
  });

  it('emits expose_output blocks', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    expect(hcl).toContain('expose_output "out" {');
    expect(hcl).toContain('block = "lag"');
    expect(hcl).toContain('port = "out"');
    expect(hcl).toContain('label = "Output"');
  });

  it('sorts blocks by ID for determinism', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    const lagIdx = hcl.indexOf('block "Lag"');
    const noiseIdx = hcl.indexOf('block "Noise"');
    // lag comes before noise alphabetically
    expect(lagIdx).toBeLessThan(noiseIdx);
  });
});

describe('Composite Deserializer', () => {
  it('parses composite header', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors).toHaveLength(2); // No blocks, no outputs
    expect(result.def).not.toBeNull();
    expect(result.def?.type).toBe('TestComp');
  });

  it('rejects patch header', () => {
    const hcl = `
      patch "NotAComposite" {
        block "Const" "c" {}
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('composite');
  });

  it('requires label attribute', () => {
    const hcl = `
      composite "TestComp" {
        category = "test"
        capability = "pure"
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.def).toBeNull();
    expect(result.errors.some(e => e.message.includes('label'))).toBe(true);
  });

  it('parses internal blocks', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"

        block "Const" "c1" {
          value = 42
        }

        expose_output "out" {
          block = "c1"
          port = "out"
        }
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.def?.internalBlocks.size).toBe(1);
    const block = result.def?.internalBlocks.get(internalBlockId('c1'));
    expect(block?.type).toBe('Const');
    expect(block?.params?.value).toBe(42);
  });

  it('parses internal edges from outputs', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"

        block "Const" "c1" {
          outputs {
            out = c2.in
          }
        }

        block "Const" "c2" {}

        expose_output "out" {
          block = "c2"
          port = "out"
        }
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.def?.internalEdges.length).toBe(1);
    expect(result.def?.internalEdges[0].fromBlock).toBe(internalBlockId('c1'));
    expect(result.def?.internalEdges[0].fromPort).toBe('out');
    expect(result.def?.internalEdges[0].toBlock).toBe(internalBlockId('c2'));
    expect(result.def?.internalEdges[0].toPort).toBe('in');
  });

  it('parses expose_input blocks', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"

        block "Const" "c1" {}

        expose_input "value" {
          block = "c1"
          port = "value"
          label = "Input Value"
        }

        expose_output "out" {
          block = "c1"
          port = "out"
        }
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.def?.exposedInputs.length).toBe(1);
    expect(result.def?.exposedInputs[0].externalId).toBe('value');
    expect(result.def?.exposedInputs[0].externalLabel).toBe('Input Value');
    expect(result.def?.exposedInputs[0].internalBlockId).toBe(internalBlockId('c1'));
    expect(result.def?.exposedInputs[0].internalPortId).toBe('value');
  });

  it('parses expose_output blocks', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"

        block "Const" "c1" {}

        expose_output "result" {
          block = "c1"
          port = "out"
          label = "Result"
        }
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.def?.exposedOutputs.length).toBe(1);
    expect(result.def?.exposedOutputs[0].externalId).toBe('result');
    expect(result.def?.exposedOutputs[0].externalLabel).toBe('Result');
  });

  it('collects errors for unresolved block references', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"

        block "Const" "c1" {
          outputs {
            out = nonexistent.in
          }
        }

        expose_output "out" {
          block = "c1"
          port = "out"
        }
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('Unresolved'))).toBe(true);
  });

  it('validates at least one block', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors.some(e => e.message.includes('at least one internal block'))).toBe(true);
  });

  it('validates at least one exposed output', () => {
    const hcl = `
      composite "TestComp" {
        label = "Test"
        category = "test"
        capability = "pure"

        block "Const" "c1" {}
      }
    `;
    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors.some(e => e.message.includes('at least one exposed output'))).toBe(true);
  });
});

describe('Round-Trip: Library Composites', () => {
  it('SmoothNoise round-trips correctly', () => {
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(SmoothNoiseComposite, result.def!)).toBe(true);
  });

  it('PingPong round-trips correctly', () => {
    const hcl = serializeCompositeToHCL(PingPongComposite);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(PingPongComposite, result.def!)).toBe(true);
  });

  it('ColorCycle round-trips correctly', () => {
    const hcl = serializeCompositeToHCL(ColorCycleComposite);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(ColorCycleComposite, result.def!)).toBe(true);
  });

  it('DelayedTrigger round-trips correctly', () => {
    const hcl = serializeCompositeToHCL(DelayedTriggerComposite);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(DelayedTriggerComposite, result.def!)).toBe(true);
  });

  it('serialize → deserialize → serialize produces identical output', () => {
    const hcl1 = serializeCompositeToHCL(SmoothNoiseComposite);
    const result = deserializeCompositeFromHCL(hcl1);
    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();

    const hcl2 = serializeCompositeToHCL(result.def!);
    expect(hcl2).toBe(hcl1);
  });
});

describe('Round-Trip: Edge Cases', () => {
  it('handles composite with no description', () => {
    const def: CompositeBlockDef = {
      type: 'MinimalComp',
      form: 'composite',
      label: 'Minimal',
      category: 'test',
      capability: 'pure',
      internalBlocks: new Map([[internalBlockId('c'), { type: 'Const' }]]),
      internalEdges: [],
      exposedInputs: [],
      exposedOutputs: [
        {
          externalId: 'out',
          internalBlockId: internalBlockId('c'),
          internalPortId: 'out',
        },
      ],
      inputs: {},
      outputs: {},
    };

    const hcl = serializeCompositeToHCL(def);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(def, result.def!)).toBe(true);
  });

  it('handles empty params', () => {
    const def: CompositeBlockDef = {
      type: 'NoParams',
      form: 'composite',
      label: 'No Params',
      category: 'test',
      capability: 'pure',
      internalBlocks: new Map([
        [internalBlockId('c'), { type: 'Const', params: {} }],
      ]),
      internalEdges: [],
      exposedInputs: [],
      exposedOutputs: [
        {
          externalId: 'out',
          internalBlockId: internalBlockId('c'),
          internalPortId: 'out',
        },
      ],
      inputs: {},
      outputs: {},
    };

    const hcl = serializeCompositeToHCL(def);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
  });

  it('handles array params', () => {
    const def: CompositeBlockDef = {
      type: 'ArrayParam',
      form: 'composite',
      label: 'Array Param',
      category: 'test',
      capability: 'pure',
      internalBlocks: new Map([
        [internalBlockId('c'), { type: 'Const', params: { value: [1, 2, 3] } }],
      ]),
      internalEdges: [],
      exposedInputs: [],
      exposedOutputs: [
        {
          externalId: 'out',
          internalBlockId: internalBlockId('c'),
          internalPortId: 'out',
        },
      ],
      inputs: {},
      outputs: {},
    };

    const hcl = serializeCompositeToHCL(def);
    const result = deserializeCompositeFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(def, result.def!)).toBe(true);
  });

  it('handles fan-out edges (multiple targets from same port)', () => {
    const def: CompositeBlockDef = {
      type: 'FanOut',
      form: 'composite',
      label: 'Fan Out',
      category: 'test',
      capability: 'pure',
      internalBlocks: new Map([
        [internalBlockId('c'), { type: 'Const' }],
        [internalBlockId('a1'), { type: 'Add' }],
        [internalBlockId('a2'), { type: 'Add' }],
      ]),
      internalEdges: [
        {
          fromBlock: internalBlockId('c'),
          fromPort: 'out',
          toBlock: internalBlockId('a1'),
          toPort: 'a',
        },
        {
          fromBlock: internalBlockId('c'),
          fromPort: 'out',
          toBlock: internalBlockId('a2'),
          toPort: 'a',
        },
      ],
      exposedInputs: [],
      exposedOutputs: [
        {
          externalId: 'out1',
          internalBlockId: internalBlockId('a1'),
          internalPortId: 'out',
        },
      ],
      inputs: {},
      outputs: {},
    };

    const hcl = serializeCompositeToHCL(def);
    expect(hcl).toContain('[a1.a, a2.a]');

    const result = deserializeCompositeFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.def).not.toBeNull();
    expect(compositeDefsEqual(def, result.def!)).toBe(true);
  });
});

