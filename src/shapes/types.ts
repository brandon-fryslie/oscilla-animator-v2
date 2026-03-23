/**
 * Unified Shape Model - Core Types
 *
 * Shape = TopologyDef (compile-time) + ParamSlots (runtime)
 *
 * Design:
 * - All shapes use the path mechanism (topology + control points)
 * - TopologyDef defines static path structure (verbs + arity)
 * - Control-point fields provide runtime geometry values
 * - Renderer dispatches on path verbs only
 */

// =============================================================================
// Shape Taxonomy — Compile/Runtime Execution Contract
// =============================================================================

/**
 * ShapeClass — Canonical shape taxonomy discriminant.
 *
 * // [LAW:one-type-per-behavior] Shape classes reflect real execution differences
 * // (topology source, dominant cost, command stream ABI). Each class maps to a
 * // concrete data contract across compile → runtime → draw-prep → render.
 *
 * Spec: docs/current/webgpu-specs/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md
 *
 * Values are u32-compatible for direct ShapeBankHeaderWord.Kind storage.
 */
export enum ShapeClass {
  /**
   * Type 1: Rigid Stamp
   * - Immutable local topology in ShapeBank (indexed path)
   * - Per-instance transforms in Arena
   * - Draw-prep buckets by compatible indexed topology
   */
  Type1Rigid = 1,

  /**
   * Type 2: Parametric (Template Instancing)
   * - Template topology in ShapeBank (t-values + optional indices)
   * - Per-instance control points in Arena (SoA param channels)
   * - GPU vertex shader evaluates curve analytically from template + CPs
   * - Supports both non-indexed (ribbon) and indexed (blob/fan) families
   *
   * // [LAW:one-type-per-behavior] Type 2 has a fundamentally different data
   * // contract from Type 1: template topology + analytical evaluation vs
   * // rigid mesh + transform.
   */
  Type2Parametric = 2,

  // Future classes will be added as RECOVER tickets progress:
  // Type3Ribbon = 3,
  // Type4ProceduralSDF = 4,

  /**
   * Type 5: Text/Glyph Hybrid
   * - CPU/worker text shaping (glyph positioning + atlas lookup)
   * - GPU instanced glyph-quad rendering with MSDF fragment evaluation
   * - Shared unit-quad topology; per-glyph UV rects in ShapeBank entries
   * - Draw-prep produces per-glyph non-indexed indirect draw commands
   *
   * // [LAW:one-type-per-behavior] Text has a fundamentally different ownership
   * // split from rigid/path geometry: CPU owns shaping, GPU owns rendering.
   *
   * Spec: docs/current/webgpu-specs/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md
   */
  Type5TextHybrid = 5,
}

/**
 * TopologyMode — How the topology is represented in ShapeBank.
 *
 * Stored in ShapeBankHeaderWord.TopologyMode. Values are u32-compatible.
 */
export enum TopologyMode {
  /** Non-path topology (abstract params only, no verbs) */
  NonPath = 0,
  /** Path-based topology with verb sequence and control points */
  Path = 1,
}

/**
 * TopologyType — Bifurcated dispatch discriminant for Type 2 Parametric shapes.
 *
 * Stored in ShapeBankHeaderWord.TopologyMode (word 1) for Type 2 shapes.
 * Determines whether the shape uses non-indexed (strip/ribbon) or indexed
 * (fan/blob) draw commands.
 *
 * // [LAW:one-type-per-behavior] Non-indexed and indexed parametric families
 * // have different GPU draw command ABIs (drawIndirect vs drawIndexedIndirect).
 */
export enum TopologyType {
  /** Non-indexed topology (e.g., CubicBezierRibbon2D — triangle strip from t-values) */
  NonIndexed = 0,
  /** Indexed topology (e.g., ClosedBlob2D — triangle fan with index buffer) */
  Indexed = 1,
}

// =============================================================================
// Topology IDs
// =============================================================================

/**
 * TopologyId - Numeric identifier for a topology (array index)
 *
 * Built-in topologies: 0-99
 * Dynamic topologies: 100+
 */
export type TopologyId = number;

/**
 * TopologyBankRecord - packed structural metadata row for GPU upload.
 *
 * Fields mirror the canonical `u32` topology bank contract:
 * - id: topology ID
 * - verbCount: path verb count (0 for non-path topologies)
 * - totalControlPoints: required control points (0 for non-path topologies)
 * - flags: bitfield (path/closed, etc.)
 */
export interface TopologyBankRecord {
  readonly id: number;
  readonly verbCount: number;
  readonly totalControlPoints: number;
  readonly flags: number;
}

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
 *
 * Topologies are immutable and registered at module load time.
 */
export interface TopologyDef {
  readonly id: TopologyId;
  readonly params: readonly ParamDef[];
}

/**
 * AbstractTopologyDef - A topology definition before ID assignment
 *
 * Used for topology definitions that will be registered with the registry,
 * which assigns numeric IDs. Built-in topologies and dynamic topologies
 * both start as AbstractTopologyDef before registration.
 */
export type AbstractTopologyDef = Omit<TopologyDef, 'id'>;

/**
 * ShapeRef - Reference to a shape with runtime parameter slots
 *
 * Contains:
 * - topologyId: Which topology to use (compile-time constant)
 * - paramSlots: Where to find parameter values at runtime
 *
 * This is what flows through the one/many value system.
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
 * Segment kind for PathTopologyDef dispatch
 *
 * Distinguishes the geometric type of each segment in a path.
 * Used for runtime dispatch in path derivative calculations (tangent, arc length).
 */
export type PathSegmentKind = 'line' | 'cubic' | 'quad';


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
  // Precomputed dispatch data (Sprint 1 WI-1)
  /** Segment kind per segment (MOVE/CLOSE excluded) */
  readonly segmentKind: readonly PathSegmentKind[];
  /** Cumulative control point index where each segment starts */
  readonly segmentPointBase: readonly number[];
  /** True if any QUAD verb present */
  readonly hasQuad: boolean;
  /** True if any CUBIC verb present */
  readonly hasCubic: boolean;
}

export type SerializableTopologyDef = TopologyDef & Partial<Pick<
  PathTopologyDef,
  'verbs' | 'pointsPerVerb' | 'totalControlPoints' | 'closed' | 'segmentKind' | 'segmentPointBase' | 'hasQuad' | 'hasCubic'
>>;



/**
 * PathTopologyDefInput - Input type for registerDynamicTopology
 *
 * When creating a PathTopologyDef to pass to registerDynamicTopology,
 * you don't need to provide the precomputed dispatch data (segmentKind, etc.)
 * because the registry computes it automatically from verbs[].
 *
 * This type represents the REQUIRED fields for path topology creation.
 */
export type PathTopologyDefInput = Omit<
  PathTopologyDef,
  'id' | 'segmentKind' | 'segmentPointBase' | 'hasQuad' | 'hasCubic'
>;
