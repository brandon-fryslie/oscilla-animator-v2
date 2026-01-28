/**
 * Tests for Canonical Addressing System
 */

import { describe, it, expect } from 'vitest';
import {
  type CanonicalAddress,
  type BlockAddress,
  type OutputAddress,
  type InputAddress,
  type ParamAddress,
  type LensAddress,
  isBlockAddress,
  isOutputAddress,
  isInputAddress,
  isParamAddress,
  isLensAddress,
  addressToString,
  parseAddress,
  getAddressFormatVersion,
} from '../canonical-address';
import { blockId, portId } from '../index';

describe('Canonical Address Type Guards', () => {
  const blockAddr: BlockAddress = {
    kind: 'block',
    blockId: blockId('b1'),
    canonicalName: 'my_circle',
  };

  const outputAddr: OutputAddress = {
    kind: 'output',
    blockId: blockId('b1'),
    canonicalName: 'my_circle',
    portId: portId('radius'),
  };

  const inputAddr: InputAddress = {
    kind: 'input',
    blockId: blockId('b1'),
    canonicalName: 'my_circle',
    portId: portId('x'),
  };

  const paramAddr: ParamAddress = {
    kind: 'param',
    blockId: blockId('b1'),
    canonicalName: 'my_circle',
    paramId: 'size',
  };

  const lensAddr: LensAddress = {
    kind: 'lens',
    blockId: blockId('b1'),
    canonicalName: 'my_circle',
    portId: portId('x'),
    lensId: 'lens_0',
  };

  it('isBlockAddress correctly identifies block addresses', () => {
    expect(isBlockAddress(blockAddr)).toBe(true);
    expect(isBlockAddress(outputAddr)).toBe(false);
    expect(isBlockAddress(inputAddr)).toBe(false);
    expect(isBlockAddress(paramAddr)).toBe(false);
    expect(isBlockAddress(lensAddr)).toBe(false);
  });

  it('isOutputAddress correctly identifies output addresses', () => {
    expect(isOutputAddress(blockAddr)).toBe(false);
    expect(isOutputAddress(outputAddr)).toBe(true);
    expect(isOutputAddress(inputAddr)).toBe(false);
    expect(isOutputAddress(paramAddr)).toBe(false);
    expect(isOutputAddress(lensAddr)).toBe(false);
  });

  it('isInputAddress correctly identifies input addresses', () => {
    expect(isInputAddress(blockAddr)).toBe(false);
    expect(isInputAddress(outputAddr)).toBe(false);
    expect(isInputAddress(inputAddr)).toBe(true);
    expect(isInputAddress(paramAddr)).toBe(false);
    expect(isInputAddress(lensAddr)).toBe(false);
  });

  it('isParamAddress correctly identifies param addresses', () => {
    expect(isParamAddress(blockAddr)).toBe(false);
    expect(isParamAddress(outputAddr)).toBe(false);
    expect(isParamAddress(inputAddr)).toBe(false);
    expect(isParamAddress(paramAddr)).toBe(true);
    expect(isParamAddress(lensAddr)).toBe(false);
  });

  it('isLensAddress correctly identifies lens addresses', () => {
    expect(isLensAddress(blockAddr)).toBe(false);
    expect(isLensAddress(outputAddr)).toBe(false);
    expect(isLensAddress(inputAddr)).toBe(false);
    expect(isLensAddress(paramAddr)).toBe(false);
    expect(isLensAddress(lensAddr)).toBe(true);
  });
});

describe('addressToString', () => {
  it('serializes block address', () => {
    const addr: BlockAddress = {
      kind: 'block',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
    };
    expect(addressToString(addr)).toBe('v1:blocks.my_circle');
  });

  it('serializes output address', () => {
    const addr: OutputAddress = {
      kind: 'output',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      portId: portId('radius'),
    };
    expect(addressToString(addr)).toBe('v1:blocks.my_circle.outputs.radius');
  });

  it('serializes input address', () => {
    const addr: InputAddress = {
      kind: 'input',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      portId: portId('x'),
    };
    expect(addressToString(addr)).toBe('v1:blocks.my_circle.inputs.x');
  });

  it('serializes param address', () => {
    const addr: ParamAddress = {
      kind: 'param',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      paramId: 'size',
    };
    expect(addressToString(addr)).toBe('v1:blocks.my_circle.params.size');
  });

  it('serializes lens address', () => {
    const addr: LensAddress = {
      kind: 'lens',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      portId: portId('x'),
      lensId: 'lens_0',
    };
    expect(addressToString(addr)).toBe('v1:blocks.my_circle.inputs.x.lenses.lens_0');
  });

  it('handles canonical names with underscores and hyphens', () => {
    const addr: BlockAddress = {
      kind: 'block',
      blockId: blockId('b1'),
      canonicalName: 'my_fancy_block-v2',
    };
    expect(addressToString(addr)).toBe('v1:blocks.my_fancy_block-v2');
  });

  it('handles port IDs with underscores', () => {
    const addr: OutputAddress = {
      kind: 'output',
      blockId: blockId('b1'),
      canonicalName: 'circle',
      portId: portId('center_x'),
    };
    expect(addressToString(addr)).toBe('v1:blocks.circle.outputs.center_x');
  });
});

