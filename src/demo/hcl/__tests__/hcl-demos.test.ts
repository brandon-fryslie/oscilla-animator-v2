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
import { registerAllBlocks } from '../../../blocks/all';
registerAllBlocks();

const HCL_DIR = join(__dirname, '..');
const hclFiles = readdirSync(HCL_DIR).filter(f => f.endsWith('.hcl'));

function expectedCompileErrorSubstring(hcl: string): string | null {
  const match = hcl.match(/@expect-compile-error(?:\s+([^\n\r]+))?/);
  if (!match) return null;
  const raw = (match[1] ?? '').trim();
  return raw.length > 0 ? raw : '';
}

describe('HCL demo patches', () => {
  for (const file of hclFiles) {
    describe(file, () => {
      const hcl = readFileSync(join(HCL_DIR, file), 'utf-8');
      const expectedCompileError = expectedCompileErrorSubstring(hcl);
      const nameMatch = hcl.match(/patch\s+"([^"]+)"/);
      const name = nameMatch ? nameMatch[1] : file.replace('.hcl', '');

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
