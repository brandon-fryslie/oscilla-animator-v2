/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute continuous scalars (SignalContinuous)
 * 3. Execute continuous fields (FieldContinuous) - domain loops
 * 4. Apply discrete ops (SignalDiscrete) - events
 * 5. Sinks (RenderEndpoint)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 */

import type { LinkedGraphIR } from './pass8-link-resolution';
import type { SigExpr, FieldExpr, EventExpr, DomainId } from '../ir/types';
import type { SignalType } from '../../core/canonical-types';
import { getAxisValue, isInstantiated } from '../../core/canonical-types';

// =============================================================================
// Schedule IR Types
// =============================================================================

/**
 * Execution Phase - groups operations by execution class
 */
export type ExecutionPhase =
  | 'rails'      // Time and external input updates
  | 'scalars'    // Signal (one + continuous) evaluations
  | 'fields'     // Field (many + continuous) evaluations with domain loops
  | 'events'     // Event (discrete) operations
  | 'sinks';     // Render endpoint writes

/**
 * Execution Class - determined by cardinality + temporality
 */
export type ExecutionClass =
  | 'SignalContinuous'   // one + continuous
  | 'FieldContinuous'    // many(domain) + continuous
  | 'SignalDiscrete'     // one + discrete
  | 'RenderEndpoint';    // sink operations

/**
 * Schedule Step - single operation in the execution schedule
 */
export interface ScheduleStep {
  readonly phase: ExecutionPhase;
  readonly class: ExecutionClass;
  readonly nodeId: number;        // Index into appropriate expr table
  readonly dependencies: readonly number[];  // Node IDs this step depends on
}

/**
 * Phase Group - all steps for a given phase
 */
export interface PhaseGroup {
  readonly phase: ExecutionPhase;
  readonly steps: readonly ScheduleStep[];
}

/**
 * Complete execution schedule
 */
export interface ScheduleIR {
  readonly phases: readonly PhaseGroup[];
  readonly topology: 'dag' | 'cyclic';  // Whether graph has valid cycles
}

// =============================================================================
// Execution Class Determination
// =============================================================================

/**
 * Determine execution class from SignalType.
 *
 * Rules:
 * - one + continuous → SignalContinuous
 * - many(domain) + continuous → FieldContinuous
 * - one + discrete → SignalDiscrete
 * - Sinks → RenderEndpoint (determined by usage context)
 */
function determineExecutionClass(type: SignalType): ExecutionClass | null {
  const cardinality = type.extent.cardinality;
  const temporality = type.extent.temporality;

  // Resolve axes (default = canonical defaults)
  const isZero = isInstantiated(cardinality) && cardinality.value.kind === 'zero';
  const isOne = isInstantiated(cardinality) && cardinality.value.kind === 'one';
  const isMany = isInstantiated(cardinality) && cardinality.value.kind === 'many';

  const isContinuous = !isInstantiated(temporality) || temporality.value.kind === 'continuous';
  const isDiscrete = isInstantiated(temporality) && temporality.value.kind === 'discrete';

  // Zero cardinality = compile-time constant, no runtime execution needed
  if (isZero) {
    return null;
  }

  // one + continuous → SignalContinuous
  if (isOne && isContinuous) {
    return 'SignalContinuous';
  }

  // many(domain) + continuous → FieldContinuous
  if (isMany && isContinuous) {
    return 'FieldContinuous';
  }

  // one + discrete → SignalDiscrete
  if (isOne && isDiscrete) {
    return 'SignalDiscrete';
  }

  // many(domain) + discrete → SignalDiscrete (per-lane events)
  if (isMany && isDiscrete) {
    return 'SignalDiscrete';
  }

  // Default to SignalContinuous for uninstantiated axes
  return 'SignalContinuous';
}

/**
 * Map execution class to phase
 */
function classToPhase(execClass: ExecutionClass): ExecutionPhase {
  switch (execClass) {
    case 'SignalContinuous':
      return 'scalars';
    case 'FieldContinuous':
      return 'fields';
    case 'SignalDiscrete':
      return 'events';
    case 'RenderEndpoint':
      return 'sinks';
  }
}

// =============================================================================
// Dependency Analysis
// =============================================================================

/**
 * Build dependency graph for signal expressions
 */
function analyzeSigDependencies(
  sigExprs: readonly SigExpr[]
): Map<number, Set<number>> {
  const deps = new Map<number, Set<number>>();

  for (let i = 0; i < sigExprs.length; i++) {
    const expr = sigExprs[i];
    const exprDeps = new Set<number>();

    switch (expr.kind) {
      case 'map':
        exprDeps.add(expr.input);
        break;
      case 'zip':
        for (const input of expr.inputs) {
          exprDeps.add(input);
        }
        break;
      case 'const':
      case 'slot':
      case 'time':
      case 'external':
      case 'stateRead':
        // No dependencies
        break;
    }

    deps.set(i, exprDeps);
  }

  return deps;
}

/**
 * Build dependency graph for field expressions
 */