describe('parseAddress', () => {
  describe('valid addresses', () => {
    it('parses block address', () => {
      const result = parseAddress('v1:blocks.my_circle');
      expect(result).toEqual({
        kind: 'block',
        blockId: '', // Empty until resolved
        canonicalName: 'my_circle',
      });
    });

    it('parses output address', () => {
      const result = parseAddress('v1:blocks.my_circle.outputs.radius');
      expect(result).toEqual({
        kind: 'output',
        blockId: '',
        canonicalName: 'my_circle',
        portId: 'radius',
      });
    });

    it('parses input address', () => {
      const result = parseAddress('v1:blocks.my_circle.inputs.x');
      expect(result).toEqual({
        kind: 'input',
        blockId: '',
        canonicalName: 'my_circle',
        portId: 'x',
      });
    });

    it('parses param address', () => {
      const result = parseAddress('v1:blocks.my_circle.params.size');
      expect(result).toEqual({
        kind: 'param',
        blockId: '',
        canonicalName: 'my_circle',
        paramId: 'size',
      });
    });

    it('parses lens address', () => {
      const result = parseAddress('v1:blocks.my_circle.inputs.x.lenses.lens_0');
      expect(result).toEqual({
        kind: 'lens',
        blockId: '',
        canonicalName: 'my_circle',
        portId: 'x',
        lensId: 'lens_0',
      });
    });

    it('handles canonical names with underscores and hyphens', () => {
      const result = parseAddress('v1:blocks.my_fancy_block-v2');
      expect(result?.canonicalName).toBe('my_fancy_block-v2');
    });

    it('handles port IDs with underscores', () => {
      const result = parseAddress('v1:blocks.circle.outputs.center_x');
      expect(result).toMatchObject({
        kind: 'output',
        portId: 'center_x',
      });
    });
  });

  describe('invalid addresses', () => {
    it('rejects missing version', () => {
      expect(parseAddress('blocks.my_circle')).toBeNull();
    });

    it('rejects unsupported version', () => {
      expect(parseAddress('v2:blocks.my_circle')).toBeNull();
      expect(parseAddress('v0:blocks.my_circle')).toBeNull();
    });

    it('rejects malformed version', () => {
      expect(parseAddress('version1:blocks.my_circle')).toBeNull();
      expect(parseAddress('1:blocks.my_circle')).toBeNull();
    });

    it('rejects missing "blocks." prefix', () => {
      expect(parseAddress('v1:my_circle')).toBeNull();
      expect(parseAddress('v1:block.my_circle')).toBeNull(); // Singular
    });

    it('rejects empty canonical name', () => {
      expect(parseAddress('v1:blocks.')).toBeNull();
      expect(parseAddress('v1:blocks..outputs.radius')).toBeNull();
    });

    it('rejects unknown category', () => {
      expect(parseAddress('v1:blocks.my_circle.unknown.foo')).toBeNull();
      expect(parseAddress('v1:blocks.my_circle.output.foo')).toBeNull(); // Singular
    });

    it('rejects empty port/param ID', () => {
      expect(parseAddress('v1:blocks.my_circle.outputs.')).toBeNull();
      expect(parseAddress('v1:blocks.my_circle.inputs.')).toBeNull();
      expect(parseAddress('v1:blocks.my_circle.params.')).toBeNull();
    });

    it('rejects too many path segments', () => {
      expect(parseAddress('v1:blocks.my_circle.outputs.radius.extra')).toBeNull();
    });

    it('rejects too few path segments for port/param', () => {
      expect(parseAddress('v1:blocks.my_circle.outputs')).toBeNull();
    });

    it('rejects lens address with wrong category (must be inputs)', () => {
      // Lenses can only be on inputs (for now - outputs reserved for future)
      expect(parseAddress('v1:blocks.my_circle.outputs.x.lenses.lens_0')).toBeNull();
    });

    it('rejects lens address with wrong literal (must be lenses)', () => {
      // Should be "lenses" not "adapters" (Sprint 2 redesign)
      expect(parseAddress('v1:blocks.my_circle.inputs.x.adapters.adapter_0')).toBeNull();
    });

    it('rejects lens address with empty lens ID', () => {
      expect(parseAddress('v1:blocks.my_circle.inputs.x.lenses.')).toBeNull();
    });

    it('rejects empty string', () => {
      expect(parseAddress('')).toBeNull();
    });

    it('rejects completely malformed input', () => {
      expect(parseAddress('not-an-address')).toBeNull();
      expect(parseAddress('v1:foo.bar.baz')).toBeNull();
    });
  });
});

