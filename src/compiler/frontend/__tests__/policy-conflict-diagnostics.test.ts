/**
 * Tests for contradictory cardinality policy declaration diagnostics.
 *
 * When ports in a block share the same cardinality var but declare
 * incompatible policies (relation or instanceBinding), the extraction
 * boundary must produce structured FixpointDiagnostics instead of throwing.
 *
 * // [LAW:behavior-not-structure] Tests assert diagnostic behavior, not internal data shapes.
 * // [LAW:single-enforcer] Policy conflicts are detected only in extractConstraints.
 */
import { describe, it, expect } from 'vitest';
import { extractConstraints } from '../extract-constraints';
import type { DraftGraph, DraftBlock } from '../draft-graph';
import type { BlockDef, InputDef, OutputDef } from '../../../blocks/registry';
import { inferType } from '../../../core/inference-types';
import { FLOAT } from '../../../core/canonical-types';
import { cardinalityVar } from '../../../core/inference-types';
import { cardinalityVarId } from '../../../core/ids';
import type { BlockRole } from '../../../types';
import type { CardinalityPolicy } from '../../../core/canonical-types/cardinality';

// =============================================================================
// Helpers
// =============================================================================

const USER_ROLE: BlockRole = { kind: 'user', meta: {} };

/** Build a minimal DraftBlock. */
function draftBlock(id: string, type: string): DraftBlock {
  return {
    id,
    type,
    params: {},
    portDefaults: {},
    origin: 'user',
    displayName: type,
    domainId: null,
    role: USER_ROLE,
  };
}

/** Build a minimal BlockDef with given inputs/outputs. */
function blockDef(
  type: string,
  inputs: Record<string, InputDef>,
  outputs: Record<string, OutputDef>,
): BlockDef {
  return {
    type,
    label: type,
    category: 'test',
    form: 'primitive',
    capability: 'pure',
    inputs,
    outputs,
    lower: () => ({ outputsById: {} }),
  } as unknown as BlockDef;
}

/** Build a DraftGraph with a single block and no edges. */
function singleBlockGraph(block: DraftBlock): DraftGraph {
  return {
    blocks: [block],
    edges: [],
    obligations: [],
    meta: { revision: 0, provenance: 'test' },
  };
}

/** Build a cardinality var axis with given policy, sharing a var ID. */
function cardVar(varName: string, policy: CardinalityPolicy) {
  return cardinalityVar(cardinalityVarId(varName), policy);
}

// =============================================================================
// Relation conflict
// =============================================================================

describe('ConflictingCardinalityRelation diagnostic', () => {
  it('produces diagnostic when ports in same group declare uniform vs promoteToMany', () => {
    const varId = 'shared_card';
    const block = draftBlock('blk1', 'BadRelation');
    const def = blockDef(
      'BadRelation',
      {
        fieldIn: {
          label: 'Field In',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'manyOnly', instanceBinding: 'inherit' }),
          }),
        },
      },
      {
        sigOut: {
          label: 'Sig Out',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'oneOnly' }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    // Should produce exactly one ConflictingCardinalityRelation diagnostic
    const relationConflicts = result.policyDiagnostics.filter(
      (d) => d.diagnosticFlagCode === 'ConflictingCardinalityRelation',
    );
    expect(relationConflicts).toHaveLength(1);

    const diag = relationConflicts[0];
    expect(diag.message).toContain('BadRelation');
    expect(diag.message).toContain('promoteToMany');
    expect(diag.message).toContain('uniform');
    expect(diag.stableKey).toContain('blk1');
    expect(diag.ports).toBeDefined();
    expect(diag.ports!.length).toBeGreaterThanOrEqual(2);
    expect(diag.origins).toBeDefined();
    expect(diag.origins!.length).toBe(2);
  });

  it('does not emit diagnostic when all ports agree on relation', () => {
    const varId = 'agree_card';
    const block = draftBlock('blk2', 'GoodRelation');
    const def = blockDef(
      'GoodRelation',
      {
        fieldIn: {
          label: 'Field In',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'manyOnly', instanceBinding: 'inherit' }),
          }),
        },
      },
      {
        fieldOut: {
          label: 'Field Out',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'manyOnly', instanceBinding: 'inherit' }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    expect(result.policyDiagnostics).toHaveLength(0);
  });

  it('skips constraint emission for conflicted group', () => {
    const varId = 'conflict_skip';
    const block = draftBlock('blk3', 'SkipConflict');
    const def = blockDef(
      'SkipConflict',
      {
        a: {
          label: 'A',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'oneOrMany' }),
          }),
        },
      },
      {
        b: {
          label: 'B',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'oneOrMany' }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    // Conflicted group should NOT produce promoteToMany or equal constraints
    const groupConstraints = result.cardinality.filter(
      (c) => c.kind === 'promoteToMany' || (c.kind === 'equal' && 'a' in c),
    );
    // The group-level constraints (for the conflicted group) should be absent
    const conflictGroupId = `c:blk3:${varId}`;
    const groupLevelForConflict = groupConstraints.filter((c) => {
      if (c.kind === 'promoteToMany') {
        return c.ports.some((p) => p.includes('blk3'));
      }
      if (c.kind === 'equal') {
        return c.a.includes('blk3') || c.b.includes('blk3');
      }
      return false;
    });
    expect(groupLevelForConflict).toHaveLength(0);

    // But the diagnostic should still exist
    expect(result.policyDiagnostics).toHaveLength(1);
  });
});

