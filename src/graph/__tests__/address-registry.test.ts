/**
 * Tests for Address Registry Index
 */

import { describe, it, expect } from 'vitest';
import { AddressRegistry } from '../address-registry';
import { buildPatch } from '../Patch';
import { addressToString } from '../../types/canonical-address';
import { getBlockAddress, getOutputAddress, getInputAddress, getShorthandForOutput } from '../addressing';

// Import blocks to trigger registration
import '../../blocks/signal-blocks';

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
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Should index: 1 block + 1 output port = 2 addresses
      expect(registry.size).toBe(2);
      // Should have 1 shorthand (for output)
      expect(registry.shorthandCount).toBe(1);
    });

    it('builds registry from patch with multiple blocks', () => {
      const patch = buildPatch(b => {
        b.addBlock('Const', { value: 1 }, { displayName: 'Const 1' });
        b.addBlock('Const', { value: 2 }, { displayName: 'Const 2' });
        b.addBlock('Oscillator', {}, { displayName: 'Osc' });
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      // Should index all blocks and ports
      expect(registry.size).toBeGreaterThan(3);
    });

    it('indexes all output ports', () => {
      const patch = buildPatch(b => {
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      // Test output port resolution
      const outputAddr = getOutputAddress(block, 'out' as any);
      const resolved = registry.resolve(addressToString(outputAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('output');
    });

    it('indexes all input ports', () => {
      const patch = buildPatch(b => {
        b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      // Test input port resolution
      const inputAddr = getInputAddress(block, 'phase' as any);
      const resolved = registry.resolve(addressToString(inputAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('input');
    });

    it('indexes block addresses', () => {
      const patch = buildPatch(b => {
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const blockAddr = getBlockAddress(block);
      const resolved = registry.resolve(addressToString(blockAddr));

      expect(resolved).not.toBeNull();
      expect(resolved?.kind).toBe('block');
    });
  });

  describe('resolve', () => {
    it('resolves valid block address', () => {
      const patch = buildPatch(b => {
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
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
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const outputAddr = getOutputAddress(block, 'out' as any);
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
        b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
      });

      const block = Array.from(patch.blocks.values())[0];
      const registry = AddressRegistry.buildFromPatch(patch);

      const inputAddr = getInputAddress(block, 'phase' as any);
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
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      expect(registry.resolve('invalid-address')).toBeNull();
      expect(registry.resolve('v1:blocks.nonexistent')).toBeNull();
    });

    it('performs O(1) lookup', () => {
      // Build a large patch
      const patch = buildPatch(b => {
        for (let i = 0; i < 100; i++) {
          b.addBlock('Const', { value: i }, { displayName: `Const ${i}` });
        }
      });

      const registry = AddressRegistry.buildFromPatch(patch);
      const block = Array.from(patch.blocks.values())[50]; // Middle block
      const addr = getBlockAddress(block);

      // Should resolve instantly without iterating
      const start = performance.now();
      const resolved = registry.resolve(addressToString(addr));
      const elapsed = performance.now() - start;

      expect(resolved).not.toBeNull();
      expect(elapsed).toBeLessThan(1); // Should be sub-millisecond
    });
  });

  describe('resolveShorthand', () => {
    it('resolves valid output shorthand', () => {
      const patch = buildPatch(b => {
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
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
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
      });

      const registry = AddressRegistry.buildFromPatch(patch);

      expect(registry.resolveShorthand('nonexistent.out')).toBeNull();
      expect(registry.resolveShorthand('my_const.nonexistent')).toBeNull();
    });

    it('performs O(1) lookup', () => {
      // Build a large patch
      const patch = buildPatch(b => {
        for (let i = 0; i < 100; i++) {
          b.addBlock('Const', { value: i }, { displayName: `Const ${i}` });
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
          b.addBlock('Const', { value: i }, { displayName: `Block ${i}` });
        }
      });

      // Build should be fast
      const buildStart = performance.now();
      const registry = AddressRegistry.buildFromPatch(patch);
      const buildTime = performance.now() - buildStart;

      expect(buildTime).toBeLessThan(500); // Should build in < 100ms

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
          b.addBlock('Const', { value: i }, { displayName: `Block ${i}` });
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
        b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
        b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
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
        for (const portId of block.outputPorts.keys()) {
          const outputAddr = getOutputAddress(block, portId as any);
          const outputStr = addressToString(outputAddr);

          const resolved = registry.resolve(outputStr);
          expect(resolved).not.toBeNull();
          if (resolved?.kind === 'output') {
            expect(resolved.block.id).toBe(block.id);
            expect(resolved.port.id).toBe(portId);
          }

          // Test shorthand
          const shorthand = getShorthandForOutput(block, portId as any);
          const shortAddr = registry.resolveShorthand(shorthand);
          expect(shortAddr).not.toBeNull();
          expect(shortAddr?.blockId).toBe(block.id);
        }
      }
    });
  });
});