describe('roundtrip: parseAddress(addressToString(addr))', () => {
  it('roundtrips block address', () => {
    const original: BlockAddress = {
      kind: 'block',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
    };
    const str = addressToString(original);
    const parsed = parseAddress(str);

    expect(parsed).toEqual({
      kind: 'block',
      blockId: '', // blockId not preserved in roundtrip (by design)
      canonicalName: 'my_circle',
    });
    expect(parsed?.kind).toBe(original.kind);
    expect(parsed && 'canonicalName' in parsed ? parsed.canonicalName : null).toBe(
      original.canonicalName
    );
  });

  it('roundtrips output address', () => {
    const original: OutputAddress = {
      kind: 'output',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      portId: portId('radius'),
    };
    const str = addressToString(original);
    const parsed = parseAddress(str);

    expect(parsed?.kind).toBe('output');
    expect(parsed && 'canonicalName' in parsed ? parsed.canonicalName : null).toBe(
      original.canonicalName
    );
    expect(parsed && 'portId' in parsed ? parsed.portId : null).toBe(original.portId);
  });

  it('roundtrips input address', () => {
    const original: InputAddress = {
      kind: 'input',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      portId: portId('x'),
    };
    const str = addressToString(original);
    const parsed = parseAddress(str);

    expect(parsed?.kind).toBe('input');
    expect(parsed && 'canonicalName' in parsed ? parsed.canonicalName : null).toBe(
      original.canonicalName
    );
    expect(parsed && 'portId' in parsed ? parsed.portId : null).toBe(original.portId);
  });

  it('roundtrips param address', () => {
    const original: ParamAddress = {
      kind: 'param',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      paramId: 'size',
    };
    const str = addressToString(original);
    const parsed = parseAddress(str);

    expect(parsed?.kind).toBe('param');
    expect(parsed && 'canonicalName' in parsed ? parsed.canonicalName : null).toBe(
      original.canonicalName
    );
    expect(parsed && 'paramId' in parsed ? parsed.paramId : null).toBe(original.paramId);
  });

  it('roundtrips lens address', () => {
    const original: LensAddress = {
      kind: 'lens',
      blockId: blockId('b1'),
      canonicalName: 'my_circle',
      portId: portId('x'),
      lensId: 'lens_0',
    };
    const str = addressToString(original);
    const parsed = parseAddress(str);

    expect(parsed?.kind).toBe('lens');
    expect(parsed && 'canonicalName' in parsed ? parsed.canonicalName : null).toBe(
      original.canonicalName
    );
    expect(parsed && 'portId' in parsed ? parsed.portId : null).toBe(original.portId);
    expect(parsed && 'lensId' in parsed ? parsed.lensId : null).toBe(original.lensId);
  });
});

describe('getAddressFormatVersion', () => {
  it('extracts v1 version', () => {
    expect(getAddressFormatVersion('v1:blocks.my_circle')).toBe('v1');
    expect(getAddressFormatVersion('v1:blocks.my_circle.outputs.radius')).toBe('v1');
  });

  it('returns null for missing version', () => {
    expect(getAddressFormatVersion('blocks.my_circle')).toBeNull();
  });

  it('returns null for malformed version', () => {
    expect(getAddressFormatVersion('version1:blocks.my_circle')).toBeNull();
    expect(getAddressFormatVersion('1:blocks.my_circle')).toBeNull();
  });

  it('returns null for unsupported version', () => {
    expect(getAddressFormatVersion('v2:blocks.my_circle')).toBeNull();
    expect(getAddressFormatVersion('v0:blocks.my_circle')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getAddressFormatVersion('')).toBeNull();
  });
});
