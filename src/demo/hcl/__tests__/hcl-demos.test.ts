/**
 * Tests for hand-written HCL demo patches.
 *
 * Verifies each .hcl file:
 * 1. Deserializes without errors
 * 2. Produces a non-empty patch (blocks + edges)
 * 3. Compiles without errors (full frontend + backend pipeline)
 * 4. Round-trips: serialize → deserialize → serialize produces identical output
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { deserializePatchFromHCL, serializePatchToHCL } from '../../../patch-dsl/index';
import { compile } from '../../../compiler/compile';
import '../../../blocks/all';

const HCL_DIR = join(__dirname, '..');
const hclFiles = readdirSync(HCL_DIR).filter(f => f.endsWith('.hcl'));

describe('HCL demo patches', () => {
  for (const file of hclFiles) {
    describe(file, () => {
      const hcl = readFileSync(join(HCL_DIR, file), 'utf-8');

      it('deserializes without errors', () => {
        const result = deserializePatchFromHCL(hcl);
        if (result.errors.length > 0) {
          // Print errors for debugging
          for (const err of result.errors) {
            console.error(`  ${err}`);
          }
        }
        expect(result.errors).toEqual([]);
      });

      it('produces blocks and edges', () => {
        const result = deserializePatchFromHCL(hcl);
        expect(result.patch.blocks.size).toBeGreaterThan(0);
        expect(result.patch.edges.length).toBeGreaterThan(0);
      });

      it('compiles without errors', () => {
        const { patch, errors } = deserializePatchFromHCL(hcl);
        expect(errors).toEqual([]);

        const result = compile(patch);
        if (result.kind === 'error') {
          const msgs = result.errors.map(e => e.message);
          throw new Error(`Compilation failed:\n${msgs.join('\n')}`);
        }
        expect(result.kind).toBe('ok');
      });

      it('round-trips through serialize → deserialize', () => {
        const result1 = deserializePatchFromHCL(hcl);
        expect(result1.errors).toEqual([]);

        // Extract patch name from HCL for serialization
        const nameMatch = hcl.match(/patch\s+"([^"]+)"/);
        const name = nameMatch ? nameMatch[1] : file.replace('.hcl', '');

        const serialized = serializePatchToHCL(result1.patch, { name });
        const result2 = deserializePatchFromHCL(serialized);
        expect(result2.errors).toEqual([]);

        // Second serialization should produce identical output
        const serialized2 = serializePatchToHCL(result2.patch, { name });
        expect(serialized2).toBe(serialized);
      });
    });
  }
});
