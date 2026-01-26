/**
 * RenderIR Types - v2 Format
 *
 * See: design-docs/ for architecture and design notes
 *
 * This file defines the v2 shape of RenderIR used in production.
 * These types are the output of RenderAssembler and input to renderers.
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

// ============================================================================
// EXTRUDELITE SUPPORT (Experimental - delete when real mesh3d arrives)
// ============================================================================

import type { ExtrudeLiteParams } from './canvas/ExtrudeLite';

// ============================================================================
// END EXTRUDELITE IMPORTS
// ============================================================================

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

  // ============================================================================
  // EXTRUDELITE SUPPORT (Experimental - delete when real mesh3d arrives)
  // ============================================================================

  /** Depth style for 2.5D effects (default: 'flat') */
  readonly depthStyle?: 'flat' | 'extrudeLite';

  /** ExtrudeLite parameters (only when depthStyle === 'extrudeLite') */
  readonly extrudeLiteParams?: ExtrudeLiteParams;

  // ============================================================================
  // END EXTRUDELITE SUPPORT
  // ============================================================================
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
 * Primitive Geometry - Topology-based primitive shapes
 *
 * For non-path topologies (ellipse, rect, etc.) that use topology.render().
 * Parameters are passed directly to the topology's render function.
 *
 * INVARIANT: Parameters are in normalized world units
 * - Dimensions (rx, ry, width, height): [0,1] range relative to viewport
 * - Rotation: radians
 * - The topology.render() function applies viewport scaling
 */
export interface PrimitiveGeometry {
  /** Numeric topology ID from registry */
  readonly topologyId: number;

  /** Parameter values for the topology's render function */
  readonly params: Record<string, number>;
}

/**
 * Instance Transforms - World-space placement and scaling
 *
 * INVARIANT: Transforms are in WORLD SPACE
 * - position: normalized [0,1] coordinates (multiply by viewport dimensions)
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

  /** Positions in normalized [0,1] space (x,y interleaved)
   * WHEN PROJECTED: screen-space positions (stride-2, normalized [0,1]) */
  readonly position: Float32Array;

  /** Uniform size OR per-instance sizes (isotropic scale)
   * WHEN PROJECTED: per-instance Float32Array of screenRadius */
  readonly size: number | Float32Array;

  /** Optional per-instance rotations (radians) */
  readonly rotation?: Float32Array;

  /** Optional per-instance anisotropic scale (x,y interleaved) */
  readonly scale2?: Float32Array;

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
 * DrawPrimitiveInstancesOp - Draw operation for primitive topologies
 *
 * For non-path shapes (ellipse, rect) that use topology.render().
 * Parameters and instance transforms are pre-resolved by RenderAssembler.
 *
 * KEY PROPERTIES:
 * 1. Geometry contains topology ID + resolved params
 * 2. Renderer calls topology.render(ctx, params, renderSpace) per instance
 * 3. Instance transforms applied before calling render
 * 4. No control points - topology.render() handles the drawing
 */
export interface DrawPrimitiveInstancesOp {
  /** Operation kind for dispatch */
  readonly kind: 'drawPrimitiveInstances';

  /** Primitive shape definition */
  readonly geometry: PrimitiveGeometry;

  /** Instance transforms in world space */
  readonly instances: InstanceTransforms;

  /** Style for filling (primitives use fill-only for now) */
  readonly style: PathStyle;
}

/**
 * RenderFrameIR - Render frame structure (v2 format)
 *
 * Contains fully-resolved draw operations.
 * No IR references, no shape descriptors, no slot IDs.
 *
 * The RenderAssembler (part of ScheduleExecutor) produces this by:
 * 1. Executing schedule → fill scalar banks, define field expr IDs
 * 2. Materializing required fields via Materializer
 * 3. Resolving shape2d → (topologyId, pointsBuffer, flags)
 * 4. Emitting this structure with concrete buffers only
 */
export interface RenderFrameIR {
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
export type DrawOp = DrawPathInstancesOp | DrawPrimitiveInstancesOp;
// Future: | DrawImageInstancesOp | DrawTextOp | ...
