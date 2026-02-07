/**
 * WhyNotEvaluated — Analysis for missing values in the debugger
 *
 * When a block/port shows no value, this module provides an explanation of WHY.
 * It examines the compiler's dependency graph, schedule, and error outputs
 * to determine which pass excluded the block.
 *
 * This is a read-only analysis — it examines existing compiler outputs.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { CompilationSnapshot } from '../services/CompilationInspectorService';
import type { BlockId, PortId } from '../types';

// =============================================================================
// Result Types
// =============================================================================

/**
 * Reason why a block/port was not evaluated.
 */
export type WhyNotReason =
  | { readonly kind: 'not-in-schedule'; readonly detail: string }
  | { readonly kind: 'dependency-pruned'; readonly detail: string }
  | { readonly kind: 'event-not-fired'; readonly detail: string }
  | { readonly kind: 'no-connections'; readonly detail: string }
  | { readonly kind: 'compile-error'; readonly errors: readonly string[] }
  | { readonly kind: 'unknown'; readonly detail: string };

/**
 * Result of the "Why Not Evaluated" analysis.
 */
export interface WhyNotResult {
  readonly blockId: BlockId;
  readonly portId?: PortId;
  readonly reasons: readonly WhyNotReason[];
}

// =============================================================================
// Analysis Function
// =============================================================================

/**
 * Analyze why a block/port was not evaluated in the current frame.
 *
 * Checks the following conditions (in order):
 * 1. Compile errors referencing this block
 * 2. Block not present in the schedule (not scheduled)
 * 3. Block present in dep graph but pruned during SCC/scheduling
 * 4. Block has no outgoing connections (may have been pruned as unreachable)
 * 5. Event-sourced block where the event never fired
 *
 * @param blockId - The block to analyze (string ID from Patch)
 * @param portId - Optional port to narrow the analysis
 * @param program - Compiled program IR (may be null if compilation failed)
 * @param snapshot - Latest compilation snapshot (may be null if unavailable)
 * @returns WhyNotResult with reasons array (empty if block IS evaluated)
 */
