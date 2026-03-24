import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph/Patch';
import { compile } from '../compile';
import { requireInst } from '../../core/canonical-types';
import type { ValueExpr } from '../ir/value-expr';

function cardKind(expr: ValueExpr): 'zero' | 'one' | 'many' {
  return requireInst(expr.type.extent.cardinality, 'cardinality').kind;
}

describe('ValueExpr cardinality invariants', () => {
  it.todo('kernel/map/zip cardinality field invariant test requires instance pipeline (layout blocks removed)');
});
