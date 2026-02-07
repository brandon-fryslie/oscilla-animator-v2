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
    const id = builder.addBlock('Const', { displayName: 'test' });
    builder.setConfig(id, 'value', 42);
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('block "Const" "test"');
    expect(hcl).toContain('value = 42');
  });

  it('serializes edge between blocks as inline outputs', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', { displayName: 'a' });
    const b = builder.addBlock('Const', { displayName: 'b' });
    builder.wire(a, 'out', b, 'value');
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('block "Const" "a"');
    expect(hcl).toContain('block "Const" "b"');
    expect(hcl).toContain('outputs {');
    expect(hcl).toContain('out = b.value');
    expect(hcl).not.toContain('connect');
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

  it('skips derived edges in outputs', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', { displayName: 'a' });
    const b = builder.addBlock('Const', { displayName: 'b' });

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

    // Should only have one output line (the user edge)
    const outCount = (hcl.match(/out = b\.value/g) || []).length;
    expect(outCount).toBe(1);
    expect(hcl).not.toContain('connect');
  });

  it('sorts blocks deterministically', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { displayName: 'zebra' });
    builder.addBlock('Const', { displayName: 'apple' });
    builder.addBlock('Const', { displayName: 'banana' });
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
    const id = builder.addBlock('Const', { displayName: 'test' });
    builder.setConfig(id, 'zulu', 3);
    builder.setConfig(id, 'alpha', 1);
    builder.setConfig(id, 'mike', 2);
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
    builder.addBlock('Const', { displayName: 'time', role: { kind: 'timeRoot', meta: {} } });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('role = "timeRoot"');
  });

  it('emits domain if non-null', () => {
    const builder = new PatchBuilder();
    builder.addBlock('Const', { displayName: 'test', domainId: 'circle1' });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('domain = "circle1"');
  });

  it('skips disabled edges from outputs', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', { displayName: 'a' });
    const b = builder.addBlock('Const', { displayName: 'b' });
    builder.wire(a, 'out', b, 'value', { enabled: false });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    // Disabled edges should not appear in outputs
    expect(hcl).not.toContain('outputs');
    expect(hcl).not.toContain('b.value');
  });

  it('escapes special characters in strings', () => {
    const builder = new PatchBuilder();
    const id = builder.addBlock('Const', { displayName: 'test' });
    builder.setConfig(id, 'message', 'Hello "world"');
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('message = "Hello \\"world\\""');
  });

  it('emits arrays', () => {
    const builder = new PatchBuilder();
    const id = builder.addBlock('Const', { displayName: 'test' });
    builder.setConfig(id, 'values', [1, 2, 3]);
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('values = [1, 2, 3]');
  });

  it('emits objects', () => {
    const builder = new PatchBuilder();
    const id = builder.addBlock('Const', { displayName: 'test' });
    builder.setConfig(id, 'color', { r: 1.0, g: 0.5, b: 0.0, a: 1.0 });
    const patch = builder.build();

    const hcl = serializePatchToHCL(patch);

    // Should have object notation with sorted keys
    expect(hcl).toContain('color = {');
    expect(hcl).toContain('a = 1');
    expect(hcl).toContain('b = 0');
    expect(hcl).toContain('g = 0.5');
    expect(hcl).toContain('r = 1');
  });

  it('emits lenses', () => {
    const builder = new PatchBuilder();
    const a = builder.addBlock('Const', { displayName: 'a' });
    const b = builder.addBlock('Phasor', { displayName: 'phasor' });

    // Add lens to port (use 'frequency' which exists on Phasor)
    builder.addLens(b, 'frequency', 'Adapter_DegreesToRadians', 'v1:blocks.a.outputs.out');

    const patch = builder.build();
    const hcl = serializePatchToHCL(patch);

    expect(hcl).toContain('lens "Adapter_DegreesToRadians"');
    expect(hcl).toContain('sourceAddress = "v1:blocks.a.outputs.out"');
  });
});
