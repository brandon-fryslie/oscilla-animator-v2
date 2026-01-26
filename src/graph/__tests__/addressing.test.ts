/**
 * Tests for Address Generation from Patch
 */

import { describe, it, expect } from 'vitest';
import {
  getBlockAddress,
  getOutputAddress,
  getInputAddress,
  getAllAddresses,
} from '../addressing';
import { buildPatch } from '../Patch';
import { blockId, portId } from '../../types';

// Import blocks to trigger registration
import '../../blocks/signal-blocks';

describe('getBlockAddress', () => {
  it('generates address from displayName', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const!' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);

    expect(addr).toEqual({
      kind: 'block',
      blockId: block.id,
      canonicalName: 'my_const', // Normalized
    });
  });

  it('falls back to blockId when displayName is null', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: null });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);

    expect(addr).toEqual({
      kind: 'block',
      blockId: block.id,
      canonicalName: block.id, // Fallback to blockId
    });
  });

  it('falls back to blockId when displayName is empty', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: '' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);

    expect(addr).toEqual({
      kind: 'block',
      blockId: block.id,
      canonicalName: block.id, // Empty displayName falls back to blockId
    });
  });

  it('handles displayName with special characters', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Block! (v2.0)' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);

    expect(addr.canonicalName).toBe('my_block_v20'); // Special chars stripped
  });

  it('handles displayName with hyphens and underscores', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'my-fancy_block' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);

    expect(addr.canonicalName).toBe('my-fancy_block'); // Preserved
  });
});

describe('getOutputAddress', () => {
  it('generates output address with displayName', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getOutputAddress(block, portId('out'));

    expect(addr).toEqual({
      kind: 'output',
      blockId: block.id,
      canonicalName: 'my_const',
      portId: 'out',
    });
  });

  it('falls back to blockId when displayName is null', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: null });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getOutputAddress(block, portId('out'));

    expect(addr.canonicalName).toBe(block.id);
  });

  it('handles port ID with underscores', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getOutputAddress(block, portId('out'));

    expect(addr.portId).toBe('out');
  });
});

describe('getInputAddress', () => {
  it('generates input address with displayName', () => {
    const patch = buildPatch(b => {
      b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getInputAddress(block, portId('freq'));

    expect(addr).toEqual({
      kind: 'input',
      blockId: block.id,
      canonicalName: 'my_osc',
      portId: 'freq',
    });
  });

  it('falls back to blockId when displayName is null', () => {
    const patch = buildPatch(b => {
      b.addBlock('Oscillator', {}, { displayName: null });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getInputAddress(block, portId('freq'));

    expect(addr.canonicalName).toBe(block.id);
  });
});

describe('getAllAddresses', () => {
  it('returns empty array for empty patch', () => {
    const patch = buildPatch(_b => {});
    const addresses = getAllAddresses(patch);

    expect(addresses).toEqual([]);
  });

  it('generates addresses for single block with ports', () => {
    const patch = buildPatch(b => {
      b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
    });

    const addresses = getAllAddresses(patch);

    // Should have 1 block address + N output addresses + M input addresses
    expect(addresses.length).toBeGreaterThan(1);

    // Check block address
    const blockAddr = addresses.find(a => a.kind === 'block');
    expect(blockAddr).toBeDefined();
    expect(blockAddr?.canonicalName).toBe('my_osc');

    // Check for some port addresses
    const outputAddrs = addresses.filter(a => a.kind === 'output');
    expect(outputAddrs.length).toBeGreaterThan(0);

    const inputAddrs = addresses.filter(a => a.kind === 'input');
    expect(inputAddrs.length).toBeGreaterThan(0);
  });

  it('generates addresses for multiple blocks', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'Const 1' });
      b.addBlock('Const', { value: 2 }, { displayName: 'Const 2' });
      b.addBlock('Oscillator', {}, { displayName: 'Osc' });
    });

    const addresses = getAllAddresses(patch);

    // Should have 3 block addresses + all their ports
    const blockAddrs = addresses.filter(a => a.kind === 'block');
    expect(blockAddrs).toHaveLength(3);

    // Check canonical names
    const canonicalNames = blockAddrs.map(a => a.canonicalName).sort();
    expect(canonicalNames).toEqual(['const_1', 'const_2', 'osc']);
  });

  it('generates deterministic addresses for same patch', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      b.addBlock('Oscillator', {}, { displayName: 'Osc' });
    });

    const addresses1 = getAllAddresses(patch);
    const addresses2 = getAllAddresses(patch);

    // Should generate identical addresses
    expect(addresses1).toEqual(addresses2);
  });

  it('includes all output ports', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addresses = getAllAddresses(patch);

    // Filter output addresses for this block
    const outputAddrs = addresses.filter(
      a => a.kind === 'output' && a.blockId === block.id
    );

    // Should match number of output ports
    expect(outputAddrs.length).toBe(block.outputPorts.size);

    // Check that all port IDs are present
    const portIds = new Set(outputAddrs.map(a => (a as any).portId));
    for (const portId of block.outputPorts.keys()) {
      expect(portIds.has(portId)).toBe(true);
    }
  });

  it('includes all input ports', () => {
    const patch = buildPatch(b => {
      b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addresses = getAllAddresses(patch);

    // Filter input addresses for this block
    const inputAddrs = addresses.filter(
      a => a.kind === 'input' && a.blockId === block.id
    );

    // Should match number of input ports
    expect(inputAddrs.length).toBe(block.inputPorts.size);

    // Check that all port IDs are present
    const portIds = new Set(inputAddrs.map(a => (a as any).portId));
    for (const portId of block.inputPorts.keys()) {
      expect(portIds.has(portId)).toBe(true);
    }
  });

  it('handles blocks without displayName', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: null });
      b.addBlock('Oscillator', {}, { displayName: 'Osc' });
    });

    const addresses = getAllAddresses(patch);
    const blockAddrs = addresses.filter(a => a.kind === 'block');

    // One should use blockId, one should use normalized displayName
    const canonicalNames = blockAddrs.map(a => a.canonicalName).sort();
    expect(canonicalNames).toContain('osc');
    // The other will be the blockId (e.g., 'b0')
    expect(canonicalNames.length).toBe(2);
  });

  it('preserves blockId in all generated addresses', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addresses = getAllAddresses(patch);

    // All addresses for this block should have the correct blockId
    for (const addr of addresses) {
      if ('blockId' in addr) {
        expect(addr.blockId).toBe(block.id);
      }
    }
  });
});
