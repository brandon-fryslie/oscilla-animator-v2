/**
 * Pass 5: Cycle Validation (SCC)
 *
 * Validates the dependency graph for cycles using Tarjan's strongly connected
 * component (SCC) algorithm. Legal cycles must have at least one state boundary
 * block (breaksCombinatorialCycle === true).
 *
 * This pass ensures feedback loops are well-formed under the memory semantics.
 *
 * References:
 * - HANDOFF.md Topic 6: Pass 5 - Cycle Validation
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 5
 * - https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
 */
import type { DepGraphWithTimeModel } from "./pass4-depgraph";
import type { Block } from "../../types";
import type { AcyclicOrLegalGraph } from "../ir";
/**
 * Pass 5: Cycle Validation (SCC)
 *
 * Detects strongly connected components and validates that non-trivial
 * cycles have state boundaries.
 *
 * @param depGraph - The dependency graph from Pass 4
 * @param blocks - The blocks from the patch (for state boundary checking)
 * @returns A validated graph with SCC information
 */
export declare function pass5CycleValidation(depGraphWithTime: DepGraphWithTimeModel, blocks: readonly Block[]): AcyclicOrLegalGraph;
