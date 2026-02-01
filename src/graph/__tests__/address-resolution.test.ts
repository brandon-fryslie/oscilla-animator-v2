/**
 * Tests for Address Resolution Service
 */

import { describe, it, expect } from 'vitest';
import { resolveAddress, resolveAddressWithDiagnostic } from '../address-resolution';
import { buildPatch } from '../Patch';
import { addressToString } from '../../types/canonical-address';
import { getBlockAddress, getOutputAddress, getInputAddress } from '../addressing';

// Import blocks to trigger registration
import '../../blocks/all';

describe('resolveAddress', () => {
  it('resolves block address', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);
    const addrStr = addressToString(addr);

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('block');
    expect(resolved?.block).toBe(block);
    expect(resolved?.addr.canonicalName).toBe('my_const');
  });

  it('resolves output port address', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getOutputAddress(block, 'out' as any);
    const addrStr = addressToString(addr);

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('output');
    if (resolved?.kind === 'output') {
      expect(resolved.block).toBe(block);
      expect(resolved.port.id).toBe('out');
      expect(resolved.type).toBeDefined();
      expect(resolved.addr.canonicalName).toBe('my_const');
    }
  });

  it('resolves input port address', () => {
    const patch = buildPatch(b => {
      b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getInputAddress(block, 'phase' as any);
    const addrStr = addressToString(addr);

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('input');
    if (resolved?.kind === 'input') {
      expect(resolved.block).toBe(block);
      expect(resolved.port.id).toBe('phase');
      expect(resolved.type).toBeDefined();
      expect(resolved.addr.canonicalName).toBe('my_osc');
    }
  });

  it('resolves param address', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 42 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addrStr = 'v1:blocks.my_const.params.value';

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('param');
    if (resolved?.kind === 'param') {
      expect(resolved.block).toBe(block);
      expect(resolved.paramId).toBe('value');
      expect(resolved.value).toBe(42);
    }
  });

  it('returns null for invalid address syntax', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const resolved = resolveAddress(patch, 'invalid-address');

    expect(resolved).toBeNull();
  });

  it('returns null for missing block', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const resolved = resolveAddress(patch, 'v1:blocks.nonexistent');

    expect(resolved).toBeNull();
  });

  it('returns null for missing output port', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const resolved = resolveAddress(patch, 'v1:blocks.my_const.outputs.nonexistent');

    expect(resolved).toBeNull();
  });

  it('returns null for missing input port', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const resolved = resolveAddress(patch, 'v1:blocks.my_const.inputs.nonexistent');

    expect(resolved).toBeNull();
  });

  it('resolves auto-generated displayNames', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);
    const addrStr = addressToString(addr);

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('block');
    expect(resolved?.block).toBe(block);
  });

  it('includes type information for output ports', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getOutputAddress(block, 'out' as any);
    const addrStr = addressToString(addr);

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    if (resolved?.kind === 'output') {
      expect(resolved.type).toBeDefined();
      expect(resolved.type.payload).toBeDefined();
      expect(resolved.type.extent).toBeDefined();
      expect(resolved.type.extent.cardinality).toBeDefined();
    }
  });

  it('includes type information for input ports', () => {
    const patch = buildPatch(b => {
      b.addBlock('Oscillator', {}, { displayName: 'My Osc' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getInputAddress(block, 'phase' as any);
    const addrStr = addressToString(addr);

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    if (resolved?.kind === 'input') {
      expect(resolved.type).toBeDefined();
      expect(resolved.type.payload).toBeDefined();
      expect(resolved.type.extent).toBeDefined();
      expect(resolved.type.extent.cardinality).toBeDefined();
    }
  });

  it('handles param with undefined value', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', {}, { displayName: 'My Const' });
    });

    const addrStr = 'v1:blocks.my_const.params.nonexistent';

    const resolved = resolveAddress(patch, addrStr);

    expect(resolved).not.toBeNull();
    if (resolved?.kind === 'param') {
      expect(resolved.value).toBeUndefined();
    }
  });
});

describe('resolveAddressWithDiagnostic', () => {
  it('resolves valid address with no error', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const block = Array.from(patch.blocks.values())[0];
    const addr = getBlockAddress(block);
    const addrStr = addressToString(addr);

    const result = resolveAddressWithDiagnostic(patch, addrStr);

    expect(result.address).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('returns helpful error for invalid syntax', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const result = resolveAddressWithDiagnostic(patch, 'invalid-address');

    expect(result.address).toBeNull();
    expect(result.error).toBe('Invalid address format: "invalid-address"');
  });

  it('returns helpful error for missing block', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const result = resolveAddressWithDiagnostic(patch, 'v1:blocks.nonexistent');

    expect(result.address).toBeNull();
    expect(result.error).toBe('Block not found: nonexistent');
  });

  it('returns helpful error for missing output port', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const result = resolveAddressWithDiagnostic(patch, 'v1:blocks.my_const.outputs.nonexistent');

    expect(result.address).toBeNull();
    expect(result.error).toContain('output port');
    expect(result.error).toContain('nonexistent');
  });

  it('returns helpful error for missing input port', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const result = resolveAddressWithDiagnostic(patch, 'v1:blocks.my_const.inputs.nonexistent');

    expect(result.address).toBeNull();
    expect(result.error).toContain('input port');
    expect(result.error).toContain('nonexistent');
  });

  it('returns helpful error for missing parameter', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    // Note: params don't really fail - they just return undefined value
    // But we test the error path if the block is missing
    const result = resolveAddressWithDiagnostic(patch, 'v1:blocks.nonexistent.params.value');

    expect(result.address).toBeNull();
    expect(result.error).toBe('Block not found: nonexistent');
  });

  it('error message includes block type', () => {
    const patch = buildPatch(b => {
      b.addBlock('Const', { value: 1 }, { displayName: 'My Const' });
    });

    const result = resolveAddressWithDiagnostic(patch, 'v1:blocks.my_const.outputs.nonexistent');

    expect(result.error).toContain('Const');
  });
});
