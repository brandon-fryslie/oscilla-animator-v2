/**
 * Pass 6: Block Lowering to IR
 */
import type { AcyclicOrLegalGraph, BlockIndex } from "../ir/patches";
import type { Block, Edge } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { CompileError } from "../types";
import type { ValueRefPacked } from "../ir/lowerTypes";
/**
 * UnlinkedIRFragments - Output of Pass 6
 *
 * Contains IR fragments for each block, but not yet linked together via
 * wires. Block outputs are represented as ValueRefs but inputs
 * are not yet resolved.
 */
export interface UnlinkedIRFragments {
    /** IRBuilder instance containing all emitted nodes */
    builder: IRBuilder;
    /** Map from block index to map of port ID to ValueRef */
    blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>;
    /** Compilation errors encountered during lowering */
    errors: CompileError[];
}
/**
 * Pass 6: Block Lowering
 *
 * Translates blocks into IR nodes using registered lowering functions.
 *
 * All blocks MUST have IR lowering registered via registerBlockType().
 * All blocks MUST use outputsById pattern (outputs array deprecated).
 * No fallback to non-IR outputs.
 *
 * Multi-Input Blocks Integration:
 * - Uses resolveInputsWithMultiInput for all input resolution
 * - Supports combine nodes for multi-writer inputs
 *
 * Input: Validated dependency graph + blocks array + edges
 * Output: UnlinkedIRFragments with IR nodes
 */
export declare function pass6BlockLowering(validated: AcyclicOrLegalGraph, blocks: readonly Block[], edges?: readonly Edge[]): UnlinkedIRFragments;
