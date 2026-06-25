/**
 * src/pillars/types/solve/adapters.ts
 *
 * Adapter search: "which adapter blocks could bridge a `source` value into a
 * `target` slot?" An adapter is NOT a registry entry and carries NO pattern
 * dialect — it is a regular block marked with a `ZAdapterSpec` whose
 * polymorphism is expressed in its ports' `ZInferenceCanonicalType` variables.
 * So the search is plain iteration over adapter-marked catalog blocks, each
 * attempt a unification run through the wzm3.3 sub-solvers. There is no public
 * `unify(a, b)` API and no separate pattern-matching dialect: the matching
 * primitive is a flat constraint set fed to the solvers, exactly as graph
 * edges will be.
 * [LAW:one-type-per-behavior] [LAW:no-mode-explosion]
 *
 * Pure: a function of (source, target, catalog) only — it computes candidates,
 * it never mutates a graph. Inserting a chosen adapter is the fixpoint child's
 * job (wzm3.5); ranking many candidates for a menu is the query child's
 * (wzm3.6). [LAW:effects-at-boundaries]
 *
 * One unification, not two passes. The ticket frames matching as "unify source
 * against the input field, THEN target against the output field starting from
 * the first substitution." A modifier-style adapter ties its input and output
 * fields by SHARING a variable (e.g. UnitCast's `{P, U_in} → {P, U_out}` shares
 * `P`), so both edges belong in ONE solve: the shared variable lands the four
 * endpoints in one union-find group, and a binding proven on the source side is
 * automatically in force on the target side. Running them as one symmetric solve
 * is what correctly REJECTS an identity-payload passthrough asked to convert
 * float→int — the shared `P` group sees both concretes and conflicts. [LAW:decomposition]
 *
 * Unit polymorphism is expressible only at the TOP LEVEL of a unit
 * (`{kind:'var', var}` = "any unit"), never nested inside a concrete variant
 * (`{kind:'angle', unit: <var>}` = "any angle unit"). The landed schema makes
 * `angle.unit` a closed enum, so a nested unit variable is unrepresentable; the
 * V1 walkthrough §7's nested illustration awaits a schema decision (wzm3.10).
 * Concrete adapters (radians→degrees) need no variable, and a pure passthrough
 * uses a top-level unit var, so the first adapters are unaffected.
 */

import type {
  ZAdapterSpec,
  ZInferenceCanonicalType,
  ZInferenceCardinality,
  ZPayloadType,
  ZPortBinding,
  ZUnitType,
} from '../schemas';
import type { DefinedBlock } from '../../block-api';
import type { Substitution } from './substitution';
import { solvePayloadUnit, type PortVarInfo, type ZPayloadUnitConstraint } from './payload-unit';
import { solveCardinality, type ZCardinalityConstraint } from './cardinality';
import type { ConstraintOrigin, PortKey } from './shared';

/**
 * One way to bridge `source → target`: the adapter block that does it, the
 * single slots it reads/writes, and the substitution that makes its polymorphic
 * ports fit this particular edge. The substitution is the unification's whole
 * answer — the resolver applies it to instantiate the inserted adapter's ports.
 */
export interface AdapterCandidate {
  readonly blockType: string;
  readonly inputSlot: string;
  readonly outputSlot: string;
  readonly substitution: Substitution;
  readonly spec: ZAdapterSpec;
}

// The four endpoints of one unification, as opaque solver port keys.
const SRC: PortKey = 'src';
const IN: PortKey = 'in';
const TGT: PortKey = 'tgt';
const OUT: PortKey = 'out';

/**
 * Every adapter-marked block whose input field unifies with `source` and whose
 * output field unifies with `target`, ranked by `spec.priority` ascending
 * (lower = preferred) with a lexicographic `blockType` tiebreak for total
 * determinism. Blocks without an `adapterSpec` are never considered, even if
 * their ports would structurally unify. [LAW:no-silent-failure]
 *
 * Throws if an adapter-marked block violates the adapter shape invariant
 * (exactly one input slot, one output slot, each carrying exactly one field) —
 * a malformed adapter is a block-definition bug, surfaced loudly rather than
 * silently skipped.
 */
export function findAdapterCandidates(
  source: ZInferenceCanonicalType,
  target: ZInferenceCanonicalType,
  catalog: readonly DefinedBlock[],
): readonly AdapterCandidate[] {
  const candidates: AdapterCandidate[] = [];

  for (const block of catalog) {
    if (block.adapterSpec === undefined) continue;
    const ports = lonePorts(block);
    const substitution = tryUnify(source, ports.inputField, target, ports.outputField, block.type);
    if (substitution === null) continue;
    candidates.push({
      blockType: block.type,
      inputSlot: ports.inputSlot,
      outputSlot: ports.outputSlot,
      substitution,
      spec: block.adapterSpec,
    });
  }

  return candidates.sort(compareCandidates);
}

