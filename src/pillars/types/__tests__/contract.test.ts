/**
 * src/pillars/types/__tests__/contract.test.ts
 *
 * The contract layer's load-bearing property is end-to-end TypeScript inference:
 * a block's `lower` sees an `inputBundles` view typed field-by-field from the
 * ports it declared, so reading a declared field compiles and reading an
 * undeclared one is a COMPILE error. The decisive assertion in this file is the
 * `@ts-expect-error` below — it is verified by `tsc --noEmit`, not by the
 * runtime: if the field-level checking ever regresses (inputBundles widening
 * back to a string-indexed record), the directive becomes unused and tsc fails.
 * [LAW:types-are-the-program]
 *
 * The runtime `expect`s pin the data side: `defineBlock` derives port ids and
 * directions, threads `combine`, validates config with one `.safeParse`, and
 * defaults the manifest contribution to empty.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineBlock, type Diagnostic, type LoweredBlock } from '../../block-api';
import {
  ZBlockContractSchema,
  ZPortBindingSchema,
  ZCombineModeSchema,
  zFloat,
  type ZBlockContract,
} from '../schemas';

// A modifier-style fixture: it reads two declared fields off its `primary`
// input and emits them. `lower` is where inference is proven.
const WobbleBlock = defineBlock({
  type: 'TestWobble',
  config: z.object({ amount: z.number() }),
  inputs: {
    primary: { type: { pos_x: zFloat(), pos_y: zFloat() }, combine: 'last' },
  },
  outputs: {
    out: { type: { pos_x: zFloat(), pos_y: zFloat() } },
  },
  lower: (config, ctx): LoweredBlock => {
    // Declared fields — these compile, and each is typed as ExprIR.
    const x = ctx.inputBundles.primary.pos_x;
    const y = ctx.inputBundles.primary.pos_y;

    // The whole point of the contract: an undeclared field does not type-check.
    // @ts-expect-error reading a field the contract did not declare is a compile error
    const missing = ctx.inputBundles.primary.nonExistent;
    void missing;
    void config.amount;

    return { kind: 'bundle', output: { pos_x: x, pos_y: y } };
  },
});

describe('defineBlock — contract derivation', () => {
  it('derives a contract with port ids equal to slot keys and directions by position', () => {
    const contract = WobbleBlock.contract;
    expect(contract).toBeDefined();
    expect(contract?.inputs.primary).toMatchObject({ id: 'primary', dir: 'in' });
    expect(contract?.outputs.out).toMatchObject({ id: 'out', dir: 'out' });
  });

  it('threads combine onto the port and omits it where unset', () => {
    expect(WobbleBlock.contract?.inputs.primary.combine).toBe('last');
    expect(WobbleBlock.contract?.outputs.out.combine).toBeUndefined();
  });

  it('carries the declared bundle fields on the port type', () => {
    expect(Object.keys(WobbleBlock.contract?.inputs.primary.type ?? {})).toEqual([
      'pos_x',
      'pos_y',
    ]);
  });

  it('produces a contract that re-parses through the runtime schema', () => {
    const reparsed = ZBlockContractSchema.safeParse(
      JSON.parse(JSON.stringify(WobbleBlock.contract)),
    );
    expect(reparsed.success).toBe(true);
  });
});

describe('defineBlock — config validation', () => {
  it('returns the parsed config and pushes no diagnostics on valid input', () => {
    const diagnostics: Diagnostic[] = [];
    const config = WobbleBlock.readConfig({ amount: 3 }, diagnostics);
    expect(config).toEqual({ amount: 3 });
    expect(diagnostics).toHaveLength(0);
  });

  it('returns null and pushes a block-tagged diagnostic on invalid input', () => {
    const diagnostics: Diagnostic[] = [];
    const config = WobbleBlock.readConfig({ amount: 'nope' }, diagnostics);
    expect(config).toBeNull();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('[TestWobble]');
    expect(diagnostics[0].message).toContain('config.amount');
  });

  it('feeds the parsed config straight through buildLowerArgs (identity)', () => {
    const config = { amount: 7 };
    expect(WobbleBlock.buildLowerArgs(config, {})).toBe(config);
  });
});

describe('defineBlock — manifest contribution', () => {
  it('defaults to an empty contribution when no manifest builder is given', () => {
    expect(WobbleBlock.buildManifestContribution({ amount: 1 })).toEqual({});
  });

  it('uses a provided manifest builder', () => {
    const block = defineBlock({
      type: 'TestGen',
      config: z.object({ seed: z.number() }),
      inputs: {},
      outputs: { out: { type: { pos_x: zFloat() } } },
      manifest: (config) => ({
        globals: { 'sys:time': { type: 'f32', isDynamic: true, defaultValue: config.seed } },
      }),
      lower: (_config, _ctx): LoweredBlock => ({ kind: 'bundle', output: {} }),
    });
    expect(block.buildManifestContribution({ seed: 4 }).globals?.['sys:time'].defaultValue).toBe(4);
  });
});

describe('contract schemas — runtime validation', () => {
  it('accepts the legal combine modes and rejects others', () => {
    for (const mode of ['first', 'last', 'sum', 'or', 'and']) {
      expect(ZCombineModeSchema.safeParse(mode).success).toBe(true);
    }
    expect(ZCombineModeSchema.safeParse('average').success).toBe(false);
  });

  it('rejects a port binding with an unknown direction', () => {
    const bad = { id: 'p', dir: 'sideways', type: {} };
    expect(ZPortBindingSchema.safeParse(bad).success).toBe(false);
  });

  it('round-trips a hand-built contract through JSON', () => {
    const contract: ZBlockContract = {
      inputs: { primary: { id: 'primary', dir: 'in', type: { v: zFloat() } } },
      outputs: { out: { id: 'out', dir: 'out', type: { v: zFloat() } } },
    };
    const reparsed = ZBlockContractSchema.safeParse(JSON.parse(JSON.stringify(contract)));
    expect(reparsed.success).toBe(true);
  });
});
