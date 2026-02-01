/**
 * Tests for Patch → HCL serializer
 */

import { describe, it, expect } from 'vitest';
import { serializePatchToHCL } from '../serialize';
import { PatchBuilder } from '../../graph/Patch';

// Import blocks to trigger registration
import '../../blocks/all';

describe('serialize', () => {
  it('serializes empty patch', () => {
    const patch = new PatchBuilder().build();
    const hcl = serializePatchToHCL(patch, { name: 'Empty' });

    expect(hcl).toContain('patch "Empty"');
    expect(hcl).toContain('{\n}');
  });

  it('serializes simple block with params', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Ellipse', { rx: 0.02, ry: 0.02 }, { displayName: 'dot' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('block "Ellipse" "dot"');
    expect(hcl).toContain('rx = 0.02');
    expect(hcl).toContain('ry = 0.02');
  });

  it('serializes edge between blocks', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', {}, { displayName: 'a' });
    const b = builder.addBlock('Const', {}, { displayName: 'b' });
    builder.wire(a, 'out', b, 'value');
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('block "Const" "a"');
    expect(hcl).toContain('block "Const" "b"');
    expect(hcl).toContain('connect');
    expect(hcl).toContain('from = a.out');
    expect(hcl).toContain('to = b.value');
  });

  it('handles block name collisions', () => {
    // Build Patch manually to bypass collision prevention in PatchBuilder
    const blocks = new Map();
    const b1 = {
      id: 'b1' as any,
      type: 'Const',
      params: {},
      displayName: 'foo',
      domainId: null,
      role: { kind: 'user', meta: {} },
      inputPorts: new Map([['value', { id: 'value', combineMode: 'last' as any }]]),
      outputPorts: new Map([['out', { id: 'out' }]]),
    };
    const b2 = {
      id: 'b2' as any,
      type: 'Const',
      params: {},
      displayName: 'foo',
      domainId: null,
      role: { kind: 'user', meta: {} },
      inputPorts: new Map([['value', { id: 'value', combineMode: 'last' as any }]]),
      outputPorts: new Map([['out', { id: 'out' }]]),
    };
    blocks.set('b1', b1);
    blocks.set('b2', b2);
    const patch = { blocks, edges: [] };

    const hcl = serializePatchToHCL(patch as any);

    // Should have foo and foo_2
    expect(hcl).toContain('block "Const" "foo"');
    expect(hcl).toContain('block "Const" "foo_2"');
  });

  it('skips derived edges', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', {}, { displayName: 'a' });
    const b = builder.addBlock('Const', {}, { displayName: 'b' });

    // Add user edge
    builder.wire(a, 'out', b, 'value');

    // Add derived edge manually
    builder.addEdge(
      { kind: 'port', blockId: a, slotId: 'out' },
      { kind: 'port', blockId: b, slotId: 'value' },
      { role: { kind: 'default', meta: { defaultSourceBlockId: a } } }
    );

    const patch = builder.build();
    const hcl = serializePatchToHCL(patch);

    // Should only have one connect block (the user edge)
    const connectCount = (hcl.match(/connect/g) || []).length;
    expect(connectCount).toBe(1);
  });

  it('sorts blocks deterministically', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', {}, { displayName: 'zebra' });
    builder.addBlock('Const', {}, { displayName: 'apple' });
    builder.addBlock('Const', {}, { displayName: 'banana' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    // Find positions of block declarations
    const applePos = hcl.indexOf('block "Const" "apple"');
    const bananaPos = hcl.indexOf('block "Const" "banana"');
    const zebraPos = hcl.indexOf('block "Const" "zebra"');

    // Should be in alphabetical order
    expect(applePos).toBeLessThan(bananaPos);
    expect(bananaPos).toBeLessThan(zebraPos);
  });

  it('sorts params within blocks', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { zulu: 3, alpha: 1, mike: 2 }, { displayName: 'test' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    const alphaPos = hcl.indexOf('alpha = 1');
    const mikePos = hcl.indexOf('mike = 2');
    const zuluPos = hcl.indexOf('zulu = 3');

    expect(alphaPos).toBeLessThan(mikePos);
    expect(mikePos).toBeLessThan(zuluPos);
  });

  it('emits role if not user', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', {}, { displayName: 'time', role: { kind: 'timeRoot', meta: {} } });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('role = "timeRoot"');
  });

  it('emits domain if non-null', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', {}, { displayName: 'test', domainId: 'circle1' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('domain = "circle1"');
  });

  it('emits disabled edges', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', {}, { displayName: 'a' });
    const b = builder.addBlock('Const', {}, { displayName: 'b' });
    builder.wire(a, 'out', b, 'value', { enabled: false });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('enabled = false');
  });

  it('escapes special characters in strings', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { message: 'Hello "world"' }, { displayName: 'test' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('message = "Hello \\"world\\""');
  });

  it('emits arrays', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { values: [1, 2, 3] }, { displayName: 'test' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('values = [1, 2, 3]');
  });

  it('emits objects', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { color: { r: 1.0, g: 0.5, b: 0.0, a: 1.0 } }, { displayName: 'test' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    // Should have object notation with sorted keys
    expect(hcl).toContain('color = {');
    expect(hcl).toContain('a = 1');
    expect(hcl).toContain('b = 0');
    expect(hcl).toContain('g = 0.5');
    expect(hcl).toContain('r = 1');
  });

  it('emits vararg connections', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', {}, { displayName: 'a' });
    const b = builder.addBlock('Const', {}, { displayName: 'b' });
    const c = builder.addBlock('Array', {}, { displayName: 'arr' });

    // Add vararg connections to Array.element (Array has vararg support)
    builder.addVarargConnection(c, 'element', 'blocks.a.outputs.out', 0, 'first');
    builder.addVarargConnection(c, 'element', 'blocks.b.outputs.out', 1, 'second');

    const patch = builder.build();
    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('vararg "element"');
    expect(hcl).toContain('sourceAddress = "blocks.a.outputs.out"');
    expect(hcl).toContain('alias = "first"');
    expect(hcl).toContain('sourceAddress = "blocks.b.outputs.out"');
    expect(hcl).toContain('alias = "second"');
  });

  it('emits lenses', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', {}, { displayName: 'a' });
    const b = builder.addBlock('Phasor', {}, { displayName: 'phasor' });

    // Add lens to port (use 'frequency' which exists on Phasor)
    builder.addLens(b, 'frequency', 'Adapter_DegreesToRadians', 'v1:blocks.a.outputs.out');

    const patch = builder.build();
    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('lens "Adapter_DegreesToRadians"');
    expect(hcl).toContain('sourceAddress = "v1:blocks.a.outputs.out"');
  });
});
