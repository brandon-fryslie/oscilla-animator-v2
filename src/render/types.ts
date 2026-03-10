/**
 * Render Contract Types
 *
 * See: design-docs/ for architecture and design notes
 *
 * [LAW:one-source-of-truth] This module defines one canonical runtime->renderer
 * contract (`DrawPrepRenderContract`) and one explicitly legacy debug payload
 * (`LegacyRenderFrame`). They must not be conflated.
 *
 * Canonical path:
 * - Runtime publishes draw-prep sink descriptors.
 * - Renderer applies model + VP transforms (matrix-space ownership).
 *
 * Legacy debug path:
 * - `LegacyRenderFrame` carries fully materialized draw payloads for debugger
 *   and compatibility-only tooling.
 */

/**
 * Canonical draw-prep render boundary.
 *
 * [LAW:dataflow-not-control-flow] Runtime always publishes one sink-table
 * payload shape; variability is encoded in table contents/count, not schema.
 */
export interface DrawPrepRenderContract {
  readonly drawPrepSinkTableV1?: Uint32Array;
  readonly drawPrepSinkTableWordCount: number;
}

/**
 * Path Style - Explicit styling for path rendering
 *
 * Separates style from geometry. Supports fill, stroke, or both.
 * Stroke properties are optional; absence means no stroke.
 *
 * VIEWPORT SCALING:
 * - Stroke width is in world units (zero-centered world-space)
 * - Final pixel width: strokeWidthPx = strokeWidth × D, where D = min(width, height)
 * - Dash pattern lengths also scale: dashPx[i] = dashPattern[i] × D
 * - This ensures strokes scale uniformly with viewport size
 */
export interface PathStyle {
  /** Fill color (optional - if absent, no fill rendered) */
  readonly fillColor?: Uint8ClampedArray; // RGBA per instance or uniform

  /** Stroke color (optional - if absent, no stroke rendered) */
  readonly strokeColor?: Uint8ClampedArray;

  /** Stroke width in world units (optional, defaults to 0.01 if strokeColor present) */
  readonly strokeWidth?: number | Float32Array;

  /** Line join style for stroke corners */
  readonly lineJoin?: 'miter' | 'bevel' | 'round';

  /** Line cap style for stroke endpoints */
  readonly lineCap?: 'butt' | 'round' | 'square';

  /** Dash pattern in world units (alternating dash/gap lengths) */
  readonly dashPattern?: number[];

  /** Dash offset in world units (for animating dashed strokes) */
  readonly dashOffset?: number;

  /** Fill rule: 'nonzero' | 'evenodd' */
  readonly fillRule?: 'nonzero' | 'evenodd';

  /** Global alpha (optional) */
  readonly globalAlpha?: number | Float32Array;
}

/**
 * Path Geometry - Local-space control points + topology
 *
 * INVARIANT: Control points are in LOCAL SPACE
 * - Centered at (0, 0)
 * - Typical range: |p| ≈ O(1) (e.g., radius 1.0 for regular polygon)
 * - Independent of instance position, size, or viewport dimensions
 *
 * The renderer applies instance transforms to map local → world → viewport.
 */
export interface PathGeometry {
  /** Numeric topology ID (NOT string) - array index into topology registry */
  readonly topologyId: number;

  /** Path verbs (MOVE=0, LINE=1, CUBIC=2, QUAD=3, CLOSE=4) */
  readonly verbs: Uint8Array;

  /** Control points in LOCAL SPACE (x,y interleaved) */
  readonly points: Float32Array;

  /** Number of vec2 points (points.length / 2) */
  readonly pointsCount: number;

  /** Path flags (closed, etc.) */
  readonly flags?: number;
}

