/**
 * Tests for hand-written HCL demo patches.
 *
 * Verifies each .hcl file:
 * 1. Deserializes without errors
 * 2. Produces a non-empty patch (blocks + edges)
 * 3. Compiles without errors (full frontend + backend pipeline)
 * 4. Round-trips: serialize → deserialize → serialize produces identical output
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { deserializePatchFromHCL, serializePatchToHCL } from '../../../patch-dsl/index';
import { compile } from '../../../compiler/compile';
import { hclDemos } from '../../hcl-demos';
import { registerAllBlocks } from '../../../blocks/all';
registerAllBlocks();

const HCL_DIR = join(__dirname, '..');

function listHclFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === '__tests__') {
        return [];
      }
      if (entry.isDirectory()) {
        return listHclFiles(join(dir, entry.name), `${prefix}${entry.name}/`);
      }
      return entry.name.endsWith('.hcl') ? [`${prefix}${entry.name}`] : [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function expectedCompileErrorSubstring(hcl: string): string | null {
  const match = hcl.match(/@expect-compile-error(?:\s+([^\n\r]+))?/);
  if (!match) return null;
  const raw = (match[1] ?? '').trim();
  return raw.length > 0 ? raw : '';
}

describe('HCL demo patches', () => {
  it('catalog is the complete source of truth for demo files', () => {
    const diskFiles = listHclFiles(HCL_DIR);
    const catalogFiles = hclDemos.map((entry) => entry.relativePath).sort((a, b) => a.localeCompare(b));
    expect(catalogFiles).toEqual(diskFiles);
  });

  for (const demo of hclDemos) {
    describe(demo.relativePath, () => {
      const hcl = readFileSync(join(HCL_DIR, demo.relativePath), 'utf-8');
      const expectedCompileError = expectedCompileErrorSubstring(hcl);
      const name = demo.name;

      let parsed!: ReturnType<typeof deserializePatchFromHCL>;
      let compileResult: ReturnType<typeof compile> | null = null;

      beforeAll(() => {
        parsed = deserializePatchFromHCL(hcl);
        if (parsed.errors.length === 0) {
          compileResult = compile(parsed.patch);
        }
      });

      it('deserializes without errors', () => {
        if (parsed.errors.length > 0) {
          // Print errors for debugging
          for (const err of parsed.errors) {
            console.error(`  ${err}`);
          }
        }
        expect(parsed.errors).toEqual([]);
      });

      it('produces blocks and edges', () => {
        expect(parsed.patch.blocks.size).toBeGreaterThan(0);
        expect(parsed.patch.edges.length).toBeGreaterThan(0);
      });

      it('compiles without errors', () => {
        expect(parsed.errors).toEqual([]);
        expect(compileResult).not.toBeNull();
        const result = compileResult!;
        const msgs = result.kind === 'error' ? result.errors.map((e) => e.message) : [];

        // [LAW:dataflow-not-control-flow] Every demo is compiled; expected failures are asserted as data.
        if (expectedCompileError !== null) {
          expect(result.kind).toBe('error');
          if (expectedCompileError.length > 0) {
            expect(msgs.join('\n')).toContain(expectedCompileError);
          }
          return;
        }

        if (result.kind === 'error') {
          throw new Error(`Compilation failed:\n${msgs.join('\n')}`);
        }
        expect(result.kind).toBe('ok');
      });

      it('emits no naga-lowering coverage gap warnings for successful demos', () => {
        expect(parsed.errors).toEqual([]);
        expect(compileResult).not.toBeNull();
        const result = compileResult!;
        if (expectedCompileError !== null || result.kind !== 'ok') {
          return;
        }
        const incompleteWarning = result.warnings.find((warning) => warning.code === 'W_NAGA_LOWERING_INCOMPLETE');
        expect(incompleteWarning).toBeUndefined();
      });

      it('round-trips through serialize → deserialize', () => {
        expect(parsed.errors).toEqual([]);

        const serialized = serializePatchToHCL(parsed.patch, { name });
        const result2 = deserializePatchFromHCL(serialized);
        expect(result2.errors).toEqual([]);

        // Second serialization should produce identical output
        const serialized2 = serializePatchToHCL(result2.patch, { name });
        expect(serialized2).toBe(serialized);
      });
    });
  }
});
