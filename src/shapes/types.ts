/**
 * Unified Shape Model - Core Types
 *
 * Shape = TopologyDef (compile-time) + ParamSlots (runtime)
 *
 * Design:
 * - All shapes use same mechanism: ellipse, rect, paths
 * - TopologyDef defines what to draw (static, immutable)
 * - ParamSlots reference runtime values (dynamic, per-frame)
 * - Renderer dispatches on topology.render() - no hardcoded switches
 */

/**
 * TopologyId - String identifier for a topology
 */
export type TopologyId = string;

/**
 * ParamDef - Parameter definition for a topology
 *
 * Defines name, type, and default value for a topology parameter.
 */
export interface ParamDef {
  readonly name: string;
  readonly type: 'float' | 'vec2';
  readonly default: number;
}

/**
 * TopologyDef - Topology definition (compile-time constant)
 *
 * Defines:
 * - What kind of shape (id)
 * - What parameters it needs (params)
 * - How to render it (render function)
 *
 * Topologies are immutable and registered at module load time.
 */
export interface TopologyDef {
  readonly id: TopologyId;
  readonly params: readonly ParamDef[];
  readonly render: (ctx: CanvasRenderingContext2D, params: Record<string, number>) => void;
}

/**
 * ShapeRef - Reference to a shape with runtime parameter slots
 *
 * Contains:
 * - topologyId: Which topology to use (compile-time constant)
 * - paramSlots: Where to find parameter values at runtime
 *
 * This is what flows through the signal/field system.
 */
export interface ShapeRef {
  readonly topologyId: TopologyId;
  readonly paramSlots: readonly number[]; // SlotRef indices
}

/**
 * SlotRef - Reference to a runtime value slot
 *
 * This is an index into the runtime value arrays.
 */
export type SlotRef = number;

// =============================================================================
// Path System
// =============================================================================

/**
 * PathVerb - Path command type
 *
 * Defines the type of path operation. Each verb consumes a specific number
 * of control points from the control point field.
 */
export enum PathVerb {
  /** Move to a point (1 control point) */
  MOVE = 0,
  /** Line to a point (1 control point) */
  LINE = 1,
  /** Cubic bezier curve (3 control points: control1, control2, end) */
  CUBIC = 2,
  /** Quadratic bezier curve (2 control points: control, end) */
  QUAD = 3,
  /** Close path (0 control points) */
  CLOSE = 4,
}

/**
 * PathTopologyDef - Path topology definition
 *
 * Extends TopologyDef with path-specific data:
 * - verbs: Sequence of path commands (MOVE, LINE, CUBIC, etc.)
 * - pointsPerVerb: Number of control points consumed by each verb
 * - totalControlPoints: Total number of control points needed
 * - closed: Whether the path is closed (affects fill/stroke rendering)
 *
 * Control points are provided at runtime via a Field<vec2> over DOMAIN_CONTROL.
 * The topology defines WHAT to draw (the structure), while the control point
 * field defines WHERE to draw it (the positions).
 *
 * Example for a triangle:
 *   verbs: [MOVE, LINE, LINE, CLOSE]
 *   pointsPerVerb: [1, 1, 1, 0]
 *   totalControlPoints: 3
 *   closed: true
 */
export interface PathTopologyDef extends TopologyDef {
  /** Sequence of path commands */
  readonly verbs: readonly PathVerb[];
  /** Number of control points consumed by each verb */
  readonly pointsPerVerb: readonly number[];
  /** Total number of control points needed */
  readonly totalControlPoints: number;
  /** Whether the path is closed */
  readonly closed: boolean;
}
