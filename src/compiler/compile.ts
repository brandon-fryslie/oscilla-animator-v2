/**
 * Main Compiler Entry Point
 *
 * Compiles a Patch into a CompiledProgramIR through a series of passes:
 * 1. Normalize - Dense indices, canonical ordering
 * 2. TypeCheck - Validate connections
 * 3. TimeResolve - Find TimeRoot, extract TimeModel
 * 4. DepGraph - Build dependency graph
 * 5. Validate - Check for cycles
 * 6. Lower - Lower blocks to IR
 * 7. Link - Resolve connections
 *
 * Extended with event emission for diagnostics integration.
 */

import type { Patch } from '../graph';
import { normalize, type NormalizedPatch } from '../graph/normalize';
import type { CompiledProgramIR } from './ir/program';
import { IRBuilder } from './ir';
import { getBlock, type ValueRef } from './blocks';
import { checkTypes } from './passes/TypeChecker';
import type { EventHub } from '../events/EventHub';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';

// =============================================================================
// Compile Errors
// =============================================================================

export interface CompileError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
  readonly portId?: string;
}

export interface CompileResult {
  readonly kind: 'ok';
  readonly program: CompiledProgramIR;
}

export interface CompileFailure {
  readonly kind: 'error';
  readonly errors: readonly CompileError[];
}

// =============================================================================
// Compile Options
// =============================================================================

/**
 * Options for compile function (optional).
 * If provided, enables event emission and diagnostics integration.
 */
export interface CompileOptions {
  readonly events: EventHub;
  readonly patchRevision: number;
  readonly patchId: string;
}

// =============================================================================
// Main Compile Function
// =============================================================================

/**
 * Compiles a Patch into executable IR.
 *
 * @param patch The patch to compile
 * @param options Optional event emission and diagnostics integration
 * @returns CompileResult or CompileFailure
 */
