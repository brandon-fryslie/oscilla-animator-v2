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
