/**
 * Type 2 Parametric Shape — Contract Tests
 *
 * // [LAW:one-type-per-behavior] Type 2 is NOT a Type 1 extension. These tests
 * // verify the parametric class has its own distinct data contracts across
 * // compile → runtime → render boundaries.
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md
 */

import { describe, expect, it } from 'vitest';
import { ShapeClass, TopologyMode } from '../types';
import type { ParametricTopologyDef } from '../types';
import {
  registerDynamicTopology,
  getTopology,
  isParametricTopology,
  generateParametricTemplate,
  parametricRibbonVertexCount,
} from '../registry';
import {
  SHAPE_BANK_HEADER_WORDS,
  ShapeBankHeaderWord,
} from '../../runtime/RuntimeState';

// ---------------------------------------------------------------------------
// ParametricTopologyDef contract
// ---------------------------------------------------------------------------

describe('ParametricTopologyDef', () => {
  it('registers with distinct topology ID', () => {
    const id = registerDynamicTopology(
      {
        params: [],
        parametric: true,
        degree: 4,
        resolution: 16,
        closed: false,
        ribbonWidth: 0.02,
      },
      'test-cubic-bezier-open',
    );
    expect(id).toBeGreaterThanOrEqual(100); // dynamic IDs start at 100
    const topology = getTopology(id);
    expect(topology).toBeDefined();
    expect(isParametricTopology(topology)).toBe(true);
  });

  it('structurally interns identical parametric topologies', () => {
    const id1 = registerDynamicTopology({
      params: [],
      parametric: true,
      degree: 4,
      resolution: 32,
      closed: true,
      ribbonWidth: 0.05,
    });
    const id2 = registerDynamicTopology({
      params: [],
      parametric: true,
      degree: 4,
      resolution: 32,
      closed: true,
      ribbonWidth: 0.05,
    });
    expect(id1).toBe(id2);
  });

  it('assigns different IDs for different resolutions', () => {
    const id1 = registerDynamicTopology({
      params: [],
      parametric: true,
      degree: 4,
      resolution: 8,
      closed: false,
      ribbonWidth: 0.01,
    });
    const id2 = registerDynamicTopology({
      params: [],
      parametric: true,
      degree: 4,
      resolution: 64,
      closed: false,
      ribbonWidth: 0.01,
    });
    expect(id1).not.toBe(id2);
  });

  it('is distinct from path topologies', () => {
    const parametricId = registerDynamicTopology({
      params: [],
      parametric: true,
      degree: 4,
      resolution: 16,
      closed: false,
      ribbonWidth: 0.02,
    });
    const topology = getTopology(parametricId);
    // Parametric topology should NOT have path-specific fields
    expect('verbs' in topology).toBe(false);
    expect('pointsPerVerb' in topology).toBe(false);
    expect('totalControlPoints' in topology).toBe(false);
    // But SHOULD have parametric-specific fields
    expect(isParametricTopology(topology)).toBe(true);
    const parametric = topology as ParametricTopologyDef;
    expect(parametric.degree).toBe(4);
    expect(parametric.resolution).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Template t-value generation
// ---------------------------------------------------------------------------

describe('generateParametricTemplate', () => {
  it('generates R+1 evenly-spaced values from 0 to 1', () => {
    const template = generateParametricTemplate(4);
    expect(template.length).toBe(5);
    expect(template[0]).toBeCloseTo(0.0);
    expect(template[1]).toBeCloseTo(0.25);
    expect(template[2]).toBeCloseTo(0.5);
    expect(template[3]).toBeCloseTo(0.75);
    expect(template[4]).toBeCloseTo(1.0);
  });

  it('generates single-segment template', () => {
    const template = generateParametricTemplate(1);
    expect(template.length).toBe(2);
    expect(template[0]).toBeCloseTo(0.0);
    expect(template[1]).toBeCloseTo(1.0);
  });

  it('is bitcast-ready (Float32Array → Uint32Array)', () => {
    const template = generateParametricTemplate(4);
    const u32View = new Uint32Array(template.buffer);
    // First value is 0.0, which bitcasts to u32(0)
    expect(u32View[0]).toBe(0);
    // Last value is 1.0, which bitcasts to u32(0x3F800000)
    expect(u32View[4]).toBe(0x3F800000);
  });
});

// ---------------------------------------------------------------------------
// Vertex count calculation
// ---------------------------------------------------------------------------

describe('parametricRibbonVertexCount', () => {
  it('produces 6 vertices per segment (2 triangles × 3 verts)', () => {
    expect(parametricRibbonVertexCount(1)).toBe(6);
    expect(parametricRibbonVertexCount(4)).toBe(24);
    expect(parametricRibbonVertexCount(64)).toBe(384);
  });
});

// ---------------------------------------------------------------------------
// ShapeBank header ABI for Type 2
// ---------------------------------------------------------------------------

describe('Type 2 ShapeBank header ABI', () => {
  it('Type2Parametric Kind value is 2 (matches WGSL SHAPE_CLASS_TYPE2_PARAMETRIC)', () => {
    // This MUST match the WGSL constant SHAPE_CLASS_TYPE2_PARAMETRIC = 2u
    expect(ShapeClass.Type2Parametric).toBe(2);
  });

  it('ShapeBank header layout supports Type 2 fields', () => {
    // Type 2 reuses existing header words with Type2-specific semantics:
    // - ParamBlockOffset (word 9): offset to template t-values in ShapeBank
    // - ParamBlockWords (word 10): number of template t-values
    // - BoundsMinPacked (word 12): curve degree (number of CPs)
    // - BoundsMaxPacked (word 13): ribbon width (bitcast f32→u32)
    expect(ShapeBankHeaderWord.ParamBlockOffset).toBe(9);
    expect(ShapeBankHeaderWord.ParamBlockWords).toBe(10);
    expect(ShapeBankHeaderWord.BoundsMinPacked).toBe(12);
    expect(ShapeBankHeaderWord.BoundsMaxPacked).toBe(13);
    // CP arena addressing (same as Type 1)
    expect(ShapeBankHeaderWord.CpArenaBaseOffset).toBe(11);
    expect(ShapeBankHeaderWord.CpArenaLaneStride).toBe(14);
    expect(ShapeBankHeaderWord.CpArenaComponentStride).toBe(15);
  });

  it('header is exactly 16 words', () => {
    expect(SHAPE_BANK_HEADER_WORDS).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Type 2 is NOT Type 1
// ---------------------------------------------------------------------------

describe('Type 2 vs Type 1 separation', () => {
  it('ShapeClass.Type2Parametric !== ShapeClass.Type1Rigid', () => {
    expect(ShapeClass.Type2Parametric).not.toBe(ShapeClass.Type1Rigid);
  });

  it('parametric topologies are not path topologies', () => {
    const id = registerDynamicTopology({
      params: [],
      parametric: true,
      degree: 4,
      resolution: 16,
      closed: false,
      ribbonWidth: 0.02,
    });
    const topology = getTopology(id);
    // Type guard should identify it as parametric, not path
    expect(isParametricTopology(topology)).toBe(true);
    // Should NOT have path verbs
    expect('verbs' in topology).toBe(false);
  });
});
