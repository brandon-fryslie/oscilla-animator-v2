// src/render/style/ExtrudeLite.ts
//
// Backend-agnostic geometry builder skeleton.
// This produces a draw plan that Canvas2D/SVG backends can paint without doing geometry work.
//
// v1 scope: polygon rings only (closed, non-self-intersecting assumed).
// You can expand to paths/strokes later by changing ExtrudeLiteInput.

export type RGBA01 = readonly [number, number, number, number];

export interface ExtrudeLiteParams {
    // Visual height in normalized screen units (e.g. 0.01 = 1% of canvas min dimension).
    extrudeHeight: number;

    // Direction in screen space (normalized). Example: [0.7, -0.7] for “light from top-right”.
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

export function buildExtrudeLite(
    instances: readonly ExtrudeLiteInput[],
    params: ExtrudeLiteParams
): ExtrudeLiteDrawPlan {
    // TODO: precompute offset = lightDirNormalized * extrudeHeight
    // TODO: for each polygon:
    //   - front face = original
    //   - back face = points + offset
    //   - side bands: for each edge (pi->pj), build quad [pi, pj, pj+off, pi+off]
    //   - shading: side color based on edge normal dot lightDir (or simple constant for v1)
    //
    // Keep allocations bounded:
    // - Reuse typed arrays where possible (or pool them at caller).
    // - Prefer Float32Array for geometry to match renderer inputs.

    const backFaces: any[] = [];
    const sideBands: any[] = [];
    const frontFaces: any[] = [];

    // Stub: no-op “flat” plan to wire plumbing first
    for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        frontFaces.push({ pointsXY: inst.pointsXY, fill: inst.fill });
    }

    return { backFaces, sideBands, frontFaces };
}