export function compile(
  patch: Patch,
  options?: CompileOptions
): CompileResult | CompileFailure {
  const compileId = `compile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startTime = performance.now();

  // Emit CompileBegin event
  if (options) {
    options.events.emit({
      type: 'CompileBegin',
      compileId,
      patchId: options.patchId,
      patchRevision: options.patchRevision,
      trigger: 'manual',
    });
  }

  const errors: CompileError[] = [];

  // Pass 1: Normalize
  const normResult = normalize(patch);
  if (normResult.kind === 'error') {
    const compileErrors = normResult.errors.map((e) => ({
      kind: e.kind,
      message: formatNormError(e),
    }));

    // Emit CompileEnd event (failure)
    if (options) {
      const durationMs = performance.now() - startTime;
      const diagnostics = convertCompileErrorsToDiagnostics(
        compileErrors,
        options.patchRevision,
        compileId
      );
      options.events.emit({
        type: 'CompileEnd',
        compileId,
        patchId: options.patchId,
        patchRevision: options.patchRevision,
        status: 'failure',
        durationMs,
        diagnostics,
      });
    }

    return {
      kind: 'error',
      errors: compileErrors,
    };
  }

  const normalized = normResult.patch;

  // Pass 2: Find TimeRoot
  const timeRootResult = findTimeRoot(normalized);
  if (timeRootResult.kind === 'error') {
    errors.push(...timeRootResult.errors);
  }

  // Pass 2.5: Type Check (strict enforcement)
  const typeErrors = checkTypes(normalized);
  if (typeErrors.length > 0) {
    errors.push(...typeErrors);
  }

  if (errors.length > 0) {
    // Emit CompileEnd event (failure)
    if (options) {
      const durationMs = performance.now() - startTime;
      const diagnostics = convertCompileErrorsToDiagnostics(
        errors,
        options.patchRevision,
        compileId
      );
      options.events.emit({
        type: 'CompileEnd',
        compileId,
        patchId: options.patchId,
        patchRevision: options.patchRevision,
        status: 'failure',
        durationMs,
        diagnostics,
      });
    }

    return { kind: 'error', errors };
  }

  // Pass 3: Build dependency order
  const depOrder = buildDependencyOrder(normalized);

  // Pass 4: Lower blocks in dependency order
  const builder = new IRBuilder();
  const blockOutputs = new Map<number, Record<string, ValueRef>>();

  for (const blockIdx of depOrder) {
    const block = normalized.blocks[blockIdx];
    const blockDef = getBlock(block.type);

    if (!blockDef) {
      errors.push({
        kind: 'UnknownBlockType',
        message: `Unknown block type: ${block.type}`,
        blockId: block.id,
      });
      continue;
    }

    // Resolve inputs
    const inputsById = resolveInputs(normalized, blockIdx, blockOutputs);

    // Lower the block
    try {
      const outputs = blockDef.lower({
        b: builder,
        config: block.params,
        inputsById,
      });

      blockOutputs.set(blockIdx, outputs);
    } catch (e) {
      errors.push({
        kind: 'LoweringError',
        message: e instanceof Error ? e.message : String(e),
        blockId: block.id,
      });
    }
  }

  if (errors.length > 0) {
    // Emit CompileEnd event (failure)
    if (options) {
      const durationMs = performance.now() - startTime;
      const diagnostics = convertCompileErrorsToDiagnostics(
        errors,
        options.patchRevision,
        compileId
      );
      options.events.emit({
        type: 'CompileEnd',
        compileId,
        patchId: options.patchId,
        patchRevision: options.patchRevision,
        status: 'failure',
        durationMs,
        diagnostics,
      });
    }

    return { kind: 'error', errors };
  }

  // Build CompiledProgramIR and return directly
  const compiledIR = builder.build();

  // Emit CompileEnd event (success)
  if (options) {
    const durationMs = performance.now() - startTime;
    options.events.emit({
      type: 'CompileEnd',
      compileId,
      patchId: options.patchId,
      patchRevision: options.patchRevision,
      status: 'success',
      durationMs,
      diagnostics: [], // No diagnostics on success
    });
  }

  return {
    kind: 'ok',
    program: compiledIR,
  };
}

// =============================================================================
// Pass Helpers
// =============================================================================

function formatNormError(e: { kind: string }): string {
  switch (e.kind) {
    case 'DanglingEdge':
      return 'Edge references non-existent block';
    case 'DuplicateBlockId':
      return 'Duplicate block ID';
    default:
      return e.kind;
  }
}

interface TimeRootSuccess {
  kind: 'ok';
  blockIdx: number;
}

interface TimeRootFailure {
  kind: 'error';
  errors: CompileError[];
}

function findTimeRoot(
  patch: NormalizedPatch
): TimeRootSuccess | TimeRootFailure {
  const timeRoots: number[] = [];

  for (let i = 0; i < patch.blocks.length; i++) {
    const block = patch.blocks[i];
    if (
      block.type === 'InfiniteTimeRoot' ||
      block.type === 'FiniteTimeRoot' ||
      block.type === 'TimeRoot'
    ) {
      timeRoots.push(i);
    }
  }

  if (timeRoots.length === 0) {
    return {
      kind: 'error',
      errors: [
        {
          kind: 'NoTimeRoot',
          message: 'No TimeRoot block found. Every patch needs exactly one.',
        },
      ],
    };
  }

  if (timeRoots.length > 1) {
    return {
      kind: 'error',
      errors: [
        {
          kind: 'MultipleTimeRoots',
          message: `Found ${timeRoots.length} TimeRoot blocks. Only one allowed.`,
        },
      ],
    };
  }

  return { kind: 'ok', blockIdx: timeRoots[0] };
}

function buildDependencyOrder(patch: NormalizedPatch): number[] {
  // Build adjacency list (edges go from source to target)
  const incoming = new Map<number, Set<number>>();
  const outgoing = new Map<number, Set<number>>();

  for (let i = 0; i < patch.blocks.length; i++) {
    incoming.set(i, new Set());
    outgoing.set(i, new Set());
  }

  for (const edge of patch.edges) {
    incoming.get(edge.toBlock)!.add(edge.fromBlock);
    outgoing.get(edge.fromBlock)!.add(edge.toBlock);
  }

  // Kahn's algorithm for topological sort
  const order: number[] = [];
  const queue: number[] = [];

  // Find blocks with no incoming edges
  for (let i = 0; i < patch.blocks.length; i++) {
    if (incoming.get(i)!.size === 0) {
      queue.push(i);
    }
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    for (const neighbor of outgoing.get(node)!) {
      incoming.get(neighbor)!.delete(node);
      if (incoming.get(neighbor)!.size === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all nodes in order, there's a cycle
  if (order.length !== patch.blocks.length) {
    // Find nodes in cycle
    const inCycle = new Set<number>();
    for (let i = 0; i < patch.blocks.length; i++) {
      if (!order.includes(i)) {
        inCycle.add(i);
      }
    }

    // Report error with cycle participants
    const cycleBlocks = [...inCycle].map(i => patch.blocks[i].id);
    throw new Error(
      `Dependency cycle detected involving blocks: ${cycleBlocks.join(', ')}`
    );
  }

  return order;
}

function resolveInputs(
  patch: NormalizedPatch,
  blockIdx: number,
  blockOutputs: Map<number, Record<string, ValueRef>>
): Record<string, ValueRef | undefined> {
  const result: Record<string, ValueRef | undefined> = {};

  // Find all edges targeting this block
  for (const edge of patch.edges) {
    if (edge.toBlock === blockIdx) {
      const sourceOutputs = blockOutputs.get(edge.fromBlock);
      if (sourceOutputs) {
        const portId = edge.fromPort as string;
        result[edge.toPort as string] = sourceOutputs[portId];
      }
    }
  }

  return result;
}
