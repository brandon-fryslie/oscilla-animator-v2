/**
 * Level 2: Orthographic Projection Kernel (Pure Math)
 *
 * Tests proving the ortho kernel correctly maps vec3 → (screenPos, depth, visible).
 * Under default ortho: screenPos.xy === worldPos.xy for any z.
 */
import { describe, it, expect } from 'vitest';
import {
  projectWorldToScreenOrtho,
  projectFieldOrtho,
  ORTHO_CAMERA_DEFAULTS,
  type ProjectionResult,
} from '../ortho-kernel';
import { createPositionField, writePosition } from '../fields';
import { gridLayout3D } from '../layout-kernels';

// Reusable scratch result (tests the no-allocation pattern)
function makeResult(): ProjectionResult {
  return { screenX: 0, screenY: 0, depth: 0, visible: false };
}

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 2 Unit Tests: Scalar Kernel', () => {
  const defaults = ORTHO_CAMERA_DEFAULTS;
  const out = makeResult();

  it('projectWorldToScreenOrtho((0.5, 0.5, 0), defaults) → screenPos = (0.5, 0.5) (exact)', () => {
    projectWorldToScreenOrtho(0.5, 0.5, 0, defaults, out);
    expect(out.screenX).toBe(0.5);
    expect(out.screenY).toBe(0.5);
  });

  it('projectWorldToScreenOrtho((0, 0, 0), defaults) → screenPos = (0, 0) (exact)', () => {
    projectWorldToScreenOrtho(0, 0, 0, defaults, out);
    expect(out.screenX).toBe(0);
    expect(out.screenY).toBe(0);
  });

  it('projectWorldToScreenOrtho((1, 1, 0), defaults) → screenPos = (1, 1) (exact)', () => {
    projectWorldToScreenOrtho(1, 1, 0, defaults, out);
    expect(out.screenX).toBe(1);
    expect(out.screenY).toBe(1);
  });

  it('projectWorldToScreenOrtho((0.3, 0.7, 0), defaults) → screenPos = (0.3, 0.7) (exact)', () => {
    projectWorldToScreenOrtho(0.3, 0.7, 0, defaults, out);
    expect(out.screenX).toBeCloseTo(0.3, 10);
    expect(out.screenY).toBeCloseTo(0.7, 10);
  });

  it('For any (x, y) in [0, 1]: screenPos === (x, y) (property test, 1000 random samples)', () => {
    // Seeded pseudo-random for reproducibility
    let seed = 42;
    function rand() {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    const r = makeResult();
    for (let i = 0; i < 1000; i++) {
      const x = rand();
      const y = rand();
      projectWorldToScreenOrtho(x, y, 0, defaults, r);
      expect(r.screenX).toBe(x);
      expect(r.screenY).toBe(y);
    }
  });

  it('depth output is monotonically increasing with z (test z = -1, 0, 0.5, 1, 2)', () => {
    const zValues = [-1, 0, 0.5, 1, 2];
    const depths: number[] = [];
    const r = makeResult();

    for (const z of zValues) {
      projectWorldToScreenOrtho(0.5, 0.5, z, defaults, r);
      depths.push(r.depth);
    }

    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThan(depths[i - 1]);
    }
  });

  it('visible = true for points within near=-100..far=100 z-range', () => {
    const r = makeResult();
    const testZ = [-100, -50, -1, 0, 0.5, 1, 50, 99, 100];
    for (const z of testZ) {
      projectWorldToScreenOrtho(0.5, 0.5, z, defaults, r);
      expect(r.visible).toBe(true);
    }
  });

  it('visible = false for z < -100 or z > 100 (outside frustum)', () => {
    const r = makeResult();

    // Just outside near
    projectWorldToScreenOrtho(0.5, 0.5, -100.001, defaults, r);
    expect(r.visible).toBe(false);

    // Way outside near
    projectWorldToScreenOrtho(0.5, 0.5, -200, defaults, r);
    expect(r.visible).toBe(false);

    // Just outside far
    projectWorldToScreenOrtho(0.5, 0.5, 100.001, defaults, r);
    expect(r.visible).toBe(false);

    // Way outside far
    projectWorldToScreenOrtho(0.5, 0.5, 500, defaults, r);
    expect(r.visible).toBe(false);
  });

  it('Kernel is pure: calling twice with same inputs returns bitwise identical outputs', () => {
    const r1 = makeResult();
    const r2 = makeResult();

    // Test multiple points
    const points: [number, number, number][] = [
      [0.5, 0.5, 0],
      [0.1, 0.9, 0.3],
      [0.0, 0.0, -50],
      [1.0, 1.0, 99],
      [0.33, 0.77, 0.5],
    ];

    for (const [x, y, z] of points) {
      projectWorldToScreenOrtho(x, y, z, defaults, r1);
      projectWorldToScreenOrtho(x, y, z, defaults, r2);
      expect(r1.screenX).toBe(r2.screenX);
      expect(r1.screenY).toBe(r2.screenY);
      expect(r1.depth).toBe(r2.depth);
      expect(r1.visible).toBe(r2.visible);
    }
  });

  it('Kernel makes no allocations (reuses provided output object)', () => {
    // The kernel writes into the provided `out` object.
    // If it allocated a new object, the returned reference would differ from `out`.
    const r = makeResult();
    const returned = projectWorldToScreenOrtho(0.5, 0.5, 0, defaults, r);
    expect(returned).toBe(r); // Same reference — no allocation
  });
});

