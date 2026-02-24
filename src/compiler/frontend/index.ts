/**
 * Compiler Frontend
 *
 * Produces TypedPatch + CycleSummary for UI consumption.
 * Frontend is independent of Backend - can run and produce useful output
 * even when Backend would fail (unresolved types, illegal cycles, etc.)
 *
 * Pipeline (fixpoint engine):
 * 1. Composite expansion
 * 2. Build DraftGraph
 * 3. Fixpoint normalization (default sources, adapters, indexing, type solving, cardinality)
 * 4. Bridge → NormalizedPatch + TypeResolvedPatch
 * 5. Type graph (TypedPatch)
 * 6. Axis validation
 * 7. Cycle classification
 *
 * // [LAW:dataflow-not-control-flow] All steps execute unconditionally; errors are data.
 *
 * Output: FrontendResult with TypedPatch, CycleSummary, diagnostics, backendReady flag
 */

import type { Patch } from '../../graph';
import type { NormalizedPatch } from './normalize-indexing';
import type { TypedPatch, TypeResolvedPatch } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';
import type { DiagnosticSeverityOverride } from '../diagnostic-flags';
import { getDefaultSeverity } from '../diagnostic-flags';
import type { FixpointDiagnostic } from './fixpoint-diagnostic';
// Frontend passes
import { pass2TypeGraphSafe, type Pass2Error } from './analyze-type-graph';
import { analyzeCycles, type CycleSummary } from './analyze-cycles';
import { validateTypes, validateNoVarAxes, type AxisViolation } from './axis-validate';

// Composite expansion
import { expandComposites, type ExpansionDiagnostic, type ExpansionProvenance } from './composite-expansion';

import { buildDraftGraph, computeReachableDraftBlockIds } from './draft-graph';
import type { DraftGraph } from './draft-graph';
import { finalizeNormalizationFixpoint } from './final-normalization';
import { bridgeToNormalizedPatch, bridgePartialToNormalizedPatch } from './draft-graph-bridge';
import { BLOCK_DEFS_BY_TYPE, requireBlockDef, getBlockDefinition } from '../../blocks/registry';

// Re-export types for consumers
export type { TypeResolvedPatch, PortKey } from '../ir/patches';
export type { TypedPatch } from '../ir/patches';
export type { CycleSummary, ClassifiedSCC, CycleFix, SCCClassification, CycleLegality } from './analyze-cycles';
export type { AxisViolation } from './axis-validate';
export type { BindingMismatchError, BindingMismatchRemedy } from './axis-validate';
export { analyzeCycles } from './analyze-cycles';
export { pass2TypeGraph } from './analyze-type-graph';
export { validateTypes, validateNoVarAxes } from './axis-validate';

// =============================================================================
// Frontend Result Types
// =============================================================================

/**
 * Error from Frontend compilation.
 *
 * severity: 'error' blocks backend; 'warn'/'info' are pass-through.
 * diagnosticFlagCode: present for configurable fixpoint diagnostics.
 */
export interface FrontendError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
  readonly portId?: string;
  readonly severity: 'error' | 'warn' | 'info';
  /** Present for configurable diagnostics (maps to DIAGNOSTIC_FLAGS code) */
  readonly diagnosticFlagCode?: string;
}

/**
 * Result of Frontend compilation.
 * Contains everything UI needs, regardless of whether Backend will succeed.
 *
 * // [LAW:dataflow-not-control-flow] Always produced — backendReady is data, not control flow.
 */
export interface FrontendResult {
  /** The typed patch with resolved port types */
  readonly typedPatch: TypedPatch;
  /** Summary of cycles for UI display */
  readonly cycleSummary: CycleSummary;
  /** Any errors/warnings from Frontend passes */
  readonly errors: readonly FrontendError[];
  /** True if Backend can proceed with this result */
  readonly backendReady: boolean;
  /** The normalized patch (intermediate, for Backend) */
  readonly normalizedPatch: NormalizedPatch;
  /** Provenance from composite expansion (block/edge/boundary maps) */
  readonly expansionProvenance?: ExpansionProvenance;
  /** Block IDs excluded from compilation (disconnected from render pipeline) */
  readonly unreachableBlockIds: readonly string[];
}

// =============================================================================
// Main Frontend Entry Point
// =============================================================================

/**
 * Run the Frontend compiler pipeline.
 *
 * Produces TypedPatch + CycleSummary for UI, even if Backend would fail.
 * The `backendReady` flag indicates whether Backend can proceed.
 *
 * // [LAW:dataflow-not-control-flow] All passes execute unconditionally.
 * Every pass always runs; variability lives in the data (errors, partial types),
 * not in whether operations execute.
 *
 * @param patch - The patch to compile
 * @returns FrontendResult with typed graph and cycle info
 */
export interface FrontendOptions {
  readonly traceCardinalitySolver?: boolean;
  /** GCC-style severity overrides keyed by diagnosticFlagCode */
  readonly diagnosticOverrides?: Readonly<Record<string, DiagnosticSeverityOverride>>;
}

