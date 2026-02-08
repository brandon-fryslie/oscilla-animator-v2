/**
 * Debug test to understand constraint extraction for the Oscillator test case.
 */
import { describe, it, expect } from 'vitest';
import { extractConstraints } from '../extract-constraints';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import '../../../blocks/all';

describe('debug constraints', () => {
  it('Oscillator test - check what constraints are emitted', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      b.setPortDefault(time, 'periodBMs', 2000);
      const osc = b.addBlock('Oscillator');
      b.setPortDefault(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const g = buildDraftGraph(patch);
    console.log('Blocks:', g.blocks.map(b => `${b.type}:${b.id}`));
    console.log('Edges:', g.edges.map(e => `${e.from.blockId}:${e.from.port} -> ${e.to.blockId}:${e.to.port}`));

    const c = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Check requirePayloadIn constraints
    const reqPayload = c.payloadUnit.filter(p => p.kind === 'requirePayloadIn');
    console.log('requirePayloadIn constraints:', reqPayload.length);
    for (const r of reqPayload) {
      if (r.kind === 'requirePayloadIn') {
        console.log(`  port=${r.port} allowed=[${r.allowed.map(a => a.kind).join(',')}]`);
      }
    }

    // Check requireUnitless constraints
    const reqUnitless = c.payloadUnit.filter(p => p.kind === 'requireUnitless');
    console.log('requireUnitless constraints:', reqUnitless.length);
    for (const r of reqUnitless) {
      if (r.kind === 'requireUnitless') {
        console.log(`  port=${r.port}`);
      }
    }

    // Check concretePayload
    const concreteP = c.payloadUnit.filter(p => p.kind === 'concretePayload');
    console.log('concretePayload constraints:', concreteP.length);
    for (const r of concreteP) {
      if (r.kind === 'concretePayload') {
        console.log(`  port=${r.port} value=${r.value.kind}`);
      }
    }

    // Check concreteUnit
    const concreteU = c.payloadUnit.filter(p => p.kind === 'concreteUnit');
    console.log('concreteUnit constraints:', concreteU.length);
    for (const r of concreteU) {
      if (r.kind === 'concreteUnit') {
        console.log(`  port=${r.port} value=${r.value.kind}`);
      }
    }

    // Check portBaseTypes for any auto-derived vars
    console.log('Ports with vars:');
    for (const [key, type] of c.portBaseTypes) {
      if (type.payload.kind === 'var' || type.unit.kind === 'var') {
        console.log(`  ${key} payload=${type.payload.kind}${type.payload.kind === 'var' ? '(' + (type.payload as any).id + ')' : ''} unit=${type.unit.kind}${type.unit.kind === 'var' ? '(' + (type.unit as any).id + ')' : ''}`);
      }
    }

    expect(true).toBe(true);
  });
});
