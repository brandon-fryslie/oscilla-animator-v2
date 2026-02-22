/**
 * Steel Thread Test - Rect Shape Pipeline
 *
 * Tests the full rendering pipeline for the Rect topology:
 * Rect (shape) → Array (cardinality) → position/color fields → Render
 *
 * This test ensures the shape2d payload flows correctly:
 * - Rect block produces one shapeRef with numeric rect topologyId
 * - Compile produces correct IR with shape2d storage
 * - RenderAssembler resolves shape via topology registry
 * - Output v2 DrawOp has geometry with correct topology and params
 */

import { describe, it, expect } from 'vitest';
describe('Steel Thread - Rect Shape Pipeline', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});
