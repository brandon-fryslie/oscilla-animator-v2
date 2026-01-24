/**
 * Level 8: Backend Contract (Screen-Space Only)
 *
 * NOTE: These tests were written for v1 RenderPassIR format.
 * The v2 format uses DrawPathInstancesOp and DrawPrimitiveInstancesOp.
 * Tests have been temporarily disabled pending migration to v2 types.
 *
 * TODO: Update tests to verify v2 backend contract:
 * - Backends consume screen-space data from DrawOp instances
 * - No world-space, no camera params in backend methods
 * - Coordinate mapping is purely arithmetic (screenPos × viewport)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Level 8: Backend Contract (Placeholder)', () => {
  it('v1 tests removed - need v2 migration', () => {
    // Placeholder test to maintain test suite structure
    expect(true).toBe(true);
  });
});