function analyzeFieldDependencies(
  fieldExprs: readonly FieldExpr[],
  sigCount: number
): Map<number, Set<number>> {
  const deps = new Map<number, Set<number>>();

  for (let i = 0; i < fieldExprs.length; i++) {
    const expr = fieldExprs[i];
    const exprDeps = new Set<number>();

    switch (expr.kind) {
      case 'broadcast':
        // Depends on signal (offset by sig table size)
        exprDeps.add(sigCount + expr.signal);
        break;
      case 'map':
        exprDeps.add(expr.input);
        break;
      case 'zip':
        for (const input of expr.inputs) {
          exprDeps.add(input);
        }
        break;
      case 'zipSig':
        exprDeps.add(expr.field);
        for (const signal of expr.signals) {
          exprDeps.add(sigCount + signal);
        }
        break;
      case 'const':
      case 'source':
      case 'mapIndexed':
        // No dependencies
        break;
    }

    deps.set(i, exprDeps);
  }

  return deps;
}

// =============================================================================
// Topological Sort
// =============================================================================

/**
 * Topological sort of nodes respecting dependencies.
 * Returns nodes in dependency order (dependencies before dependents).
 */
function topologicalSort(
  nodes: readonly number[],
  deps: Map<number, Set<number>>
): number[] {
  const sorted: number[] = [];
  const visited = new Set<number>();
  const temp = new Set<number>();

  function visit(node: number): void {
    if (visited.has(node)) return;
    if (temp.has(node)) {
      // Cycle detected - for now, continue (Pass 5 should have validated)
      return;
    }

    temp.add(node);

    const nodeDeps = deps.get(node) || new Set();
    for (const dep of nodeDeps) {
      visit(dep);
    }

    temp.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }

  return sorted;
}

// =============================================================================
// Pass 7: Schedule Construction
// =============================================================================

/**
 * Pass 7: Build execution schedule
 *
 * Groups operations by execution phase and orders within each phase
 * respecting data dependencies.
 *
 * @param linkedIR - IR from Pass 8 with complete port linkage
 * @returns ScheduleIR with phase-ordered execution steps
 */
export function pass7Schedule(linkedIR: LinkedGraphIR): ScheduleIR {
  const { builder } = linkedIR;

  // Get execution tables (already dense arrays from IRBuilder)
  const sigExprs = (builder as any).getSigExprs() as readonly SigExpr[];
  const fieldExprs = (builder as any).getFieldExprs() as readonly FieldExpr[];
  const eventExprs = (builder as any).getEventExprs() as readonly EventExpr[];

  // Build dependency graphs
  const sigDeps = analyzeSigDependencies(sigExprs);
  const fieldDeps = analyzeFieldDependencies(fieldExprs, sigExprs.length);

  // Categorize nodes by execution class
  const signalContinuous: number[] = [];
  const fieldContinuous: number[] = [];
  const signalDiscrete: number[] = [];

  // Categorize signal expressions
  for (let i = 0; i < sigExprs.length; i++) {
    const expr = sigExprs[i];
    const execClass = determineExecutionClass(expr.type);

    if (execClass === 'SignalContinuous') {
      signalContinuous.push(i);
    } else if (execClass === 'SignalDiscrete') {
      signalDiscrete.push(i);
    }
    // null means compile-time constant, skip
  }

  // Categorize field expressions (all are FieldContinuous)
  for (let i = 0; i < fieldExprs.length; i++) {
    const expr = fieldExprs[i];
    const execClass = determineExecutionClass(expr.type);

    if (execClass === 'FieldContinuous') {
      fieldContinuous.push(i);
    }
  }

  // Sort within each phase by dependencies
  const sortedSignals = topologicalSort(signalContinuous, sigDeps);
  const sortedFields = topologicalSort(fieldContinuous, fieldDeps);
  const sortedEvents = topologicalSort(signalDiscrete, sigDeps);

  // Build schedule steps
  const railsSteps: ScheduleStep[] = []; // TODO: Identify time/external reads

  const scalarSteps: ScheduleStep[] = sortedSignals.map(nodeId => ({
    phase: 'scalars' as const,
    class: 'SignalContinuous' as const,
    nodeId,
    dependencies: Array.from(sigDeps.get(nodeId) || []),
  }));

  const fieldSteps: ScheduleStep[] = sortedFields.map(nodeId => ({
    phase: 'fields' as const,
    class: 'FieldContinuous' as const,
    nodeId,
    dependencies: Array.from(fieldDeps.get(nodeId) || []),
  }));

  const eventSteps: ScheduleStep[] = sortedEvents.map(nodeId => ({
    phase: 'events' as const,
    class: 'SignalDiscrete' as const,
    nodeId,
    dependencies: Array.from(sigDeps.get(nodeId) || []),
  }));

  const sinkSteps: ScheduleStep[] = []; // TODO: Identify render sinks from steps

  // Build phase groups
  const phases: PhaseGroup[] = [
    { phase: 'rails', steps: railsSteps },
    { phase: 'scalars', steps: scalarSteps },
    { phase: 'fields', steps: fieldSteps },
    { phase: 'events', steps: eventSteps },
    { phase: 'sinks', steps: sinkSteps },
  ];

  return {
    phases,
    topology: 'dag', // Pass 5 validated cycles
  };
}
