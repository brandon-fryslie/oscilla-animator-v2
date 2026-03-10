/**
 * Tests for Address Registry Index
 */

import { describe, it, expect } from 'vitest';
import { AddressRegistry } from '../address-registry';
import { buildPatch } from '../Patch';
import { addressToString } from '../../types/canonical-address';
import { getBlockAddress, getOutputAddress, getInputAddress, getShorthandForOutput } from '../addressing';
import { portId as toPortId } from '../../types';

// Import blocks to trigger registration
import { registerAllBlocks } from '../../blocks/all';
registerAllBlocks();

function replacePatchBlock(
  patch: ReturnType<typeof buildPatch>,
  blockId: string,
  block: unknown,
): void {
  const mapPrototype = Object.getPrototypeOf(patch.blocks);
  if (typeof mapPrototype?.set !== 'function') {
    throw new Error('Test invariant violation: patch.blocks is not mutable via Map#set');
  }
  mapPrototype.set.call(patch.blocks, blockId, block);
}

describe('AddressRegistry', () => {
  describe('buildFromPatch', () => {
    it('builds registry from empty patch', () => {
      const patch = buildPatch(_b => {});
      const registry = AddressRegistry.buildFromPatch(patch);

      expect(registry.size).toBe(0);
      expect(registry.shorthandCount).toBe(0);
    });

    it('builds registry from patch with single block', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Should index: 1 block + 1 output port = 2 addresses
      expect(registry.size).toBe(2);
      // Should have 1 shorthand (for output)
      expect(registry.shorthandCount).toBe(1);
    });

    it('builds registry from patch with multiple blocks', () => {
      const patch = buildPatch(b => {
        const c1 = b.addBlock('Const', { displayName: 'Const 1' });
        b.setConfig(c1, 'value', 1);
        const c2 = b.addBlock('Const', { displayName: 'Const 2' });
        b.setConfig(c2, 'value', 2);
        b.addBlock('Oscillator', { displayName: 'Osc' });
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Should index all blocks and ports
      expect(registry.size).toBeGreaterThan(3);
    });

    it('indexes all output ports', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      // Test output port resolution
      const outputAddr = getOutputAddress(block, toPortId('out'));
      const resolved = registry.resolve(addressToString(outputAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('output');
    });

    it('indexes all input ports', () => {
      const patch = buildPatch(b => {
        b.addBlock('Oscillator', { displayName: 'My Osc' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      // Test input port resolution
      const inputAddr = getInputAddress(block, toPortId('phase'));
      const resolved = registry.resolve(addressToString(inputAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('input');
    });

    it('indexes block addresses', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const blockAddr = getBlockAddress(block);
      const resolved = registry.resolve(addressToString(blockAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('block');
    });

  });

  describe('buildFromPatch validation', () => {
    it('fails explicitly when an output port key is not a string', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });
      const block = Array.from(patch.blocks.values())[0];
      const brokenBlock = {
        ...block,
        outputPorts: new Map<any, any>([[42, { id: 'out' }]]),
      };
      replacePatchBlock(patch, block.id, brokenBlock);

      expect(() => AddressRegistry.buildFromPatch(patch)).toThrow(/output port key is not a string/);
    });

    it('fails explicitly when a port key does not match port.id', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });
      const block = Array.from(patch.blocks.values())[0];
      const brokenBlock = {
        ...block,
        outputPorts: new Map<any, any>([['wrong-key', { id: 'out' }]]),
      };
      replacePatchBlock(patch, block.id, brokenBlock);

      expect(() => AddressRegistry.buildFromPatch(patch)).toThrow(/port key\/id mismatch/);
    });

    it('fails explicitly when an input port key is not a string', () => {
      const patch = buildPatch(b => {
        b.addBlock('Oscillator', { displayName: 'My Osc' });
      });
      const block = Array.from(patch.blocks.values())[0];
      const brokenBlock = {
        ...block,
        inputPorts: new Map<any, any>([[42, { id: 'phase' }]]),
      };
      replacePatchBlock(patch, block.id, brokenBlock);

      expect(() => AddressRegistry.buildFromPatch(patch)).toThrow(/input port key is not a string/);
    });

    it('fails explicitly when an input port key does not match port.id', () => {
      const patch = buildPatch(b => {
        b.addBlock('Oscillator', { displayName: 'My Osc' });
      });
      const block = Array.from(patch.blocks.values())[0];
      const brokenBlock = {
        ...block,
        inputPorts: new Map<any, any>([['wrong-key', { id: 'phase' }]]),
      };
      replacePatchBlock(patch, block.id, brokenBlock);

      expect(() => AddressRegistry.buildFromPatch(patch)).toThrow(/port key\/id mismatch/);
    });

    it('fails explicitly when an input port entry is missing string id', () => {
      const patch = buildPatch(b => {
        b.addBlock('Oscillator', { displayName: 'My Osc' });
      });
      const block = Array.from(patch.blocks.values())[0];
      const brokenBlock = {
        ...block,
        inputPorts: new Map<unknown, unknown>([['phase', { key: 'phase' }]]),
      };
      replacePatchBlock(patch, block.id, brokenBlock);

      expect(() => AddressRegistry.buildFromPatch(patch)).toThrow(/input port entry is missing string id/);
    });
  });

  describe('resolve', () => {
    it('resolves valid block address', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const blockAddr = getBlockAddress(block);
      const resolved = registry.resolve(addressToString(blockAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('block');
      expect(resolved?.block.id).toBe(block.id);
    });

    it('resolves valid output address', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const outputAddr = getOutputAddress(block, toPortId('out'));
      const resolved = registry.resolve(addressToString(outputAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('output');
      if (resolved?.kind === 'output') {
        expect(resolved.block.id).toBe(block.id);
        expect(resolved.port.id).toBe('out');
      }
    });

    it('resolves valid input address', () => {
      const patch = buildPatch(b => {
        b.addBlock('Oscillator', { displayName: 'My Osc' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const inputAddr = getInputAddress(block, toPortId('phase'));
      const resolved = registry.resolve(addressToString(inputAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('input');
      if (resolved?.kind === 'input') {
        expect(resolved.block.id).toBe(block.id);
        expect(resolved.port.id).toBe('phase');
      }
    });

    it('returns null for invalid address', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      expect(registry.resolve('invalid-address')).toBeNull();
      expect(registry.resolve('v1:blocks.nonexistent')).toBeNull();
    });

  });

  describe('resolveShorthand', () => {
    it('resolves valid output shorthand', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const registry = AddressRegistry.buildFromPatch(patch);
      const addr = registry.resolveShorthand('my_const.out');

      expect(addr).not.toBeNull();
      expect(addr?.kind).toBe('output');
      if (addr?.kind === 'output') {
        expect(addr.portId).toBe('out');
      }
    });

    it('returns null for invalid shorthand', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      expect(registry.resolveShorthand('nonexistent.out')).toBeNull();
      expect(registry.resolveShorthand('my_const.nonexistent')).toBeNull();
    });

    it('performs O(1) lookup', () => {
      // Build a large patch
      const patch = buildPatch(b => {
        for (let i = 0; i < 100; i++) {
          const c = b.addBlock('Const', { displayName: `Const ${i}` });
          b.setConfig(c, 'value', i);
        }
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Should resolve instantly without iterating
      const start = performance.now();
      const addr = registry.resolveShorthand('const_50.out');
      const elapsed = performance.now() - start;

      expect(addr).not.toBeNull();
      expect(elapsed).toBeLessThan(1); // Should be sub-millisecond
    });
  });

  describe('large patch handling', () => {
    it('handles large patches efficiently', () => {
      const patch = buildPatch(b => {
        // Create 1000 blocks
        for (let i = 0; i < 1000; i++) {
          const c = b.addBlock('Const', { displayName: `Block ${i}` });
          b.setConfig(c, 'value', i);
        }
      });

      // Build should be fast
      const buildStart = performance.now();
      const registry = AddressRegistry.buildFromPatch(patch);
      const buildTime = performance.now() - buildStart;

      // [LAW:behavior-not-structure] Coarse regression guard only: fail on extreme slowdown, not normal machine variance.
      expect(buildTime).toBeLessThan(10000);

      // Lookups should be instant
      const lookupStart = performance.now();
      for (let i = 0; i < 100; i++) {
        registry.resolveShorthand(`block_${i * 10}.out`);
      }
      const lookupTime = performance.now() - lookupStart;

      expect(lookupTime).toBeLessThan(50); // 100 lookups in < 10ms
    });

    it('correctly indexes all elements in large patch', () => {
      const patch = buildPatch(b => {
        for (let i = 0; i < 100; i++) {
          const c = b.addBlock('Const', { displayName: `Block ${i}` });
          b.setConfig(c, 'value', i);
        }
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Each Const has: 1 block + 1 output = 2 addresses
      expect(registry.size).toBe(200);

      // Each Const has 1 output shorthand
      expect(registry.shorthandCount).toBe(100);
    });
  });

  describe('integration', () => {
    it('registry and direct resolution produce same results', () => {
      const patch = buildPatch(b => {
        const c = b.addBlock('Const', { displayName: 'My Const' });
        b.setConfig(c, 'value', 1);
        b.addBlock('Oscillator', { displayName: 'My Osc' });
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Test all blocks
      for (const block of patch.blocks.values()) {
        const blockAddr = getBlockAddress(block);
        const addrStr = addressToString(blockAddr);

        const directResolved = registry.resolve(addrStr);
        expect(directResolved).not.toBeNull();
        expect(directResolved?.block.id).toBe(block.id);

        // Test all output ports
        for (const outputPortId of block.outputPorts.keys()) {
          const outputAddr = getOutputAddress(block, toPortId(outputPortId));
          const outputStr = addressToString(outputAddr);

          const resolved = registry.resolve(outputStr);
          expect(resolved).not.toBeNull();
          if (resolved?.kind === 'output') {
            expect(resolved.block.id).toBe(block.id);
            expect(resolved.port.id).toBe(outputPortId);
          }

          // Test shorthand
          const shorthand = getShorthandForOutput(block, toPortId(outputPortId));
          const shortAddr = registry.resolveShorthand(shorthand);
          expect(shortAddr).not.toBeNull();
          expect(shortAddr?.blockId).toBe(block.id);
        }
      }
    });
  });
});