/**
 * Instance Transforms - World-space placement and scaling
 *
 * INVARIANT: Transforms are in WORLD SPACE
 * - position: zero-centered world coordinates (origin at clip center)
 *   - WHEN PROJECTED: screen-space vec2 positions (stride-2, normalized [0,1])
 * - size: isotropic scalar scale in world units
 *   - WHEN PROJECTED: per-instance Float32Array of screenRadius
 * - rotation: radians (optional)
 * - scale2: anisotropic vec2 scale (optional, combines with size as S_effective)
 * - depth: per-instance depth values (optional, for test verification of depth-sorting)
 *
 * Effective scale: S_effective = size * (scale2 ?? vec2(1, 1))
 */
export interface InstanceTransforms {
  /** Number of instances */
  readonly count: number;

  /** Positions in zero-centered world space (x,y interleaved)
   * WHEN PROJECTED: screen-space positions (stride-2, normalized [0,1]) */
  readonly position: Float32Array;

  /** Uniform size OR per-instance sizes (isotropic scale)
   * WHEN PROJECTED: per-instance Float32Array of screenRadius */
  readonly size: number | Float32Array;

  // [LAW:dataflow-not-control-flow] rotation and scale2 are always present.
  // Identity values (rotation=0, scale2=[1,1]) are filled by RenderAssembler
  // so renderers execute unconditional transforms — variability lives in the values.

  /** Per-instance rotations in radians (identity: 0.0) */
  readonly rotation: Float32Array;

  /** Per-instance anisotropic scale, x,y interleaved (identity: [1.0, 1.0]) */
  readonly scale2: Float32Array;

  /** Optional per-instance depth (for test verification of depth-sorting)
   * Present when camera projection was applied */
  readonly depth?: Float32Array;
}

/**
 * DrawPathInstancesOp - Instance-based path rendering operation
 *
 * This is the primary draw operation for path-based shapes.
 * All shape resolution is done before the renderer receives this.
 *
 * KEY PROPERTIES:
 * 1. All shape resolution done BEFORE renderer receives this
 * 2. No ShapeDescriptor, no param mapping, no slot references
 * 3. Geometry is local-space, instances are world-space
 * 4. Style is explicit and separate from geometry
 * 5. Renderer is a pure sink: loop instances, apply transforms, draw
 */
export interface DrawPathInstancesOp {
  /** Operation kind for dispatch */
  readonly kind: 'drawPathInstances';

  /** Path geometry in local space */
  readonly geometry: PathGeometry;

  /** Instance transforms in world space */
  readonly instances: InstanceTransforms;

  /** Path styling */
  readonly style: PathStyle;
}

/**
 * LegacyRenderFrame - compatibility/debug render payload
 *
 * This is non-canonical. Canonical runtime rendering uses Draw Prep sink
 * tables and GPU-owned matrix transforms.
 *
 * The RenderAssembler (part of ScheduleExecutor) produces this by:
 * 1. Executing schedule → fill scalar banks, define field expr IDs
 * 2. Materializing required fields via Materializer
 * 3. Resolving shape handles → (topologyId, pointsBuffer, header metadata)
 * 4. Emitting this structure with concrete buffers only
 */
export interface LegacyRenderFrame {
  readonly version: 2;
  readonly ops: readonly DrawOp[];
}

/**
 * DrawOp - Union of all draw operation types
 *
 * Future work will add:
 * - DrawImageInstancesOp
 * - DrawTextOp
 * - DrawSpriteInstancesOp
 * - DrawGradientOp
 */
export type DrawOp = DrawPathInstancesOp;
// Future: | DrawImageInstancesOp | DrawTextOp | ...

/**
 * Canonical shared empty frame.
 *
 * [LAW:one-source-of-truth] One shared empty LegacyRenderFrame avoids duplicate
 * ad-hoc `{ version: 2, ops: [] }` construction across runtime/services.
 */
export const EMPTY_DRAW_OPS: readonly DrawOp[] = Object.freeze([] as DrawOp[]);

export const EMPTY_LEGACY_RENDER_FRAME: LegacyRenderFrame = Object.freeze({
  version: 2 as const,
  ops: EMPTY_DRAW_OPS,
});
