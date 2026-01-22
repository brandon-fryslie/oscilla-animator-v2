/**
 * Future RenderIR Types - Phase 6 Prep
 *
 * ROADMAP: Phase 6 - RenderIR + renderer prep
 * See: .agent_planning/_future/8-before-render.md
 *      .agent_planning/_future/9-renderer.md
 *
 * This file defines the FUTURE shape of RenderIR that the kernel/materializer
 * layer is moving toward. These types are not yet used in production code,
 * but define the target architecture to ensure current work doesn't conflict.
 *
 * KEY PRINCIPLES:
 * 1. Local-space geometry: Control points centered at (0,0), |p|≈O(1)
 * 2. World-space instances: position in [0,1], size as isotropic scalar
 * 3. Explicit transforms: translate/rotate/scale at instance level
 * 4. No shape interpretation in renderer: all resolution happens in RenderAssembler
 *
 * COORDINATE SPACE MODEL:
 * - Geometry (control points): Local space, centered at origin
 *   - Example: Regular pentagon vertices at radius 1.0
 *   - Independent of viewport, instance position, or size
 * - Instance transforms: World space [0,1] → viewport pixels
 *   - position: normalized [0,1] coordinates
 *   - size: isotropic scale in world units (combined with optional scale2)
 *   - rotation: radians
 *   - scale2: optional anisotropic vec2 scale
 *
 * RENDERING MODEL:
 * For each instance:
 *   ctx.translate(position.x * width, position.y * height);
 *   ctx.rotate(rotation);
 *   ctx.scale(size * scale2.x, size * scale2.y);
 *   drawPath(localSpaceGeometry);
 *
 * This makes all shapes respond uniformly to position/size/rotation modulators.
 */

/**
 * Path Style - Explicit styling for path rendering
 *
 * Separates style from geometry. Supports fill, stroke, or both.
 * Stroke properties are optional; absence means no stroke.
 * 
 * VIEWPORT SCALING:
 * - Stroke width is in normalized world units (0-1 range relative to viewport)
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
 * - position: normalized [0,1] coordinates (multiply by viewport dimensions)
 * - size: isotropic scalar scale in world units
 * - rotation: radians (optional)
 * - scale2: anisotropic vec2 scale (optional, combines with size as S_effective)
 *
 * Effective scale: S_effective = size * (scale2 ?? vec2(1, 1))
 */
export interface InstanceTransforms {
  /** Number of instances */
  readonly count: number;

  /** Positions in normalized [0,1] space (x,y interleaved) */
  readonly position: Float32Array;

  /** Uniform size OR per-instance sizes (isotropic scale) */
  readonly size: number | Float32Array;

  /** Optional per-instance rotations (radians) */
  readonly rotation?: Float32Array;

  /** Optional per-instance anisotropic scale (x,y interleaved) */
  readonly scale2?: Float32Array;
}

/**
 * DrawPathInstancesOp - FUTURE unified draw operation
 *
 * This is the target shape for instance-based path rendering.
 * When fully implemented, this will replace the current RenderPassIR
 * structure for path rendering.
 *
 * KEY PROPERTIES:
 * 1. All shape resolution done BEFORE renderer receives this
 * 2. No ShapeDescriptor, no param mapping, no slot references
 * 3. Geometry is local-space, instances are world-space
 * 4. Style is explicit and separate from geometry
 * 5. Renderer is a pure sink: loop instances, apply transforms, draw
 *
 * CURRENT STATE: Definition only, not yet used
 * FUTURE STATE: Primary render operation emitted by RenderAssembler
 */
export interface DrawPathInstancesOp {
  /** Operation kind for future dispatch */
  readonly kind: 'drawPathInstances';

  /** Path geometry in local space */
  readonly geometry: PathGeometry;

  /** Instance transforms in world space */
  readonly instances: InstanceTransforms;

  /** Path styling */
  readonly style: PathStyle;
}

/**
 * RenderFrameIR_Future - Target frame structure
 *
 * Future RenderFrameIR will contain only fully-resolved draw operations.
 * No IR references, no shape descriptors, no slot IDs.
 *
 * The RenderAssembler (part of ScheduleExecutor) will:
 * 1. Execute schedule → fill scalar banks, define field expr IDs
 * 2. Materialize required fields via Materializer
 * 3. Resolve shape2d → (topologyId, pointsBuffer, flags)
 * 4. Emit this structure with concrete buffers only
 *
 * CURRENT STATE: Definition only, not yet used
 * FUTURE STATE: Output of RenderAssembler, input to renderer
 */
export interface RenderFrameIR_Future {
  readonly version: 2; // Increment version to distinguish from current RenderFrameIR
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
 * MIGRATION PATH:
 *
 * Current (v1):
 *   RenderPassIR with ShapeDescriptor | ArrayBufferView | number
 *   → Renderer decodes shapes, maps params, scales control points
 *
 * Phase 6 Prep (current):
 *   Define future types, document intent, no breaking changes
 *
 * Phase 6 Implementation (future):
 *   1. Add RenderAssembler step in ScheduleExecutor.executeFrame
 *   2. RenderAssembler produces DrawPathInstancesOp from current RenderPassIR
 *   3. Renderer accepts both v1 and v2, dispatches accordingly
 *   4. Migrate renderer internals to use local-space + instance transforms
 *   5. Remove shape decoding, param mapping, control point scaling from renderer
 *
 * Phase 6 Complete (future):
 *   Only RenderFrameIR_Future used, v1 support removed
 *   Renderer is pure sink: execute DrawOps with no interpretation
 */
