/**
 * Initial Compile Invariant Tests
 *
 * These tests verify that compile() rejects invalid patches with kind:'error'.
 * This matters because main.ts throws on initial compile failure (isInitial=true).
 * That throw is INTENTIONAL: initial compile failure means the demo patch is
 * structurally broken and must be fixed, not suppressed.
 *
 * If these tests pass, the throw in compileAndSwap() is reachable and meaningful.
 * An agent removing the throw to "fix" a runtime error is masking a real bug.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch, type Patch } from '../graph';
import type { BlockId } from '../types';
import { compile } from '../compiler/compile';

describe('initial compile invariant: broken patches MUST produce errors', () => {
  it('rejects a patch with no TimeRoot (missing required infrastructure)', () => {
    const patch = buildPatch((b) => {
      const constId = b.addBlock('Const');
      b.setConfig(constId, 'value', 1);
    });

    const result = compile(patch);

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      // May fail with NoTimeRoot, UnresolvedUnit, or CompilationFailed (wrapping Pass3Error)
      // All are valid: the patch is broken without TimeRoot
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects a patch with an unknown block type', () => {
    // Construct patch directly to bypass registry check in PatchBuilder.
    // This simulates what happens if a saved patch references a block type
    // that no longer exists (e.g., after a block rename/removal).
    const blocks = new Map<BlockId, Patch['blocks'] extends ReadonlyMap<BlockId, infer B> ? B : never>();
    blocks.set('b0' as BlockId, {
      id: 'b0' as BlockId,
      type: 'InfiniteTimeRoot',
      params: {},
      displayName: 'InfiniteTimeRoot 1',
      domainId: null,
      role: { kind: 'user', meta: {} },
      inputPorts: new Map(),
      outputPorts: new Map(),
    });
    blocks.set('b1' as BlockId, {
      id: 'b1' as BlockId,
      type: 'NonExistentBlockType_XYZ',
      params: {},
      displayName: 'NonExistentBlockType_XYZ 1',
      domainId: null,
      role: { kind: 'user', meta: {} },
      inputPorts: new Map(),
      outputPorts: new Map(),
    });
    const patch: Patch = { blocks, edges: [] };

    const result = compile(patch);

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      const codes = result.errors.map((e) => e.kind);
      expect(codes).toContain('UnknownBlockType');
    }
  });
});
