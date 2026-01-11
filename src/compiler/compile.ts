/**
 * Main Compiler Entry Point
 *
 * Compiles a Patch into executable IR using the passes-v2 multi-pass architecture:
 * 1. Normalize - Dense indices, canonical ordering
 * 2. Pass 2: Type Graph - Type resolution and validation
 * 3. Pass 3: Time Topology - Find TimeRoot, extract TimeModel
 * 4. Pass 4: Dependency Graph - Build dependency information
 * 5. Pass 5: Cycle Validation - Check for cycles
 * 6. Pass 6: Block Lowering - Lower blocks to IR expressions
 * 7. Pass 7: Schedule Construction - Build execution schedule
 * 8. Pass 8: Link Resolution - Resolve all connections
 *
 * Integrated with event emission for diagnostics.
 */

import type { Patch } from '../graph';
import { normalize, type NormalizedPatch } from '../graph/normalize';
import type { CompiledProgramIR } from './ir/program';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import type { EventHub } from '../events/EventHub';

// Import passes
import { pass2TypeGraph } from './passes-v2';
import { pass3TimeTopology } from './passes-v2';
import { pass4DepGraph } from './passes-v2';
import { pass5CycleValidation } from './passes-v2';
import { pass6BlockLowering } from './passes-v2';
import { pass7Schedule } from './passes-v2';
import { pass8LinkResolution } from './passes-v2';

// =============================================================================
// Compile Errors & Results
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

export interface CompileOptions {
  readonly events: EventHub;
  readonly patchRevision: number;
  readonly patchId: string;
}

// =============================================================================
// Main Compile Function
// =============================================================================

/**
 * Compiles a Patch into executable IR using multi-pass architecture.
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

  try {
    // Pass 1: Normalize
    const normResult = normalize(patch);
    if (normResult.kind === 'error') {
      const compileErrors = normResult.errors.map((e) => ({
        kind: e.kind,
        message: formatNormError(e),
      }));

      return emitFailure(options, startTime, compileId, compileErrors);
    }

    const normalized = normResult.patch;

    // Pass 2: Type Graph
    const typedPatch = pass2TypeGraph(normalized);

    // Pass 3: Time Topology
    const timeResolvedPatch = pass3TimeTopology(typedPatch);

    // Pass 4: Dependency Graph
    const depGraphPatch = pass4DepGraph(timeResolvedPatch);

    // Pass 5: Cycle Validation (SCC)
    const acyclicPatch = pass5CycleValidation(depGraphPatch);

    // Pass 6: Block Lowering
    const unlinkedIR = pass6BlockLowering(acyclicPatch);

    // Pass 7: Schedule Construction
    const scheduleIR = pass7Schedule(unlinkedIR);

    // Pass 8: Link Resolution
    const linkedIR = pass8LinkResolution(scheduleIR);

    // Convert LinkedGraphIR to CompiledProgramIR
    const compiledIR = convertLinkedIRToProgram(linkedIR);

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
        diagnostics: [],
      });
    }

    return {
      kind: 'ok',
      program: compiledIR,
    };
  } catch (e) {
    const errors: CompileError[] = [
      {
        kind: 'CompileError',
        message: e instanceof Error ? e.message : String(e),
      },
    ];

    return emitFailure(options, startTime, compileId, errors);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function emitFailure(
  options: CompileOptions | undefined,
  startTime: number,
  compileId: string,
  errors: CompileError[]
): CompileFailure {
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

function convertLinkedIRToProgram(linkedIR: any): CompiledProgramIR {
  // TODO: Implement conversion from LinkedGraphIR to CompiledProgramIR
  // For now, return a minimal program
  // This will be updated once LinkedGraphIR structure is finalized
  return {
    version: 1,
    passes: [],
  } as CompiledProgramIR;
}