export function compileFrontend(patch: Patch, options?: FrontendOptions): FrontendResult {
  const errors: FrontendError[] = [];
  const overrides = options?.diagnosticOverrides ?? {};

  // Step 1: Composite expansion (always)
  const expansion = expandComposites(patch);
  errors.push(
    ...expansion.diagnostics
      .filter(d => d.severity === 'error')
      .map(convertExpansionDiagnostic),
  );
  const expandedPatch = expansion.patch;

  // Step 2: Build DraftGraph from expanded patch (always)
  const { graph: draftGraph, diagnostics: buildDiagnostics } = buildDraftGraph(expandedPatch);

  // Step 2.5: Filter unreachable blocks before fixpoint
  // Only applies when the graph has render blocks (output sinks).
  // Without render blocks, every block is potentially useful — pass everything through.
  const hasRenderBlocks = draftGraph.blocks.some((b) => {
    const def = getBlockDefinition(b.type);
    return def?.capability === 'render';
  });

  const reachableBlockIds = hasRenderBlocks
    ? computeReachableDraftBlockIds(draftGraph.blocks, draftGraph.edges)
    : new Set(draftGraph.blocks.map((b) => b.id)); // All blocks reachable when no render sinks

  const unreachableBlockIds = draftGraph.blocks
    .filter((b) => !reachableBlockIds.has(b.id))
    .map((b) => b.id);

  // Only report build diagnostics for reachable blocks
  errors.push(
    ...buildDiagnostics
      .filter((d) => reachableBlockIds.has(d.blockId))
      .map((d) => ({
        kind: `Build/${d.kind}` as const,
        message: `Required input "${d.portName}" on block "${d.blockId}" is not connected`,
        blockId: d.blockId,
        portId: d.portName,
        severity: 'error' as const,
      })),
  );

  const filteredDraftGraph: DraftGraph = hasRenderBlocks
    ? {
        ...draftGraph,
        blocks: draftGraph.blocks.filter((b) => reachableBlockIds.has(b.id)),
        edges: draftGraph.edges.filter(
          (e) => reachableBlockIds.has(e.from.blockId) && reachableBlockIds.has(e.to.blockId),
        ),
        obligations: draftGraph.obligations.filter(
          (o) => !o.anchor.blockId || reachableBlockIds.has(o.anchor.blockId!),
        ),
      }
    : draftGraph; // No render blocks — pass everything (avoid stripping the whole graph)

  // Step 3: Run fixpoint engine (always)
  const fixpointResult = finalizeNormalizationFixpoint(
    filteredDraftGraph,
    BLOCK_DEFS_BY_TYPE,
    { maxIterations: 20 },
  );

  // Collect fixpoint diagnostics — severity applied by single enforcer
  // [LAW:single-enforcer] convertFixpointDiagnostics is the one place that applies severity.
  errors.push(...convertFixpointDiagnostics(fixpointResult.diagnostics, overrides));

  // If fixpoint didn't converge and no diagnostics explain why, add a generic message
  if (fixpointResult.strict === null && errors.length === 0) {
    errors.push({
      kind: 'FixpointFailed',
      message: 'Fixpoint normalization could not fully resolve the graph',
      severity: 'error',
    });
  }

  // Step 3.5: Post-normalization wiring validation (unconditional)
  // [LAW:single-enforcer] Frontend rejects missing inputs, not backend.
  // This runs AFTER normalization (which materializes defaults) but BEFORE backend lowering.
  if (fixpointResult.strict) {
    for (const block of fixpointResult.strict.graph.blocks) {
      try {
        const blockDef = requireBlockDef(block.type);
        for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
          // Skip config-only inputs (exposedAsPort: false)
          if (inputDef.exposedAsPort === false) continue;
          // Skip collect ports (connections are optional by design)
          if (inputDef.collectAccepts) continue;

          // Check if there's an inbound edge for this required input
          const hasInboundEdge = fixpointResult.strict.graph.edges.some(
            (e) => e.to.blockId === block.id && e.to.port === portId
          );
          if (!hasInboundEdge) {
            errors.push({
              kind: 'MissingInputSource',
              message: `${block.type}#${block.id}:${portId} has no inbound edge after normalization`,
              blockId: block.id,
              portId,
              severity: 'error',
            });
          }
        }
      } catch (e) {
        // Block type not found — expansion should have caught this
        errors.push({
          kind: 'UnknownBlockType',
          message: `Block type ${block.type} not found in registry`,
          blockId: block.id,
          severity: 'error',
        });
      }
    }
  }

  // Step 4: Bridge (always — strict when available, partial otherwise)
  // [LAW:dataflow-not-control-flow] Both paths produce the same shape; variability is in the data.
  const { normalizedPatch, typeResolved } = fixpointResult.strict
    ? bridgeToNormalizedPatch(fixpointResult.strict, expandedPatch, BLOCK_DEFS_BY_TYPE, fixpointResult.facts.portAcceptance)
    : bridgePartialToNormalizedPatch(fixpointResult.graph, fixpointResult.facts, expandedPatch, BLOCK_DEFS_BY_TYPE);

  // Step 5: Type graph (always — total, never throws)
  const { typedPatch, errors: tgErrors } = pass2TypeGraphSafe(typeResolved);
  errors.push(...tgErrors.map(convertPass2Error));

  // Step 6: Axis validation (always)
  const allTypes: CanonicalType[] = Array.from(typeResolved.portTypes.values());
  const axisViolations = validateTypes(allTypes);
  const varEscapeViolations = validateNoVarAxes(allTypes);
  errors.push(
    ...[...axisViolations, ...varEscapeViolations].map((v) => convertAxisViolation(v, typeResolved)),
  );

  // Step 7: Cycle classification (always)
  const cycleSummary = analyzeCycles(typedPatch);

  // Step 8: backendReady is data, not control flow
  // Backend proceeds when no blocking errors remain and strict resolved.
  const hasBlockingErrors = errors.some(e => e.severity === 'error');
  const backendReady =
    !hasBlockingErrors &&
    fixpointResult.strict !== null &&
    !cycleSummary.hasIllegalCycles;

  return {
    typedPatch,
    cycleSummary,
    errors,
    backendReady,
    normalizedPatch,
    expansionProvenance: expansion.provenance,
    unreachableBlockIds,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function convertExpansionDiagnostic(d: ExpansionDiagnostic): FrontendError {
  return {
    kind: `CompositeExpansion/${d.code}`,
    message: d.message,
    blockId: d.at.instanceBlockId,
    portId: d.at.port,
    severity: 'error',
  };
}

/**
 * Convert fixpoint diagnostics to FrontendErrors.
 *
 * // [LAW:single-enforcer] This is the ONE place that applies severity from
 * DIAGNOSTIC_FLAGS defaults + user overrides to fixpoint diagnostics.
 *
 * For each FixpointDiagnostic:
 * 1. Read diagnosticFlagCode
 * 2. Look up severity: overrides[code] ?? getDefaultSeverity(code)
 * 3. If 'ignore', drop entirely
 * 4. Produce FrontendError with severity and port context
 */
function convertFixpointDiagnostics(
  diagnostics: readonly FixpointDiagnostic[],
  overrides: Readonly<Record<string, DiagnosticSeverityOverride>>,
): FrontendError[] {
  const result: FrontendError[] = [];
  for (const d of diagnostics) {
    const code = d.diagnosticFlagCode;
    const severity = overrides[code] ?? getDefaultSeverity(code);

    // 'ignore' → drop entirely
    if (severity === 'ignore') continue;

    // Extract block/port context from port key fields
    const { blockId, portId } = extractPortContext(d);

    result.push({
      kind: code,
      message: d.message,
      blockId,
      portId,
      severity: severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : 'info',
      diagnosticFlagCode: code,
    });
  }
  return result;
}

/**
 * Extract blockId and portId from a FixpointDiagnostic's port key fields.
 * Handles both `port` (single DraftPortKey) and `ports` (array of DraftPortKeys).
 */
function extractPortContext(d: FixpointDiagnostic): { blockId?: string; portId?: string } {
  // Single port key (payload-unit errors)
  if (d.port) {
    return parseDraftPortKey(d.port);
  }
  // Array of port keys (cardinality errors) — use first entry for reference
  if (d.ports && d.ports.length > 0) {
    return parseDraftPortKey(d.ports[0]);
  }
  return {};
}

/**
 * Parse a DraftPortKey (`${blockId}:${portName}:${'in'|'out'}`) into blockId and portId.
 * Uses lastIndexOf to handle blockIds that contain colons (e.g. composite expansion IDs).
 */
function parseDraftPortKey(key: string): { blockId: string; portId: string } {
  // Format: blockId:portName:dir — split from the right since blockId may contain ':'
  const lastColon = key.lastIndexOf(':');
  if (lastColon < 0) return { blockId: key, portId: '' };
  const withoutDir = key.slice(0, lastColon);
  const secondLastColon = withoutDir.lastIndexOf(':');
  if (secondLastColon < 0) return { blockId: withoutDir, portId: '' };
  return {
    blockId: withoutDir.slice(0, secondLastColon),
    portId: withoutDir.slice(secondLastColon + 1),
  };
}

/**
 * Convert Pass2Error to FrontendError.
 */
function convertPass2Error(error: Pass2Error): FrontendError {
  return {
    kind: `TypeGraph/${error.kind}`,
    message: error.message,
    severity: 'error',
  };
}

/**
 * Convert AxisViolation to FrontendError with block/port context.
 */
function convertAxisViolation(violation: AxisViolation, patch: TypeResolvedPatch): FrontendError {
  const portTypes = Array.from(patch.portTypes.entries());

  if (violation.nodeIndex < portTypes.length) {
    const [portKey, _type] = portTypes[violation.nodeIndex];
    const [blockIndexStr, portName, _direction] = portKey.split(':');
    const blockIndex = parseInt(blockIndexStr, 10);
    const block = patch.blocks[blockIndex];

    return {
      kind: 'AxisInvalid',
      message: violation.message,
      blockId: block?.id,
      portId: portName,
      severity: 'error',
    };
  }

  return {
    kind: 'AxisInvalid',
    message: violation.message,
    severity: 'error',
  };
}
