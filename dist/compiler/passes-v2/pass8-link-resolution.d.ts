/**
 * Pass 8: Link Resolution
 *
 * Resolves all ValueRefs to concrete node IDs and creates BlockInputRootIR
 * and BlockOutputRootIR tables.
 *
 * This pass finalizes the IR by ensuring every port has a concrete value
 * and there are no dangling references.
 *
 * Sprint: Bus-Block Unification - Aggressive Cleanup (2026-01-02)
 * - Removed Pass 7 (bus lowering) - buses are just blocks
 * - Removed bus-specific validation
 * - Removed migration utilities
 *
 * Workstream 04: Render Sink Emission Policy (2026-01-03)
 * - Split applyRenderLowering into applyCameraLowering (cameras only)
 * - Render blocks are lowered in pass6, not pass8
 * - Prevents duplicate render sink registration
 *
 * Phase 0.5 Sprint 4: Deprecated Type Cleanup (2026-01-03)
 * - Removed unused _wires parameter (CompilerConnection deprecated)
 * - All connections now use Edge type exclusively
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 8
 * - .agent_planning/bus-block-unification/DOD-2026-01-02-121323.md
 */
import type { Block, Edge } from "../../types";
import type { BlockIndex } from "../ir/patches";
import type { IRBuilder } from "../ir/IRBuilder";
import type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
import type { CompileError } from "../types";
/**
 * BlockInputRootIR - Maps each block input to its value source
 */
export interface BlockInputRootIR {
    /** Flat array of ValueRefs, indexed by (blockIdx * maxInputs + portIdx) */
    readonly refs: ValueRefPacked[];
    /** Helper to get ValueRef for a specific input */
    indexOf(blockIndex: BlockIndex, portIdx: number): number;
}
/**
 * BlockOutputRootIR - Maps each block output to its value
 */
export interface BlockOutputRootIR {
    /** Flat array of ValueRefs, indexed by (blockIdx * maxOutputs + portIdx) */
    readonly refs: ValueRefPacked[];
    /** Helper to get ValueRef for a specific output */
    indexOf(blockIndex: BlockIndex, portIdx: number): number;
}
/**
 * LinkedGraphIR - Output of Pass 8
 *
 * Complete IR with all ports resolved to concrete values.
 */
export interface LinkedGraphIR {
    /** IRBuilder instance containing all emitted nodes */
    builder: IRBuilder;
    /** Block output port mappings */
    blockOutputRoots: BlockOutputRootIR;
    /** Block input port mappings */
    blockInputRoots: BlockInputRootIR;
    /** Compilation errors */
    errors: CompileError[];
}
/**
 * Pass 8: Link Resolution
 *
 * Resolves all ports to concrete ValueRefs.
 *
 * Input: UnlinkedIRFragments (from Pass 6) + blocks + edges
 * Output: LinkedGraphIR with complete port mappings
 *
 * For each block:
 * - Output ports: already in blockOutputs from Pass 6
 * - Input ports: resolve via edges
 *
 * Note: Default sources are handled by Pass 0 (materializeDefaultSources),
 * which creates hidden provider blocks and edges for all unconnected inputs
 * with defaultSource metadata. By the time Pass 8 runs, those inputs have
 * edges and don't need special handling.
 */
export declare function pass8LinkResolution(fragments: UnlinkedIRFragments, blocks: readonly Block[], edges: readonly Edge[]): LinkedGraphIR;