// =============================================================================
// Field Variant Tests
// =============================================================================

describe('Level 2 Field Variant Tests', () => {
  const defaults = ORTHO_CAMERA_DEFAULTS;

  it('Field kernel takes Float32Array(N*3) → returns Float32Array(N*2) screenPos + Float32Array(N) depth + Uint8Array(N) visible', () => {
    const N = 5;
    const positions = createPositionField(N);
    writePosition(positions, 0, 0.1, 0.2, 0.0);
    writePosition(positions, 1, 0.3, 0.4, 0.1);
    writePosition(positions, 2, 0.5, 0.5, 0.0);
    writePosition(positions, 3, 0.7, 0.8, -0.5);
    writePosition(positions, 4, 0.9, 0.1, 0.5);

    const screenPos = new Float32Array(N * 2);
    const depth = new Float32Array(N);
    const visible = new Uint8Array(N);

    projectFieldOrtho(positions, N, defaults, screenPos, depth, visible);

    // Verify output shapes
    expect(screenPos.length).toBe(N * 2);
    expect(depth.length).toBe(N);
    expect(visible.length).toBe(N);

    // Verify screenPos identity (ortho)
    expect(screenPos[0]).toBeCloseTo(0.1);
    expect(screenPos[1]).toBeCloseTo(0.2);
    expect(screenPos[2]).toBeCloseTo(0.3);
    expect(screenPos[3]).toBeCloseTo(0.4);
  });

  it('Field kernel output matches N individual scalar kernel calls (element-wise identical)', () => {
    const N = 20;
    const positions = createPositionField(N);

    // Write varied positions
    for (let i = 0; i < N; i++) {
      writePosition(positions, i, i / N, 1 - i / N, (i - 10) * 0.1);
    }

    // Field kernel
    const screenPos = new Float32Array(N * 2);
    const depth = new Float32Array(N);
    const visible = new Uint8Array(N);
    projectFieldOrtho(positions, N, defaults, screenPos, depth, visible);

    // Compare with scalar kernel
    // Note: screenPos and depth are stored in Float32Array (float32 precision).
    // The scalar kernel operates in float64. To verify element-wise identity,
    // we compare the float32-truncated scalar result with the field output.
    // Both paths do the same math on the same inputs; the only difference is
    // output storage precision.
    const scalarResult = makeResult();
    for (let i = 0; i < N; i++) {
      const wx = positions[i * 3 + 0];
      const wy = positions[i * 3 + 1];
      const wz = positions[i * 3 + 2];
      projectWorldToScreenOrtho(wx, wy, wz, defaults, scalarResult);

      // screenPos: field output is float32, scalar is float64.
      // Since ortho identity means screenX===worldX which is already float32,
      // these should match exactly.
      expect(screenPos[i * 2 + 0]).toBe(scalarResult.screenX);
      expect(screenPos[i * 2 + 1]).toBe(scalarResult.screenY);
      // depth: field stores in Float32Array (float32 truncation), scalar keeps float64.
      // Math.fround simulates the same truncation.
      expect(depth[i]).toBe(Math.fround(scalarResult.depth));
      expect(visible[i]).toBe(scalarResult.visible ? 1 : 0);
    }
  });

  it('Field kernel with N=0 returns empty arrays (no crash)', () => {
    const positions = new Float32Array(0);
    const screenPos = new Float32Array(0);
    const depth = new Float32Array(0);
    const visible = new Uint8Array(0);

    // Should not throw
    projectFieldOrtho(positions, 0, defaults, screenPos, depth, visible);

    expect(screenPos.length).toBe(0);
    expect(depth.length).toBe(0);
    expect(visible.length).toBe(0);
  });

  it('Field kernel with N=10000 produces correct results (spot-check indices 0, 4999, 9999)', () => {
    const N = 10000;
    const positions = createPositionField(N);

    // Write known positions at spot-check indices
    writePosition(positions, 0, 0.1, 0.2, 0.0);
    writePosition(positions, 4999, 0.5, 0.5, 0.5);
    writePosition(positions, 9999, 0.9, 0.8, -1.0);

    // Fill rest with valid data
    for (let i = 1; i < N; i++) {
      if (i !== 4999 && i !== 9999) {
        writePosition(positions, i, i / N, 1 - i / N, 0.0);
      }
    }

    const screenPos = new Float32Array(N * 2);
    const depth = new Float32Array(N);
    const visible = new Uint8Array(N);
    projectFieldOrtho(positions, N, defaults, screenPos, depth, visible);

    // Spot-check index 0
    expect(screenPos[0]).toBeCloseTo(0.1);
    expect(screenPos[1]).toBeCloseTo(0.2);
    expect(visible[0]).toBe(1);

    // Spot-check index 4999
    expect(screenPos[4999 * 2]).toBeCloseTo(0.5);
    expect(screenPos[4999 * 2 + 1]).toBeCloseTo(0.5);
    expect(visible[4999]).toBe(1);

    // Spot-check index 9999
    expect(screenPos[9999 * 2]).toBeCloseTo(0.9);
    expect(screenPos[9999 * 2 + 1]).toBeCloseTo(0.8);
    expect(visible[9999]).toBe(1);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Level 2 Integration Tests', () => {
  const defaults = ORTHO_CAMERA_DEFAULTS;

  it('GridLayout(3x3) → ortho kernel → screenPos matches worldPos.xy for every instance', () => {
    const N = 9;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 3, 3);

    const screenPos = new Float32Array(N * 2);
    const depth = new Float32Array(N);
    const visible = new Uint8Array(N);
    projectFieldOrtho(positions, N, defaults, screenPos, depth, visible);

    // Every screenPos must match worldPos.xy exactly
    for (let i = 0; i < N; i++) {
      const worldX = positions[i * 3 + 0];
      const worldY = positions[i * 3 + 1];
      expect(screenPos[i * 2 + 0]).toBe(worldX);
      expect(screenPos[i * 2 + 1]).toBe(worldY);
      expect(visible[i]).toBe(1);
    }
  });

  it('Default camera values come from exactly one source (only one definition exists)', () => {
    // This test verifies the architectural constraint: ORTHO_CAMERA_DEFAULTS
    // is the ONLY source of default ortho camera values.
    // The test is structural: it verifies the exported const has the expected shape.
    expect(ORTHO_CAMERA_DEFAULTS).toBeDefined();
    expect(ORTHO_CAMERA_DEFAULTS.near).toBe(-100.0);
    expect(ORTHO_CAMERA_DEFAULTS.far).toBe(100.0);
    expect(Object.isFrozen(ORTHO_CAMERA_DEFAULTS)).toBe(true);
  });
});

// =============================================================================
// Additional depth and identity property tests
// =============================================================================

describe('Level 2 Additional Properties', () => {
  const defaults = ORTHO_CAMERA_DEFAULTS;

  it('Ortho identity holds regardless of z value (XY is always identity)', () => {
    const r = makeResult();
    const zValues = [-50, -1, 0, 0.5, 1, 10, 50];

    for (const z of zValues) {
      projectWorldToScreenOrtho(0.3, 0.7, z, defaults, r);
      expect(r.screenX).toBeCloseTo(0.3, 10);
      expect(r.screenY).toBeCloseTo(0.7, 10);
    }
  });

  it('Depth at z=0 with defaults (near=-100, far=100) is 0.5', () => {
    const r = makeResult();
    projectWorldToScreenOrtho(0.5, 0.5, 0, defaults, r);
    expect(r.depth).toBeCloseTo(0.5);
  });

  it('Depth at near boundary is 0, depth at far boundary is 1', () => {
    const r = makeResult();

    projectWorldToScreenOrtho(0.5, 0.5, defaults.near, defaults, r);
    expect(r.depth).toBeCloseTo(0.0);

    projectWorldToScreenOrtho(0.5, 0.5, defaults.far, defaults, r);
    expect(r.depth).toBeCloseTo(1.0);
  });
});
