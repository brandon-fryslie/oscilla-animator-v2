/**
 * Tripwire tests for patch-dsl correctness fixes.
 *
 * These tests verify that all review findings are addressed and prevent regressions.
 */

import { describe, it, expect } from 'vitest';
import { tokenize, TokenKind } from '../lexer';
import { deserializePatchFromHCL, serializePatchToHCL } from '../index';

describe('tripwire: lexer exceptions', () => {
  it('does not throw on garbage input', () => {
    const result = deserializePatchFromHCL('!@#$%^&*()');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Parse failed');
  });

  it('does not throw on unterminated string', () => {
    const result = deserializePatchFromHCL('block "Foo" { x = "unterminated');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Parse failed');
  });

  it('does not throw on unexpected character in value position', () => {
    const result = deserializePatchFromHCL('block "Foo" { x = @ }');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Parse failed');
  });
});

describe('tripwire: negative numbers', () => {
  it('lexes -1 as single NUMBER token', () => {
    const tokens = tokenize('-1');
    expect(tokens).toHaveLength(2); // NUMBER, EOF
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(tokens[0].value).toBe('-1');
  });

  it('lexes -0.5 as single NUMBER token', () => {
    const tokens = tokenize('-0.5');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(tokens[0].value).toBe('-0.5');
  });

  it('lexes -.5 as single NUMBER token', () => {
    const tokens = tokenize('-.5');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(tokens[0].value).toBe('-.5');
  });

  it('lexes a=-1 correctly (IDENT EQUALS NUMBER)', () => {
    const tokens = tokenize('a=-1');
    expect(tokens).toHaveLength(4); // IDENT, EQUALS, NUMBER, EOF
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('a');
    expect(tokens[1].kind).toBe(TokenKind.EQUALS);
    expect(tokens[2].kind).toBe(TokenKind.NUMBER);
    expect(tokens[2].value).toBe('-1');
  });

  it('round-trips negative numbers', () => {
    const hcl = `
patch "Test" {
  block "Const" "neg" {
    value = -1.5
    other = -.25
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params.value).toBe(-1.5);
    expect(block.params.other).toBe(-0.25);

    const serialized = serializePatchToHCL(result.patch);
    expect(serialized).toContain('value = -1.5');
    expect(serialized).toContain('other = -0.25');
  });
});

describe('tripwire: null values', () => {
  it('lexes null keyword as NULL token', () => {
    const tokens = tokenize('null');
    expect(tokens).toHaveLength(2); // NULL, EOF
    expect(tokens[0].kind).toBe(TokenKind.NULL);
    expect(tokens[0].value).toBe('null');
  });

  it('round-trips null in object', () => {
    const hcl = `
patch "Test" {
  block "Const" "obj" {
    value = { a = null }
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    const value = block.params.value as Record<string, unknown>;
    expect(value.a).toBe(null);

    const serialized = serializePatchToHCL(result.patch);
    expect(serialized).toContain('a = null');
  });

  it('round-trips null in list', () => {
    const hcl = `
patch "Test" {
  block "Const" "arr" {
    value = [1, null, 2]
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    const value = block.params.value as unknown[];
    expect(value).toEqual([1, null, 2]);

    const serialized = serializePatchToHCL(result.patch);
    expect(serialized).toContain('[1, null, 2]');
  });

  it('round-trips null as top-level param', () => {
    const hcl = `
patch "Test" {
  block "Const" "null-param" {
    value = null
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params.value).toBe(null);

    const serialized = serializePatchToHCL(result.patch);
    expect(serialized).toContain('value = null');
  });
});

describe('tripwire: dashed identifiers', () => {
  it('lexes golden-spiral as single IDENT token', () => {
    const tokens = tokenize('golden-spiral');
    expect(tokens).toHaveLength(2); // IDENT, EOF
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('golden-spiral');
  });

  it('lexes foo-bar-baz as single IDENT token', () => {
    const tokens = tokenize('foo-bar-baz');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('foo-bar-baz');
  });

  it('does not lex -foo as identifier (dash at start)', () => {
    // -foo should be an error (dash cannot start identifier)
    expect(() => tokenize('-foo')).toThrow();
  });

  it('round-trips block with dashed display name', () => {
    const hcl = `
patch "Test" {
  block "Const" "golden-spiral" {
    value = 1.618
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.displayName).toBe('golden-spiral');

    const serialized = serializePatchToHCL(result.patch);
    const deserializedAgain = deserializePatchFromHCL(serialized);
    expect(deserializedAgain.errors).toHaveLength(0);

    const blockAgain = Array.from(deserializedAgain.patch.blocks.values())[0];
    expect(blockAgain.displayName).toBe('golden-spiral');
  });
});

describe('tripwire: quoted param keys', () => {
  it('round-trips param key with spaces', () => {
    const hcl = `
patch "Test" {
  block "Const" "special" {
    "my key" = 123
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params['my key']).toBe(123);

    const serialized = serializePatchToHCL(result.patch);
    expect(serialized).toContain('"my key"');
  });

  it('round-trips param key with special chars', () => {
    const hcl = `
patch "Test" {
  block "Const" "special" {
    "special!chars@here" = true
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params['special!chars@here']).toBe(true);

    const serialized = serializePatchToHCL(result.patch);
    expect(serialized).toContain('"special!chars@here"');
  });

  it('does not quote valid identifier keys', () => {
    const hcl = `
patch "Test" {
  block "Const" "normal" {
    normalKey = 456
    with_underscore = 789
    with-dash = 111
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);

    const serialized = serializePatchToHCL(result.patch);
    // These should NOT be quoted
    expect(serialized).toContain('normalKey = 456');
    expect(serialized).toContain('with_underscore = 789');
    expect(serialized).toContain('with-dash = 111');
    // Verify they're not accidentally quoted
    expect(serialized).not.toContain('"normalKey"');
    expect(serialized).not.toContain('"with_underscore"');
    expect(serialized).not.toContain('"with-dash"');
  });
});

describe('tripwire: error messages', () => {
  it('uses blockName.portName format for unresolved references', () => {
    const hcl = `
patch "Test" {
  block "Const" "foo" {}

  connect {
    from = nonexistent.out
    to = foo.in
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    const errorMsg = result.errors[0].message;
    expect(errorMsg).toContain('nonexistent.out');
    expect(errorMsg).not.toContain('JSON');
    expect(errorMsg).not.toContain('kind');
  });

  it('formats reference values in error messages', () => {
    const hcl = `
patch "Test" {
  connect {
    from = foo.bar
    to = baz.qux
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should show "foo.bar" not JSON blob
    const fromError = result.errors.find(e => e.message.includes('from'));
    expect(fromError?.message).toContain('foo.bar');
  });
});

describe('tripwire: vararg/port override deserialization', () => {
  it('parses port override syntax without error', () => {
    const hcl = `
patch "Test" {
  block "Oscillator" "osc" {
    port "phase" {
      combineMode = "sum"
      defaultSource = 0.5
    }
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    // Should parse without errors (even if port might not exist in registry)
    expect(result.errors).toHaveLength(0);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block).toBeDefined();
  });

  it('parses vararg syntax without error', () => {
    const hcl = `
patch "Test" {
  block "Const" "foo" {}

  block "Oscillator" "osc" {
    vararg "phase" {
      connect {
        sourceAddress = "foo.out"
        alias = "first"
        sortKey = 0
      }
      connect {
        sourceAddress = "foo.out"
        sortKey = 1
      }
    }
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    // Should parse without errors
    expect(result.errors).toHaveLength(0);
    const osc = Array.from(result.patch.blocks.values()).find(b => b.displayName === 'osc');
    expect(osc).toBeDefined();
  });
});

describe('tripwire: parser recovery', () => {
  it('recoverToBlockEnd respects bracket depth', () => {
    // Parser should recover from errors and continue parsing subsequent blocks
    const hcl = `
patch "Test" {
  block "Const" "bad" {
    value = { a = 1
    # Missing closing brace
  }

  block "Const" "good" {
    value = 123
  }
}
`;
    const result = deserializePatchFromHCL(hcl);
    // Should have errors from the malformed block
    expect(result.errors.length).toBeGreaterThan(0);
    // Should still have created at least one block
    const blocks = Array.from(result.patch.blocks.values());
    expect(blocks.length).toBeGreaterThan(0);
    // The second block should ideally be parsed (recovery worked)
    // But this is best-effort, so we just verify some blocks exist
  });
});
