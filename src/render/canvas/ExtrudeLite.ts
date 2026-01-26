// ============================================================================
// EXTRUDELITE: 2.5D Relief Rendering (Experimental)
// This is a renderer-only visual effect. Delete when real mesh3d arrives.
// ============================================================================
//
// src/render/canvas/ExtrudeLite.ts
//
// Backend-agnostic geometry builder for 2.5D relief effects.
// This produces a draw plan that Canvas2D/SVG backends can paint without doing geometry work.
//
// v1 scope: polygon rings only (closed, non-self-intersecting assumed).
// You can expand to paths/strokes later by changing ExtrudeLiteInput.

export type RGBA01 = readonly [number, number, number, number];

export interface ExtrudeLiteParams {
    // Visual height in normalized screen units (e.g. 0.01 = 1% of canvas min dimension).
    extrudeHeight: number;

    // Direction in screen space (normalized). Example: [0.7, -0.7] for "light from top-right".
    // Used to offset back face and derive side shading.
    lightDir: readonly [number, number];

    // 0..1: how strong side shading is.
    shadeStrength: number;

    // Side alpha multiplier (0..1).
    sideAlpha: number;

    // Front/back colors are derived from baseFill via shading rules.
}

export interface ExtrudeLiteInput {
    // Closed polygon ring: [x0,y0,x1,y1,...] normalized screen coords.
    // Must be at least 3 points.
    pointsXY: Float32Array;

    // Base fill in 0..1 RGBA.
    fill: RGBA01;
}

export interface ExtrudeLiteDrawPlan {
    backFaces: readonly {
        pointsXY: Float32Array;
        fill: RGBA01;
    }[];

    sideBands: readonly {
        quadsXY: Float32Array; // concatenated quads, each quad = 8 floats (4 points)
        fill: RGBA01;
    }[];

    frontFaces: readonly {
        pointsXY: Float32Array;
        fill: RGBA01;
        // edgeStroke?: { color: RGBA01; widthPx: number }; // optional later
    }[];
}

/**
 * Build an ExtrudeLite draw plan from polygon instances.
 *
 * Algorithm:
 * 1. Compute offset vector: d = normalize(lightDir) * extrudeHeight
 * 2. For each instance:
 *    a. Generate back face: translate points by offset, darken color
 *    b. Generate side bands: connect edges between front and back faces
 *    c. Pass through front face: original points and color
 * 3. Side shading: vary color based on edge orientation vs light direction
 */
export function buildExtrudeLite(
    instances: readonly ExtrudeLiteInput[],
    params: ExtrudeLiteParams
): ExtrudeLiteDrawPlan {
    const backFaces: Array<{ pointsXY: Float32Array; fill: RGBA01 }> = [];
    const sideBands: Array<{ quadsXY: Float32Array; fill: RGBA01 }> = [];
    const frontFaces: Array<{ pointsXY: Float32Array; fill: RGBA01 }> = [];

    // Normalize light direction and compute offset
    const lightDirNorm = normalize2(params.lightDir[0], params.lightDir[1]);
    const offsetX = lightDirNorm[0] * params.extrudeHeight;
    const offsetY = lightDirNorm[1] * params.extrudeHeight;

    for (let instIdx = 0; instIdx < instances.length; instIdx++) {
        const inst = instances[instIdx];
        const points = inst.pointsXY;
        const numPoints = points.length / 2;

        if (numPoints < 3) {
            // Degenerate polygon - skip
            continue;
        }

        // ----------------------------------------------------------------
        // Back face: translate points by offset, darken color
        // ----------------------------------------------------------------
        const backPoints = new Float32Array(points.length);
        for (let i = 0; i < points.length; i += 2) {
            backPoints[i] = points[i] + offsetX;
            backPoints[i + 1] = points[i + 1] + offsetY;
        }

        const backColor: RGBA01 = [
            inst.fill[0] * 0.6,
            inst.fill[1] * 0.6,
            inst.fill[2] * 0.6,
            inst.fill[3],
        ];

        backFaces.push({ pointsXY: backPoints, fill: backColor });

        // ----------------------------------------------------------------
        // Side bands: generate quads for each edge
        // ----------------------------------------------------------------
        const numEdges = numPoints; // Closed polygon: last point connects to first
        const quads = new Float32Array(numEdges * 8); // 4 points per quad, 2 coords per point

        for (let i = 0; i < numEdges; i++) {
            const i0 = i;
            const i1 = (i + 1) % numPoints;

            // Front edge vertices
            const fx0 = points[i0 * 2];
            const fy0 = points[i0 * 2 + 1];
            const fx1 = points[i1 * 2];
            const fy1 = points[i1 * 2 + 1];

            // Back edge vertices
            const bx0 = backPoints[i0 * 2];
            const by0 = backPoints[i0 * 2 + 1];
            const bx1 = backPoints[i1 * 2];
            const by1 = backPoints[i1 * 2 + 1];

            // Quad: [front0, front1, back1, back0]
            const qOffset = i * 8;
            quads[qOffset + 0] = fx0;
            quads[qOffset + 1] = fy0;
            quads[qOffset + 2] = fx1;
            quads[qOffset + 3] = fy1;
            quads[qOffset + 4] = bx1;
            quads[qOffset + 5] = by1;
            quads[qOffset + 6] = bx0;
            quads[qOffset + 7] = by0;
        }

        // Compute side color with shading based on edge orientation
        // For simplicity in v1, use average shading across all edges
        // (A more sophisticated version would vary per-edge)
        let avgShading = 0;
        for (let i = 0; i < numEdges; i++) {
            const i0 = i;
            const i1 = (i + 1) % numPoints;

            // Edge vector
            const ex = points[i1 * 2] - points[i0 * 2];
            const ey = points[i1 * 2 + 1] - points[i0 * 2 + 1];

            // Edge normal (perpendicular)
            const edgeNorm = normalize2(ex, ey);
            const nx = -edgeNorm[1]; // perpendicular (90° CCW rotation)
            const ny = edgeNorm[0];

            // Shading factor: how much edge faces light
            // k = 0.5 + 0.5 * dot(n, lightDir) maps [-1,1] → [0,1]
            const dotProduct = nx * lightDirNorm[0] + ny * lightDirNorm[1];
            const k = clamp01(0.5 + 0.5 * dotProduct);

            avgShading += k;
        }
        avgShading /= numEdges;

        // Mix between dark (0.6 * base) and bright (1.0 * base) based on shading
        const shadeMix = mix(0.6, 1.0, avgShading);
        const sideColor: RGBA01 = [
            inst.fill[0] * shadeMix * params.shadeStrength,
            inst.fill[1] * shadeMix * params.shadeStrength,
            inst.fill[2] * shadeMix * params.shadeStrength,
            inst.fill[3] * params.sideAlpha,
        ];

        sideBands.push({ quadsXY: quads, fill: sideColor });

        // ----------------------------------------------------------------
        // Front face: pass through original
        // ----------------------------------------------------------------
        frontFaces.push({ pointsXY: points, fill: inst.fill });
    }

    return { backFaces, sideBands, frontFaces };
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Normalize a 2D vector to unit length.
 * Returns [0, 0] for zero-length vectors.
 */
function normalize2(x: number, y: number): readonly [number, number] {
    const len = Math.sqrt(x * x + y * y);
    if (len < 1e-10) {
        return [0, 0];
    }
    return [x / len, y / len];
}

/**
 * Clamp value to [0, 1] range.
 */
function clamp01(x: number): number {
    return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

/**
 * Linear interpolation between a and b.
 */
function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