// =============================================================================
// InstanceBinding conflict
// =============================================================================

describe('ConflictingInstanceBinding diagnostic', () => {
  it('produces diagnostic when ports declare inherit vs create', () => {
    const varId = 'ib_card';
    const block = draftBlock('blk4', 'BadBinding');
    const def = blockDef(
      'BadBinding',
      {
        fieldIn: {
          label: 'Field In',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'manyOnly', instanceBinding: 'inherit' }),
          }),
        },
      },
      {
        fieldOut: {
          label: 'Field Out',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'manyOnly', instanceBinding: { kind: 'create', domainType: 'grid' as any } }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    const bindingConflicts = result.policyDiagnostics.filter(
      (d) => d.diagnosticFlagCode === 'ConflictingInstanceBinding',
    );
    expect(bindingConflicts).toHaveLength(1);

    const diag = bindingConflicts[0];
    expect(diag.message).toContain('BadBinding');
    expect(diag.message).toContain('inherit');
    expect(diag.message).toContain('create(grid)');
    expect(diag.stableKey).toContain('blk4');
    expect(diag.ports).toBeDefined();
    expect(diag.ports!.length).toBeGreaterThanOrEqual(2);
    expect(diag.origins).toBeDefined();
    expect(diag.origins!.length).toBe(2);
  });

  it('does not emit diagnostic when all ports agree on instanceBinding', () => {
    const varId = 'ib_agree';
    const block = draftBlock('blk5', 'GoodBinding');
    const def = blockDef(
      'GoodBinding',
      {
        a: {
          label: 'A',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'manyOnly', instanceBinding: { kind: 'create', domainType: 'circle' as any } }),
          }),
        },
      },
      {
        b: {
          label: 'B',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'manyOnly', instanceBinding: { kind: 'create', domainType: 'circle' as any } }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    expect(result.policyDiagnostics).toHaveLength(0);
  });

  it('produces diagnostic when ports declare different create domains', () => {
    const varId = 'ib_domain_card';
    const block = draftBlock('blk6', 'DomainConflict');
    const def = blockDef(
      'DomainConflict',
      {
        a: {
          label: 'A',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'manyOnly', instanceBinding: { kind: 'create', domainType: 'circle' as any } }),
          }),
        },
      },
      {
        b: {
          label: 'B',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'manyOnly', instanceBinding: { kind: 'create', domainType: 'grid' as any } }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    const bindingConflicts = result.policyDiagnostics.filter(
      (d) => d.diagnosticFlagCode === 'ConflictingInstanceBinding',
    );
    expect(bindingConflicts).toHaveLength(1);
    expect(bindingConflicts[0].message).toContain('create(circle)');
    expect(bindingConflicts[0].message).toContain('create(grid)');
  });
});

// =============================================================================
// Both conflicts simultaneously
// =============================================================================

describe('combined policy conflicts', () => {
  it('produces both relation and instanceBinding diagnostics for double conflict', () => {
    const varId = 'double_card';
    const block = draftBlock('blk7', 'DoubleConflict');
    const def = blockDef(
      'DoubleConflict',
      {
        a: {
          label: 'A',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'manyOnly', instanceBinding: 'inherit' }),
          }),
        },
      },
      {
        b: {
          label: 'B',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'manyOnly', instanceBinding: { kind: 'create', domainType: 'grid' as any } }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);
    const result = extractConstraints(graph, registry);

    const relationConflicts = result.policyDiagnostics.filter(
      (d) => d.diagnosticFlagCode === 'ConflictingCardinalityRelation',
    );
    const bindingConflicts = result.policyDiagnostics.filter(
      (d) => d.diagnosticFlagCode === 'ConflictingInstanceBinding',
    );

    expect(relationConflicts).toHaveLength(1);
    expect(bindingConflicts).toHaveLength(1);
  });
});

// =============================================================================
// Determinism
// =============================================================================

describe('diagnostic determinism', () => {
  it('same graph produces same diagnostics', () => {
    const varId = 'det_card';
    const block = draftBlock('blk8', 'DetBlock');
    const def = blockDef(
      'DetBlock',
      {
        a: {
          label: 'A',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'uniform', acceptance: 'oneOrMany' }),
          }),
        },
      },
      {
        b: {
          label: 'B',
          type: inferType(FLOAT, { kind: 'none' }, {
            cardinality: cardVar(varId, { relation: 'promoteToMany', acceptance: 'oneOrMany' }),
          }),
        },
      },
    );

    const registry = new Map<string, BlockDef>([[def.type, def]]);
    const graph = singleBlockGraph(block);

    const r1 = extractConstraints(graph, registry);
    const r2 = extractConstraints(graph, registry);

    expect(r1.policyDiagnostics).toEqual(r2.policyDiagnostics);
  });
});
