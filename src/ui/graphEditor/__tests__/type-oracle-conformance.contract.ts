/**
 * type-oracle-conformance.contract — the TypeOracle contract, stated once, as
 * executable assertions.
 *
 * This file IS the specification of what makes an oracle "editor-usable". Every
 * provider (V1TypeOracle, SceneTypeOracle, the permissive oracle, and any future
 * backend) is checked against this one contract; a behavior this file does not
 * assert is not part of the contract, and a provider that passes every assertion
 * here is presumed drop-in for the editor's wiring gate and type display.
 * [LAW:single-enforcer] [LAW:verifiable-goals]
 *
 * DECOMPOSITION: a `TypeOracleConformanceCase` is the seam of the test. It carries
 * the whole truth a provider must supply to be checkable — the oracle, plus a wire
 * its era is known to permit, a wire its era is known to reject, and a port it is
 * known to type. The `assert*` functions below know only the neutral vocabulary
 * (`TypeOracle` / `ConnectionVerdict` / `PortTypeDisplay`); they never import a
 * store, a registry, or an era-specific type. That is what lets one contract check
 * heterogeneous providers. [LAW:decomposition] [LAW:one-way-deps]
 *
 * The `assert*` functions are also the negative control's instrument: aimed at a
 * deliberately-broken oracle they must throw, proving the suite has teeth rather
 * than vacuously passing.
 */

import { describe, expect, it } from 'vitest';
import {
  verdictPermits,
  type ConnectionVerdict,
  type PortDirection,
  type PortRef,
  type TypeOracle,
} from '../type-oracle';

const VALID_VERDICT_KINDS: readonly ConnectionVerdict['kind'][] = [
  'allowed',
  'allowedViaAdapter',
  'rejected',
];

/** Everything a provider must supply to be run through the conformance contract. */
export interface TypeOracleConformanceCase {
  readonly name: string;
  /** The oracle under test, over a graph the provider has seeded. */
  readonly oracle: TypeOracle;
  /** A wire (output → input) this era is known to permit. */
  readonly permitted: { readonly source: PortRef; readonly target: PortRef };
  /** A wire (output → input) this era is known to reject. */
  readonly rejected: { readonly source: PortRef; readonly target: PortRef };
  /** A port this era is known to carry a type for. */
  readonly knownPort: { readonly ref: PortRef; readonly direction: PortDirection };
}

/** A verdict is always one of the three discriminated shapes, each fully formed. */
function assertVerdictWellFormed(v: ConnectionVerdict, label: string): void {
  expect(VALID_VERDICT_KINDS, `${label}: verdict has a valid kind`).toContain(v.kind);
  if (v.kind === 'allowedViaAdapter') {
    expect(v.adapterLabel.length, `${label}: adapter verdict names its adapter`).toBeGreaterThan(0);
  }
  if (v.kind === 'rejected') {
    expect(v.reason.length, `${label}: rejected verdict carries a reason`).toBeGreaterThan(0);
  }
}

/** The known-good wire is permitted, and the verdict is well formed. */
export function assertPermitsKnownGoodWire(c: TypeOracleConformanceCase): void {
  const v = c.oracle.canConnect(c.permitted.source, c.permitted.target);
  assertVerdictWellFormed(v, `${c.name}: permitted wire`);
  expect(verdictPermits(v), `${c.name}: known-good wire is permitted`).toBe(true);
}

/** The known-bad wire is rejected with a reason, and the verdict is well formed. */
export function assertRejectsKnownBadWire(c: TypeOracleConformanceCase): void {
  const v = c.oracle.canConnect(c.rejected.source, c.rejected.target);
  assertVerdictWellFormed(v, `${c.name}: rejected wire`);
  expect(verdictPermits(v), `${c.name}: known-bad wire is not permitted`).toBe(false);
}

/** A known port describes to a fully-formed, presentation-ready type. */
export function assertDescribesKnownPort(c: TypeOracleConformanceCase): void {
  const display = c.oracle.describePort(c.knownPort.ref, c.knownPort.direction);
  expect(display, `${c.name}: known port has a type display`).toBeDefined();
  if (!display) return;
  expect(display.label.length, `${c.name}: type display label`).toBeGreaterThan(0);
  expect(display.tooltip.length, `${c.name}: type display tooltip`).toBeGreaterThan(0);
  expect(display.color.length, `${c.name}: type display color`).toBeGreaterThan(0);
  expect(
    display.compatibilityToken.length,
    `${c.name}: type display compatibility token`,
  ).toBeGreaterThan(0);
}

/** An unknown port has no type — the oracle reports absence, never invents one. */
export function assertUndefinedForUnknownPort(c: TypeOracleConformanceCase): void {
  const display = c.oracle.describePort(
    { blockId: '__no_such_block__', portId: '__no_such_port__' },
    'input',
  );
  expect(display, `${c.name}: unknown port has no type display`).toBeUndefined();
}

/**
 * Register the whole contract against one provider. A future backend is drop-in
 * verifiable: build a TypeOracleConformanceCase for it and call this.
 */
export function runTypeOracleConformanceSuite(c: TypeOracleConformanceCase): void {
  describe(`TypeOracle conformance: ${c.name}`, () => {
    it('permits a known-good wire', () => assertPermitsKnownGoodWire(c));
    it('rejects a known-bad wire', () => assertRejectsKnownBadWire(c));
    it('describes a known port', () => assertDescribesKnownPort(c));
    it('reports no type for an unknown port', () => assertUndefinedForUnknownPort(c));
  });
}
