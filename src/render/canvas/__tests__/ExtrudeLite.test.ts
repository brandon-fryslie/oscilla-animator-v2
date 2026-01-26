// ============================================================================
// EXTRUDELITE: 2.5D Relief Rendering (Experimental)
// Unit tests for geometry builder - delete when real mesh3d arrives.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { buildExtrudeLite, type ExtrudeLiteInput, type ExtrudeLiteParams } from '../ExtrudeLite';

describe('ExtrudeLite', () => {
  describe('buildExtrudeLite', () => {
    const defaultParams: ExtrudeLiteParams = {
      extrudeHeight: 0.1,
      lightDir: [1, 0] as const,
      shadeStrength: 1.0,
      sideAlpha: 1.0,
    };

    it('generates correct structure for triangle', () => {
      // Triangle with 3 vertices
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([
          0.5, 0.3, // vertex 0
          0.7, 0.5, // vertex 1
          0.3, 0.5, // vertex 2
        ]),
        fill: [1, 0, 0, 1],
      };

      const plan = buildExtrudeLite([input], defaultParams);

      // Should have 1 back face, 1 side band, 1 front face
      expect(plan.backFaces.length).toBe(1);
      expect(plan.sideBands.length).toBe(1);
      expect(plan.frontFaces.length).toBe(1);

      // Back face should have same number of points (3 vertices = 6 floats)
      expect(plan.backFaces[0].pointsXY.length).toBe(6);

      // Side bands: 3 edges × 4 vertices per quad × 2 coords = 24 floats
      expect(plan.sideBands[0].quadsXY.length).toBe(24);

      // Front face should be original points
      expect(plan.frontFaces[0].pointsXY).toBe(input.pointsXY);
      expect(plan.frontFaces[0].fill).toBe(input.fill);
    });

    it('generates correct structure for quad', () => {
      // Quad with 4 vertices
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([
          0.3, 0.3,
          0.7, 0.3,
          0.7, 0.7,
          0.3, 0.7,
        ]),
        fill: [0, 1, 0, 1],
      };

      const plan = buildExtrudeLite([input], defaultParams);

      expect(plan.backFaces.length).toBe(1);
      expect(plan.sideBands.length).toBe(1);
      expect(plan.frontFaces.length).toBe(1);

      // 4 vertices = 8 floats
      expect(plan.backFaces[0].pointsXY.length).toBe(8);

      // 4 edges × 4 vertices per quad × 2 coords = 32 floats
      expect(plan.sideBands[0].quadsXY.length).toBe(32);
    });

    it('applies offset to back face', () => {
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([
          0.5, 0.5, // vertex 0
          0.6, 0.5, // vertex 1
          0.55, 0.6, // vertex 2
        ]),
        fill: [1, 1, 1, 1],
      };

      const params: ExtrudeLiteParams = {
        extrudeHeight: 0.1,
        lightDir: [1, 0] as const, // horizontal light
        shadeStrength: 1.0,
        sideAlpha: 1.0,
      };

      const plan = buildExtrudeLite([input], params);

      // Back face should be offset by [0.1, 0] (normalized lightDir * height)
      const backX = plan.backFaces[0].pointsXY[0];
      const backY = plan.backFaces[0].pointsXY[1];

      expect(backX).toBeCloseTo(0.5 + 0.1, 5);
      expect(backY).toBeCloseTo(0.5, 5);
    });

    it('darkens back face color', () => {
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([0.5, 0.5, 0.6, 0.6, 0.4, 0.6]),
        fill: [1, 0.5, 0.2, 0.8],
      };

      const plan = buildExtrudeLite([input], defaultParams);

      // Back face color should be 60% of original (RGB), alpha unchanged
      expect(plan.backFaces[0].fill[0]).toBeCloseTo(0.6, 5);
      expect(plan.backFaces[0].fill[1]).toBeCloseTo(0.3, 5);
      expect(plan.backFaces[0].fill[2]).toBeCloseTo(0.12, 5);
      expect(plan.backFaces[0].fill[3]).toBe(0.8);
    });

    it('varies side shading by edge orientation', () => {
      // Create a simple quad facing light from the right
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([
          0.4, 0.4, // bottom-left
          0.6, 0.4, // bottom-right
          0.6, 0.6, // top-right
          0.4, 0.6, // top-left
        ]),
        fill: [1, 1, 1, 1],
      };

      const params: ExtrudeLiteParams = {
        extrudeHeight: 0.05,
        lightDir: [1, 0] as const, // light from right
        shadeStrength: 1.0,
        sideAlpha: 1.0,
      };

      const plan = buildExtrudeLite([input], params);

      // Side color should be influenced by edge normals
      // With light from right [1,0]:
      // - Right edge normal points right: should be bright
      // - Left edge normal points left: should be dark
      // Average should be somewhere in middle range

      const sideColor = plan.sideBands[0].fill;
      expect(sideColor[3]).toBe(1.0); // alpha should be preserved

      // RGB values should be between 0.6 (dark) and 1.0 (bright)
      expect(sideColor[0]).toBeGreaterThanOrEqual(0.6);
      expect(sideColor[0]).toBeLessThanOrEqual(1.0);
    });

    it('handles degenerate polygon (< 3 vertices)', () => {
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([0.5, 0.5, 0.6, 0.6]), // only 2 vertices
        fill: [1, 1, 1, 1],
      };

      const plan = buildExtrudeLite([input], defaultParams);

      // Should skip degenerate polygon
      expect(plan.backFaces.length).toBe(0);
      expect(plan.sideBands.length).toBe(0);
      expect(plan.frontFaces.length).toBe(0);
    });

    it('handles multiple instances', () => {
      const inputs: ExtrudeLiteInput[] = [
        {
          pointsXY: new Float32Array([0.3, 0.3, 0.4, 0.3, 0.35, 0.4]),
          fill: [1, 0, 0, 1],
        },
        {
          pointsXY: new Float32Array([0.6, 0.6, 0.7, 0.6, 0.65, 0.7]),
          fill: [0, 1, 0, 1],
        },
      ];

      const plan = buildExtrudeLite(inputs, defaultParams);

      // Should have 2 of each layer
      expect(plan.backFaces.length).toBe(2);
      expect(plan.sideBands.length).toBe(2);
      expect(plan.frontFaces.length).toBe(2);

      // First instance should have red color
      expect(plan.frontFaces[0].fill).toEqual([1, 0, 0, 1]);
      // Second instance should have green color
      expect(plan.frontFaces[1].fill).toEqual([0, 1, 0, 1]);
    });

    it('applies shadeStrength parameter', () => {
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([0.4, 0.4, 0.6, 0.4, 0.5, 0.6]),
        fill: [1, 1, 1, 1],
      };

      const params: ExtrudeLiteParams = {
        extrudeHeight: 0.05,
        lightDir: [1, 0] as const,
        shadeStrength: 0.5, // half strength
        sideAlpha: 1.0,
      };

      const plan = buildExtrudeLite([input], params);

      // Side color should be scaled by shadeStrength
      const sideColor = plan.sideBands[0].fill;
      expect(sideColor[0]).toBeLessThan(0.5); // should be dimmed
      expect(sideColor[1]).toBeLessThan(0.5);
      expect(sideColor[2]).toBeLessThan(0.5);
    });

    it('applies sideAlpha parameter', () => {
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([0.4, 0.4, 0.6, 0.4, 0.5, 0.6]),
        fill: [1, 1, 1, 0.8],
      };

      const params: ExtrudeLiteParams = {
        extrudeHeight: 0.05,
        lightDir: [1, 0] as const,
        shadeStrength: 1.0,
        sideAlpha: 0.6, // 60% alpha
      };

      const plan = buildExtrudeLite([input], params);

      // Side alpha should be original alpha * sideAlpha
      const sideColor = plan.sideBands[0].fill;
      expect(sideColor[3]).toBeCloseTo(0.8 * 0.6, 5);
    });

    it('normalizes light direction', () => {
      const input: ExtrudeLiteInput = {
        pointsXY: new Float32Array([0.5, 0.5, 0.6, 0.6, 0.4, 0.6]),
        fill: [1, 1, 1, 1],
      };

      // Non-normalized light direction
      const params: ExtrudeLiteParams = {
        extrudeHeight: 0.1,
        lightDir: [3, 4] as const, // magnitude = 5
        shadeStrength: 1.0,
        sideAlpha: 1.0,
      };

      const plan = buildExtrudeLite([input], params);

      // Back face offset should be normalized [0.6, 0.8] * 0.1 = [0.06, 0.08]
      const backX = plan.backFaces[0].pointsXY[0];
      const backY = plan.backFaces[0].pointsXY[1];

      expect(backX).toBeCloseTo(0.5 + 0.06, 5);
      expect(backY).toBeCloseTo(0.5 + 0.08, 5);
    });
  });
});