export function analyzeWhyNotEvaluated(
  blockId: BlockId,
  portId: PortId | undefined,
  program: CompiledProgramIR | null,
  snapshot: CompilationSnapshot | null,
): WhyNotResult {
  const reasons: WhyNotReason[] = [];

  // If no program, check for compile errors
  if (!program) {
    const errors = findCompileErrorsForBlock(blockId, snapshot);
    if (errors.length > 0) {
      reasons.push({ kind: 'compile-error', errors });
    } else {
      reasons.push({
        kind: 'unknown',
        detail: 'No compiled program available — compilation may have failed.',
      });
    }
    return { blockId, portId, reasons };
  }

  // Resolve blockId string to numeric block index used in program.
  // debugIndex.blockMap stores (numeric block index → string ID) despite the
  // typed key being BlockId (branded string). We iterate values to reverse-lookup.
  const numericBlockIndex = resolveNumericBlockIndex(blockId, program);
  if (numericBlockIndex === undefined) {
    reasons.push({
      kind: 'unknown',
      detail: `Block "${blockId as string}" not found in compiled program's debug index.`,
    });
    return { blockId, portId, reasons };
  }

  // Check 1: Compile errors for this block
  const compileErrors = findCompileErrorsForBlock(blockId, snapshot);
  if (compileErrors.length > 0) {
    reasons.push({ kind: 'compile-error', errors: compileErrors });
  }

  // Check 2: Is the block in the schedule?
  const isScheduled = isBlockInSchedule(numericBlockIndex, program);
  if (!isScheduled) {
    reasons.push({
      kind: 'not-in-schedule',
      detail: `Block "${blockId as string}" has no execution steps in the schedule. It was excluded during compilation.`,
    });

    // Check 3: Was it in the dependency graph but pruned?
    const depGraphInfo = checkDepGraphPresence(numericBlockIndex, snapshot);
    if (depGraphInfo === 'present-in-depgraph') {
      reasons.push({
        kind: 'dependency-pruned',
        detail: `Block "${blockId as string}" was present in the dependency graph but was excluded during SCC analysis or schedule construction.`,
      });
    }

    // Check 4: No connections?
    const hasConnections = checkBlockHasConnections(numericBlockIndex, snapshot);
    if (hasConnections === false) {
      reasons.push({
        kind: 'no-connections',
        detail: `Block "${blockId as string}" has no incoming or outgoing edges. Disconnected blocks are not scheduled.`,
      });
    }
  }

  // Check 5: Event-related blocks — check if the block is event-driven
  if (isScheduled) {
    const eventInfo = checkEventNotFired(numericBlockIndex, program);
    if (eventInfo) {
      reasons.push({
        kind: 'event-not-fired',
        detail: eventInfo,
      });
    }
  }

  return { blockId, portId, reasons };
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Find compile errors that reference a specific block.
 */
function findCompileErrorsForBlock(
  blockId: BlockId,
  snapshot: CompilationSnapshot | null,
): string[] {
  if (!snapshot) return [];

  const blockIdStr = blockId as string;
  const errors: string[] = [];
  for (const pass of snapshot.passes) {
    for (const err of pass.errors) {
      if (err.blockId === blockIdStr) {
        errors.push(`[${pass.passName}] ${err.message}`);
      }
    }
  }

  // Also check if the snapshot status is failure — there may be global errors
  if (snapshot.status === 'failure') {
    for (const pass of snapshot.passes) {
      for (const err of pass.errors) {
        if (!err.blockId && err.message) {
          errors.push(`[${pass.passName}] ${err.message}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Resolve a string block ID to its numeric block index via debugIndex.blockMap.
 *
 * The blockMap is typed as ReadonlyMap<BlockId, string> but the implementation
 * stores numeric block indices as keys (from the compiler's block array).
 * We iterate to find the entry whose value matches the blockId string.
 */
function resolveNumericBlockIndex(
  blockId: BlockId,
  program: CompiledProgramIR,
): number | undefined {
  const blockIdStr = blockId as string;
  for (const [key, strId] of program.debugIndex.blockMap) {
    if (strId === blockIdStr) {
      // Key is stored as a number at runtime despite the BlockId type
      return key as unknown as number;
    }
  }
  return undefined;
}

/**
 * Check if a block has any representation in the debug index.
 *
 * A block that was lowered and scheduled will have port bindings,
 * stepToBlock entries, or slotToBlock entries in the debug index.
 */
function isBlockInSchedule(
  numericBlockIndex: number,
  program: CompiledProgramIR,
): boolean {
  // Check debugIndex.ports — if the block has port bindings, it was lowered
  for (const port of program.debugIndex.ports) {
    if ((port.block as unknown as number) === numericBlockIndex) {
      return true;
    }
  }

  // Also check stepToBlock mapping
  for (const [, blockRef] of program.debugIndex.stepToBlock) {
    if ((blockRef as unknown as number) === numericBlockIndex) {
      return true;
    }
  }

  // Check slotToBlock mapping
  for (const [, blockRef] of program.debugIndex.slotToBlock) {
    if ((blockRef as unknown as number) === numericBlockIndex) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a block was present in the dependency graph (pass 4 output).
 * If present there but not in schedule, it was pruned during SCC or scheduling.
 */
function checkDepGraphPresence(
  numericBlockIndex: number,
  snapshot: CompilationSnapshot | null,
): 'present-in-depgraph' | 'absent' | 'unknown' {
  if (!snapshot) return 'unknown';

  // Look for the dep graph pass output — backend uses 'backend:depgraph', monolithic uses 'depgraph'
  const depGraphPass = snapshot.passes.find(
    p => p.passName === 'backend:depgraph' || p.passName === 'depgraph'
  );
  if (!depGraphPass) return 'unknown';

  // The output is serialized. Check if any node has blockIndex matching our block.
  const output = depGraphPass.output as {
    graph?: { nodes?: Array<{ kind?: string; blockIndex?: number }> };
  };
  if (!output?.graph?.nodes) return 'unknown';

  const found = output.graph.nodes.some(
    n => n.kind === 'BlockEval' && n.blockIndex === numericBlockIndex
  );
  return found ? 'present-in-depgraph' : 'absent';
}

/**
 * Check if a block has any connections (edges) in the normalized patch.
 * Returns false if the block has no edges, true if it has edges, undefined if unknown.
 */
function checkBlockHasConnections(
  numericBlockIndex: number,
  snapshot: CompilationSnapshot | null,
): boolean | undefined {
  if (!snapshot) return undefined;

  // Look for normalization pass to get edges
  const normPass = snapshot.passes.find(
    p => p.passName === 'normalization'
  );
  if (!normPass) return undefined;

  const output = normPass.output as {
    edges?: Array<{ fromBlock?: number; toBlock?: number }>;
  };
  if (!output?.edges) return undefined;

  return output.edges.some(
    e => e.fromBlock === numericBlockIndex || e.toBlock === numericBlockIndex
  );
}

/**
 * Check if a block produces event outputs (discrete temporality).
 * Event values are only present when the event fires.
 */
function checkEventNotFired(
  numericBlockIndex: number,
  program: CompiledProgramIR,
): string | undefined {
  for (const port of program.debugIndex.ports) {
    if ((port.block as unknown as number) !== numericBlockIndex) continue;
    if (port.domain === 'event') {
      // Resolve the block's string name for the message
      let blockName: string = String(numericBlockIndex);
      for (const [key, strId] of program.debugIndex.blockMap) {
        if ((key as unknown as number) === numericBlockIndex) {
          blockName = strId;
          break;
        }
      }
      return `Block "${blockName}" produces event outputs. Event values are only present when the event fires (discrete temporality).`;
    }
  }

  return undefined;
}
