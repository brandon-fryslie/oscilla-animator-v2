/**
 * Parser tests for Patch DSL.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parser';
import { tokenize } from '../lexer';

/**
 * Helper: tokenize and parse HCL string.
 */
function parseHcl(input: string) {
  return parse(tokenize(input));
}

describe('parser', () => {
  it('parses empty document', () => {
    const result = parseHcl('');
    expect(result.document.blocks).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('parses simple block', () => {
    const input = 'block "Ellipse" "dot" {}';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks).toHaveLength(1);
    expect(result.document.blocks[0].type).toBe('block');
    expect(result.document.blocks[0].labels).toEqual(['Ellipse', 'dot']);
    expect(result.document.blocks[0].attributes).toEqual({});
    expect(result.document.blocks[0].children).toEqual([]);
  });

  it('parses block with no labels', () => {
    const input = 'connect {}';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks).toHaveLength(1);
    expect(result.document.blocks[0].type).toBe('connect');
    expect(result.document.blocks[0].labels).toEqual([]);
  });

  it('parses block with single label', () => {
    const input = 'patch "Test" {}';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].type).toBe('patch');
    expect(result.document.blocks[0].labels).toEqual(['Test']);
  });

  it('parses attributes (number)', () => {
    const input = 'block "Test" { foo = 42 }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.foo).toEqual({ kind: 'number', value: 42 });
  });

  it('parses attributes (string)', () => {
    const input = 'block "Test" { name = "hello" }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.name).toEqual({ kind: 'string', value: 'hello' });
  });

  it('parses attributes (boolean)', () => {
    const input = 'block "Test" { enabled = true }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.enabled).toEqual({ kind: 'bool', value: true });
  });

  it('parses multiple attributes', () => {
    const input = `
block "Test" {
  rx = 0.02
  ry = 0.03
  enabled = false
}
`;
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.rx).toEqual({ kind: 'number', value: 0.02 });
    expect(result.document.blocks[0].attributes.ry).toEqual({ kind: 'number', value: 0.03 });
    expect(result.document.blocks[0].attributes.enabled).toEqual({ kind: 'bool', value: false });
  });

  it('parses nested blocks', () => {
    const input = 'block "A" { block "B" {} }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].children).toHaveLength(1);
    expect(result.document.blocks[0].children[0].type).toBe('block');
    expect(result.document.blocks[0].children[0].labels).toEqual(['B']);
  });

  it('parses multiple nested blocks', () => {
    const input = `
block "A" {
  block "B" {}
  block "C" {}
}
`;
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].children).toHaveLength(2);
    expect(result.document.blocks[0].children[0].labels).toEqual(['B']);
    expect(result.document.blocks[0].children[1].labels).toEqual(['C']);
  });

  it('parses references', () => {
    const input = 'connect { from = osc.out }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.from).toEqual({
      kind: 'reference',
      parts: ['osc', 'out'],
    });
  });

  it('parses multi-part references', () => {
    const input = 'block "Test" { ref = a.b.c.d }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.ref).toEqual({
      kind: 'reference',
      parts: ['a', 'b', 'c', 'd'],
    });
  });

  it('parses objects', () => {
    const input = 'block "A" { color = { r = 1, g = 0.5 } }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.color.kind).toBe('object');
    const obj = result.document.blocks[0].attributes.color;
    if (obj.kind === 'object') {
      expect(obj.entries.r).toEqual({ kind: 'number', value: 1 });
      expect(obj.entries.g).toEqual({ kind: 'number', value: 0.5 });
    }
  });

  it('parses empty objects', () => {
    const input = 'block "A" { obj = {} }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.obj).toEqual({
      kind: 'object',
      entries: {},
    });
  });

  it('parses objects with newlines', () => {
    const input = `
block "A" {
  color = {
    r = 1.0
    g = 0.5
    b = 0.0
  }
}
`;
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    const obj = result.document.blocks[0].attributes.color;
    if (obj.kind === 'object') {
      expect(obj.entries.r).toEqual({ kind: 'number', value: 1.0 });
      expect(obj.entries.g).toEqual({ kind: 'number', value: 0.5 });
      expect(obj.entries.b).toEqual({ kind: 'number', value: 0.0 });
    }
  });

  it('parses objects with trailing comma', () => {
    const input = 'block "A" { obj = { a = 1, b = 2, } }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    const obj = result.document.blocks[0].attributes.obj;
    if (obj.kind === 'object') {
      expect(obj.entries.a).toEqual({ kind: 'number', value: 1 });
      expect(obj.entries.b).toEqual({ kind: 'number', value: 2 });
    }
  });

  it('parses lists', () => {
    const input = 'block "A" { items = [1, 2, 3] }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.items.kind).toBe('list');
    const list = result.document.blocks[0].attributes.items;
    if (list.kind === 'list') {
      expect(list.items).toHaveLength(3);
      expect(list.items[0]).toEqual({ kind: 'number', value: 1 });
      expect(list.items[1]).toEqual({ kind: 'number', value: 2 });
      expect(list.items[2]).toEqual({ kind: 'number', value: 3 });
    }
  });

  it('parses empty lists', () => {
    const input = 'block "A" { items = [] }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].attributes.items).toEqual({
      kind: 'list',
      items: [],
    });
  });

  it('parses lists with trailing comma', () => {
    const input = 'block "A" { items = [1, 2, 3,] }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    const list = result.document.blocks[0].attributes.items;
    if (list.kind === 'list') {
      expect(list.items).toHaveLength(3);
    }
  });

  it('parses nested values in lists', () => {
    const input = 'block "A" { items = [{ x = 1 }, { x = 2 }] }';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    const list = result.document.blocks[0].attributes.items;
    if (list.kind === 'list') {
      expect(list.items).toHaveLength(2);
      expect(list.items[0].kind).toBe('object');
      expect(list.items[1].kind).toBe('object');
    }
  });

  it('parses complex nested structure', () => {
    const input = `
patch "Test" {
  block "Ellipse" "dot" {
    rx = 0.02
    ry = 0.02
  }

  block "Const" "color" {
    value = { r = 1.0, g = 0.5, b = 0.0, a = 1.0 }
  }

  connect {
    from = dot.shape
    to = render.shape
  }
}
`;
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks).toHaveLength(1);
    expect(result.document.blocks[0].type).toBe('patch');
    expect(result.document.blocks[0].labels).toEqual(['Test']);
    expect(result.document.blocks[0].children).toHaveLength(3);
    expect(result.document.blocks[0].children[0].type).toBe('block');
    expect(result.document.blocks[0].children[1].type).toBe('block');
    expect(result.document.blocks[0].children[2].type).toBe('connect');
  });

  it('recovers from missing closing brace', () => {
    const input = 'block "A" { foo = 1\nblock "B" {}';
    const result = parseHcl(input);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should still parse second block
    expect(result.document.blocks.length).toBeGreaterThan(0);
  });

  it('recovers from invalid attribute syntax', () => {
    const input = `
block "A" {
  invalid syntax here
}
block "B" {}
`;
    const result = parseHcl(input);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should still parse both blocks
    expect(result.document.blocks.length).toBe(2);
  });

  it('handles multiple top-level blocks', () => {
    const input = `
block "A" {}
block "B" {}
block "C" {}
`;
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks).toHaveLength(3);
  });

  it('handles comments in input', () => {
    const input = `
# This is a comment
block "Test" {
  # Another comment
  foo = 42  # Inline comment
}
`;
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks).toHaveLength(1);
    expect(result.document.blocks[0].attributes.foo).toEqual({ kind: 'number', value: 42 });
  });

  it('tracks positions in AST nodes', () => {
    const input = 'block "Test" {}';
    const result = parseHcl(input);
    expect(result.errors).toHaveLength(0);
    expect(result.document.blocks[0].pos.start).toBe(0);
    expect(result.document.blocks[0].pos.end).toBeGreaterThan(0);
  });
});
