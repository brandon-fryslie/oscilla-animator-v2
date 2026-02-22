import { describe, expect, it } from 'vitest';
import { canonicalScalar, FLOAT } from '../../core/canonical-types';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { SCALAR_INSTANCE_ID, type ValueExprId } from '../../compiler/ir/Indices';
import type { TopologyId } from '../../shapes/types';
import { createRuntimeState } from '../RuntimeState';
import { materializeValueExpr, type ValueExprTable } from '../ValueExprMaterializer';

describe('ValueExprMaterializer shapeRef handling', () => {
  it('throws when shapeRef is routed through numeric materialization', () => {
    const state = createRuntimeState(32, 32, 1);

    const table: ValueExprTable = {
      nodes: [{
        kind: 'shapeRef',
        type: canonicalScalar(FLOAT),
        topologyId: 0 as unknown as TopologyId,
        paramArgs: [],
      }],
    };

    expect(() =>
      materializeValueExpr(
        0 as ValueExprId,
        table,
        SCALAR_INSTANCE_ID,
        1,
        state,
        {} as CompiledProgramIR,
      )
    ).toThrow(/Cannot materialize shapeRef as numeric field data/);
  });
});
