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

/**
 * Dump full constraint/solver state for a DraftGraph.
 * Returns the solver result for assertion use.
 */
function traceConstraintsAndSolver(label: string, graph: Parameters<typeof extractConstraints>[0]) {
  const extracted = extractConstraints(graph, BLOCK_DEFS_BY_TYPE);

  console.log(`\n=== ${label}: Port Base Types ===`);
  for (const [key, type] of extracted.portBaseTypes) {
    const pKind = type.payload.kind;
    const pId = pKind === 'var' ? `:${(type.payload as any).id}` : '';
    const uKind = type.unit.kind;
    const uId = uKind === 'var' ? `:${(type.unit as any).id}` : '';
    console.log(`  ${key}: payload=${pKind}${pId} unit=${uKind}${uId}`);
  }

  console.log(`\n=== ${label}: Payload/Unit Constraints ===`);
  for (const c of extracted.payloadUnit) {
    switch (c.kind) {
      case 'payloadEq':
        console.log(`  payloadEq: ${c.a} <=> ${c.b} (${c.origin.kind})`);
        break;
      case 'unitEq':
        console.log(`  unitEq: ${c.a} <=> ${c.b} (${c.origin.kind})`);
        break;
      case 'concretePayload':
        console.log(`  concretePayload: ${c.port} = ${c.value.kind} (${c.origin.kind})`);
        break;
      case 'concreteUnit':
        console.log(`  concreteUnit: ${c.port} = ${c.value.kind} (${c.origin.kind})`);
        break;
      case 'requirePayloadIn':
        console.log(`  requirePayloadIn: ${c.port} in [${c.allowed.map(a => a.kind).join(',')}] (${c.origin.kind})`);
        break;
      case 'requireUnitless':
        console.log(`  requireUnitless: ${c.port} (${c.origin.kind})`);
        break;
    }
  }

  const portVarMapping = buildPortVarMapping(extracted.portBaseTypes);
  console.log(`\n=== ${label}: Port Var Mapping (vars only) ===`);
  for (const [key, varInfo] of portVarMapping) {
    if (varInfo.payloadVarId || varInfo.unitVarId) {
      console.log(`  ${key}: pVar=${varInfo.payloadVarId ?? '-'} uVar=${varInfo.unitVarId ?? '-'}`);
    }
  }

  const result = solvePayloadUnit(extracted.payloadUnit, portVarMapping);

  console.log(`\n=== ${label}: Solver Errors ===`);
  for (const e of result.errors) {
    console.log(`  ${e.kind}: ${e.message} (port=${e.port})`);
  }

  console.log(`\n=== ${label}: Var Resolutions ===`);
  for (const [varId, payload] of result.payloads) {
    console.log(`  payload ${varId} → ${payload.kind}`);
  }
  for (const [varId, unit] of result.units) {
    console.log(`  unit ${varId} → ${unit.kind}`);
  }

  console.log(`\n=== ${label}: Port Payloads (selected) ===`);
  for (const [key, payload] of result.portPayloads) {
    if (key.includes('_ds_') || key.includes('periodAMs') || key.includes('periodBMs') || key.includes('mode:')) {
      console.log(`  ${key}: ${payload.kind}`);
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
      b.setPortDefault(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const expansion = expandComposites(patch);
    const { graph: draftGraph } = buildDraftGraph(expansion.patch);

    // Run fixpoint to get the expanded graph
    const fixpoint = finalizeNormalizationFixpoint(draftGraph, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });

    console.log('=== Final Graph ===');
    console.log('Blocks:', fixpoint.graph.blocks.map(b => `${b.id}:${b.type}`));
    console.log('Edges:', fixpoint.graph.edges.map(e => `${e.from.blockId}:${e.from.port} -> ${e.to.blockId}:${e.to.port} (${e.role})`));

    // Trace full constraint state on the expanded graph
    const solverResult = traceConstraintsAndSolver('Expanded graph', fixpoint.graph);

    // Verify: each Const block's var resolution is independent
    // periodAMs/periodBMs Consts should resolve to float, mode Const should resolve to int
    for (const [key, payload] of solverResult.portPayloads) {
      if (key.includes('_ds_b0_periodAMs') || key.includes('_ds_b0_periodBMs')) {
        expect(payload.kind).toBe('float');
      }
      if (key.includes('_ds_b1_mode')) {
        expect(payload.kind).toBe('int');
      }
    }

    // Verify: var-level substitution map has distinct entries per block
    const varKeys = [...solverResult.payloads.keys()];
    const constPayloadVars = varKeys.filter(k => k.includes('const_payload'));
    // Should have 3 distinct scoped vars (one per Const instance)
    expect(constPayloadVars.length).toBe(3);

    // Full frontend should succeed
    const result = compileFrontend(patch);
    console.log('\nFrontend backendReady:', result.backendReady);
    if (!result.backendReady) {
      console.log('errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.backendReady).toBe(true);
  });
});
