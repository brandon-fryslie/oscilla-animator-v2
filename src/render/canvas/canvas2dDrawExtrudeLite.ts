// src/render/canvas2d/drawExtrudeLite.ts
//
// Canvas2D implementation skeleton for "ExtrudeLite" render style.
// This is intentionally a thin adapter: geometry lives in src/render/style/ExtrudeLite.ts.
// The caller provides already-projected screen-space points in normalized [0..1] units.
//
// Contracts:
// - Input shapes are in *screen space* (post-projection): x,y in [0..1].
// - Depth style is purely visual: it does not change picking/physics/debug fields.
// - Deterministic: no randomness, no time dependence.

import type { CanvasRenderingContext2D } from 'canvas'; // works in TS typecheck; runtime uses DOM canvas
import {
    buildExtrudeLite,
    type ExtrudeLiteParams,
    type ExtrudeLiteInput,
    type ExtrudeLiteDrawPlan,
    type RGBA01,
} from './ExtrudeLite';

// ----------------------------
// Public entrypoint
// ----------------------------

export interface DrawExtrudeLiteArgs {
    ctx: CanvasRenderingContext2D;

    // Canvas size in pixels
    widthPx: number;
    heightPx: number;

    // Per-instance (already depth-sorted / compacted) geometry in normalized screen coords
    // Each instance is a closed ring polygon for v1. (You can generalize to paths later.)
    instances: readonly ExtrudeLiteInput[];

    // Style parameters (usually attached to the op by RenderAssembler)
    params: ExtrudeLiteParams;
}

export function drawExtrudeLite({
                                    ctx,
                                    widthPx,
                                    heightPx,
                                    instances,
                                    params,
                                }: DrawExtrudeLiteArgs): void {
    // Build a draw plan (backend-agnostic geometry + per-layer colors)
    const plan = buildExtrudeLite(instances, params);

    // Paint order: back faces -> side bands -> front faces
    // (This approximates extrusion without actual 3D meshes.)
    drawPlan(ctx, widthPx, heightPx, plan);
}

// ----------------------------
// Plan painting
// ----------------------------

function drawPlan(
    ctx: CanvasRenderingContext2D,
    widthPx: number,
    heightPx: number,
    plan: ExtrudeLiteDrawPlan
): void {
    // NOTE: Keep this function allocation-light; avoid per-vertex object creation.
    // Geometry arrays should be Float32Array or number[] from the plan.

    // 1) Back faces
    for (let i = 0; i < plan.backFaces.length; i++) {
        const face = plan.backFaces[i];
        // face.pointsXY: Float32Array [x0,y0,x1,y1,...] in normalized coords
        // face.fill: RGBA01
        fillPolygon(ctx, widthPx, heightPx, face.pointsXY, face.fill);
    }

    // 2) Side bands (quads / strips)
    for (let i = 0; i < plan.sideBands.length; i++) {
        const band = plan.sideBands[i];
        // band.quadsXY: Float32Array of concatenated quads; each quad = 8 floats (4 points)
        // band.fill: RGBA01 (can vary per quad later; v1: per-band constant)
        fillQuadStrip(ctx, widthPx, heightPx, band.quadsXY, band.fill);
    }

    // 3) Front faces
    for (let i = 0; i < plan.frontFaces.length; i++) {
        const face = plan.frontFaces[i];
        fillPolygon(ctx, widthPx, heightPx, face.pointsXY, face.fill);
    }

    // Optional: stroke the front face edge for a beveled hint (cheap)
    // for (let i = 0; i < plan.frontFaces.length; i++) {
    //   const face = plan.frontFaces[i];
    //   strokePolygon(ctx, widthPx, heightPx, face.pointsXY, face.edgeStroke);
    // }
}

// ----------------------------
// Canvas primitives
// ----------------------------

function fillPolygon(
    ctx: CanvasRenderingContext2D,
    widthPx: number,
    heightPx: number,
    pointsXY: Float32Array,
    fill: RGBA01
): void {
    const n = pointsXY.length;
    if (n < 6) return; // < 3 points

    ctx.beginPath();

    // Move to first point
    ctx.moveTo(pointsXY[0] * widthPx, pointsXY[1] * heightPx);

    // Line through remaining points
    for (let i = 2; i < n; i += 2) {
        ctx.lineTo(pointsXY[i] * widthPx, pointsXY[i + 1] * heightPx);
    }

    ctx.closePath();
    ctx.fillStyle = rgba01ToCss(fill);
    ctx.fill();
}

function fillQuadStrip(
    ctx: CanvasRenderingContext2D,
    widthPx: number,
    heightPx: number,
    quadsXY: Float32Array,
    fill: RGBA01
): void {
    // Each quad is 4 points = 8 floats: (x0,y0,x1,y1,x2,y2,x3,y3)
    const n = quadsXY.length;
    if (n < 8) return;

    ctx.fillStyle = rgba01ToCss(fill);

    // Draw each quad as a closed path.
    // If perf becomes an issue, you can batch quads with same fill into one path.
    for (let i = 0; i < n; i += 8) {
        ctx.beginPath();
        ctx.moveTo(quadsXY[i + 0] * widthPx, quadsXY[i + 1] * heightPx);
        ctx.lineTo(quadsXY[i + 2] * widthPx, quadsXY[i + 3] * heightPx);
        ctx.lineTo(quadsXY[i + 4] * widthPx, quadsXY[i + 5] * heightPx);
        ctx.lineTo(quadsXY[i + 6] * widthPx, quadsXY[i + 7] * heightPx);
        ctx.closePath();
        ctx.fill();
    }
}

function strokePolygon(
    ctx: CanvasRenderingContext2D,
    widthPx: number,
    heightPx: number,
    pointsXY: Float32Array,
    stroke: { color: RGBA01; widthPx: number }
): void {
    const n = pointsXY.length;
    if (n < 6) return;

    ctx.beginPath();
    ctx.moveTo(pointsXY[0] * widthPx, pointsXY[1] * heightPx);
    for (let i = 2; i < n; i += 2) {
        ctx.lineTo(pointsXY[i] * widthPx, pointsXY[i + 1] * heightPx);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba01ToCss(stroke.color);
    ctx.lineWidth = stroke.widthPx;
    ctx.stroke();
}

function rgba01ToCss(c: RGBA01): string {
    // Clamp defensively (renderers should not trust upstream).
    const r = clamp01(c[0]);
    const g = clamp01(c[1]);
    const b = clamp01(c[2]);
    const a = clamp01(c[3]);
    // Use rgba() in 0..255 + alpha
    return `rgba(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0}, ${a})`;
}

function clamp01(x: number): number {
    return x <= 0 ? 0 : x >= 1 ? 1 : x;
}