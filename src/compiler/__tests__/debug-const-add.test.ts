/**
 * Debug harness for the normalization fixpoint.
 *
 * Dumps constraints, solver state, and per-port results.
 * Permanent debugging tool for the fixpoint engine — not production tests.
 */
import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph/Patch';
import { buildDraftGraph } from '../frontend/draft-graph';
import { finalizeNormalizationFixpoint } from '../frontend/final-normalization';
import { BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';
import { expandComposites } from '../frontend/composite-expansion';
import { compileFrontend } from '../frontend/index';
import { extractConstraints } from '../frontend/extract-constraints';
import { solvePayloadUnit, buildPortVarMapping } from '../frontend/payload-unit/solve';

const TRACE = process.env.OSCILLA_DEBUG_TEST_TRACE === '1';

function trace(...args: unknown[]): void {
  // [LAW:verifiable-goals] Debug logging remains available behind an explicit
  // switch; default test runs stay deterministic and low-noise.
  if (TRACE) {
     
    console.log(...args);
  }
}

/**
 * Dump full constraint/solver state for a DraftGraph.
 * Returns the solver result for assertion use.
 */
function traceConstraintsAndSolver(label: string, graph: Parameters<typeof extractConstraints>[0]) {
  const extracted = extractConstraints(graph, BLOCK_DEFS_BY_TYPE);

  trace(`\n=== ${label}: Port Base Types ===`);
  for (const [key, type] of extracted.portBaseTypes) {
    const pKind = type.payload.kind;
    const pId = pKind === 'var' ? `:${(type.payload as any).id}` : '';
    const uKind = type.unit.kind;
    const uId = uKind === 'var' ? `:${(type.unit as any).id}` : '';
    trace(`  ${key}: payload=${pKind}${pId} unit=${uKind}${uId}`);
  }

  trace(`\n=== ${label}: Payload/Unit Constraints ===`);
  for (const c of extracted.payloadUnit) {
    switch (c.kind) {
      case 'payloadEq':
        trace(`  payloadEq: ${c.a} <=> ${c.b} (${c.origin.kind})`);
        break;
      case 'unitEq':
        trace(`  unitEq: ${c.a} <=> ${c.b} (${c.origin.kind})`);
        break;
      case 'concretePayload':
        trace(`  concretePayload: ${c.port} = ${c.value.kind} (${c.origin.kind})`);
        break;
      case 'concreteUnit':
        trace(`  concreteUnit: ${c.port} = ${c.value.kind} (${c.origin.kind})`);
        break;
      case 'requirePayloadIn':
        trace(`  requirePayloadIn: ${c.port} in [${c.allowed.map(a => a.kind).join(',')}] (${c.origin.kind})`);
        break;
      case 'requireUnitless':
        trace(`  requireUnitless: ${c.port} (${c.origin.kind})`);
        break;
    }
  }

  const portVarMapping = buildPortVarMapping(extracted.portBaseTypes);
  trace(`\n=== ${label}: Port Var Mapping (vars only) ===`);
  for (const [key, varInfo] of portVarMapping) {
    if (varInfo.payloadVarId || varInfo.unitVarId) {
      trace(`  ${key}: pVar=${varInfo.payloadVarId ?? '-'} uVar=${varInfo.unitVarId ?? '-'}`);
    }
  }

  const result = solvePayloadUnit(extracted.payloadUnit, portVarMapping);

  trace(`\n=== ${label}: Solver Errors ===`);
  for (const e of result.errors) {
    trace(`  ${e.kind}: ${e.message} (port=${e.port})`);
  }

  trace(`\n=== ${label}: Var Resolutions ===`);
  for (const [varId, payload] of result.payloads) {
    trace(`  payload ${varId} → ${payload.kind}`);
  }
  for (const [varId, unit] of result.units) {
    trace(`  unit ${varId} → ${unit.kind}`);
  }

  trace(`\n=== ${label}: Port Payloads (selected) ===`);
  for (const [key, payload] of result.portPayloads) {
    if (key.includes('_ds_') || key.includes('periodAMs') || key.includes('periodBMs') || key.includes('mode:')) {
      trace(`  ${key}: ${payload.kind}`);
    }
  }

  return result;
}

describe('Debug fixpoint harness', () => {
  it('TimeRoot + Oscillator: var instantiation produces correct per-block resolution', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      b.setPortDefault(time, 'periodBMs', 2000);
      const osc = b.addBlock('Oscillator');
      b.setConfig(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const expansion = expandComposites(patch);
    const { graph: draftGraph } = buildDraftGraph(expansion.patch);

    // Run fixpoint to get the expanded graph
    const fixpoint = finalizeNormalizationFixpoint(draftGraph, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });

    trace('=== Final Graph ===');
    trace('Blocks:', fixpoint.graph.blocks.map(b => `${b.id}:${b.type}`));
    trace('Edges:', fixpoint.graph.edges.map(e => `${e.from.blockId}:${e.from.port} -> ${e.to.blockId}:${e.to.port} (${e.role})`));

    // Trace full constraint state on the expanded graph
    const solverResult = traceConstraintsAndSolver('Expanded graph', fixpoint.graph);

    // Verify: each Const block's var resolution is independent
    // periodAMs/periodBMs Consts should resolve to float (mode is config, no Const block created)
    for (const [key, payload] of solverResult.portPayloads) {
      if (key.includes('_ds_b0_periodAMs') || key.includes('_ds_b0_periodBMs')) {
        expect(payload.kind).toBe('float');
      }
    }

    // Verify: var-level substitution map has distinct entries per block
    // mode has exposedAsPort: false → config param, no Const block → 2 scoped vars (periodAMs, periodBMs)
    const varKeys = [...solverResult.payloads.keys()];
    const constPayloadVars = varKeys.filter(k => k.includes('const_payload'));
    expect(constPayloadVars.length).toBe(2);

    // Full frontend should succeed
    const result = compileFrontend(patch);
    trace('\nFrontend backendReady:', result.backendReady);
    if (!result.backendReady) {
      trace('errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.backendReady).toBe(true);
  });
});