/**
 * The private unification primitive: build one flat constraint set tying the
 * source to the adapter's input field and the target to its output field, run
 * both sub-solvers, and return the merged substitution — or `null` if either
 * solver reports an error (a mismatch the adapter cannot bridge). Deliberately
 * NOT exported: callers want "find adapters", never a general `unify(a, b)`.
 */
function tryUnify(
  source: ZInferenceCanonicalType,
  inputField: ZInferenceCanonicalType,
  target: ZInferenceCanonicalType,
  outputField: ZInferenceCanonicalType,
  blockType: string,
): Substitution | null {
  const origin: ConstraintOrigin = { kind: 'blockRule', blockId: blockType, rule: 'adapter-unify' };

  // --- payload + unit ---
  const puPorts = new Map<PortKey, PortVarInfo>();
  const puConstraints: ZPayloadUnitConstraint[] = [];
  const register = (port: PortKey, t: ZInferenceCanonicalType): void => {
    puPorts.set(port, varInfo(t));
    if (t.payload.kind !== 'var') {
      const value: ZPayloadType = t.payload;
      puConstraints.push({ kind: 'concretePayload', port, value, origin });
    }
    if (t.unit.kind !== 'var') {
      const value: ZUnitType = t.unit;
      puConstraints.push({ kind: 'concreteUnit', port, value, origin });
    }
  };
  register(SRC, source);
  register(IN, inputField);
  register(TGT, target);
  register(OUT, outputField);
  puConstraints.push(
    { kind: 'payloadEq', a: SRC, b: IN, origin },
    { kind: 'unitEq', a: SRC, b: IN, origin },
    { kind: 'payloadEq', a: TGT, b: OUT, origin },
    { kind: 'unitEq', a: TGT, b: OUT, origin },
  );
  const pu = solvePayloadUnit({ ports: puPorts, constraints: puConstraints });
  if (pu.errors.length > 0) return null;

  // --- cardinality ---
  const cardPorts = new Map<PortKey, ZInferenceCardinality>([
    [SRC, source.extent.cardinality],
    [IN, inputField.extent.cardinality],
    [TGT, target.extent.cardinality],
    [OUT, outputField.extent.cardinality],
  ]);
  const cardConstraints: ZCardinalityConstraint[] = [
    { kind: 'equal', a: SRC, b: IN, origin },
    { kind: 'equal', a: TGT, b: OUT, origin },
  ];
  const card = solveCardinality({ ports: cardPorts, constraints: cardConstraints });
  if (card.errors.length > 0) return null;

  return { payloads: pu.payloads, units: pu.units, cardinalities: card.cardinalities };
}

/**
 * A port's variable identities for the payload/unit solver, built so an absent
 * variable is an absent key (never `{ payloadVar: undefined }`) to satisfy
 * exact-optional typing. A non-variable axis contributes no key here; its
 * concrete value is pinned by a separate `concrete*` constraint.
 */
const varInfo = (t: ZInferenceCanonicalType): PortVarInfo => ({
  ...(t.payload.kind === 'var' ? { payloadVar: t.payload.var } : {}),
  ...(t.unit.kind === 'var' ? { unitVar: t.unit.var } : {}),
});

interface LonePorts {
  readonly inputSlot: string;
  readonly inputField: ZInferenceCanonicalType;
  readonly outputSlot: string;
  readonly outputField: ZInferenceCanonicalType;
}

/** Enforce + extract the one-in/one-out, one-field-each adapter shape. */
function lonePorts(block: DefinedBlock): LonePorts {
  const contract = block.contract;
  if (contract === undefined) {
    throw new Error(
      `Adapter block '${block.type}' has an adapterSpec but no contract; an adapter must declare typed ports.`,
    );
  }
  const [inputSlot, inputField] = loneSlotField(block.type, contract.inputs, 'input');
  const [outputSlot, outputField] = loneSlotField(block.type, contract.outputs, 'output');
  return { inputSlot, inputField, outputSlot, outputField };
}

function loneSlotField(
  blockType: string,
  slots: Readonly<Record<string, ZPortBinding>>,
  dir: 'input' | 'output',
): [string, ZInferenceCanonicalType] {
  const entries = Object.entries(slots);
  if (entries.length !== 1) {
    throw new Error(
      `Adapter block '${blockType}' must have exactly one ${dir} slot, found ${entries.length}.`,
    );
  }
  const [slot, binding] = entries[0];
  const fields = Object.entries(binding.type);
  if (fields.length !== 1) {
    throw new Error(
      `Adapter block '${blockType}' ${dir} slot '${slot}' must carry exactly one field, found ${fields.length}.`,
    );
  }
  return [slot, fields[0][1]];
}

const priorityOf = (spec: ZAdapterSpec): number => spec.priority ?? 0;

const compareCandidates = (a: AdapterCandidate, b: AdapterCandidate): number => {
  const byPriority = priorityOf(a.spec) - priorityOf(b.spec);
  if (byPriority !== 0) return byPriority;
  return a.blockType < b.blockType ? -1 : a.blockType > b.blockType ? 1 : 0;
};
