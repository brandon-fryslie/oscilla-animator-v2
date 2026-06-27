/**
 * src/pillars/types/solve/payload-unit.ts
 *
 * The payload + unit sub-solver. Two independent union-finds — one over
 * payloads, one over units — resolve every port's payload and unit from a flat
 * constraint set. The primitive is `constraint set → resolution`, never a
 * pairwise `unify(a, b)`: union-find IS the matching mechanism, so ports that
 * share a variable land in one group without any explicit equality between them.
 * [LAW:decomposition]
 *
 * Payload and unit differ in exactly one rule, captured as the per-UF `merge`
 * callback: two distinct concrete payloads conflict (strict), but `none` is a
 * unit bottom that merges with anything (an unannotated port adopts its
 * neighbour's unit). That single difference is why one generic `UnionFind<T>`
 * serves both. [LAW:one-type-per-behavior]
 *
 * Pure: same constraints in, same result out, no input mutated. [LAW:effects-at-boundaries]
 */

import type {
  PayloadVarId,
  UnitVarId,
  ZInferenceCanonicalType,
  ZPayloadType,
  ZUnitType,
} from '../schemas';
import type { ConstraintOrigin, PortKey, SolveDiagnostic } from './shared';

// ---------------------------------------------------------------------------
// Constraints — the flat input vocabulary
// ---------------------------------------------------------------------------

/**
 * Z-prefixed to keep `grep ZPayloadUnitConstraint` finding only this system and
 * `grep PayloadUnitConstraint` finding only V1 — the two solvers' constraint
 * vocabularies must never be confused at a callsite. Six kinds: two equalities
 * (share a group), two concretes (pin a value), and two requirements (narrow a
 * group's legal set). [LAW:types-are-the-program]
 */
export type ZPayloadUnitConstraint =
  | { readonly kind: 'payloadEq'; readonly a: PortKey; readonly b: PortKey; readonly origin: ConstraintOrigin }
  | { readonly kind: 'unitEq'; readonly a: PortKey; readonly b: PortKey; readonly origin: ConstraintOrigin }
  | { readonly kind: 'concretePayload'; readonly port: PortKey; readonly value: ZPayloadType; readonly origin: ConstraintOrigin }
  | { readonly kind: 'concreteUnit'; readonly port: PortKey; readonly value: ZUnitType; readonly origin: ConstraintOrigin }
  | { readonly kind: 'requirePayloadIn'; readonly port: PortKey; readonly allowed: readonly ZPayloadType[]; readonly origin: ConstraintOrigin }
  | { readonly kind: 'requireUnitless'; readonly port: PortKey; readonly origin: ConstraintOrigin };

/**
 * The per-port variable identities the solver groups by. A port with a payload
 * variable shares its payload node with every other port carrying that variable;
 * a port without one gets a private node. Every port the solver should resolve
 * must appear here, variable or not — finalization iterates these keys.
 */
export interface PortVarInfo {
  readonly payloadVar?: PayloadVarId;
  readonly unitVar?: UnitVarId;
}

/**
 * The solver owns this projection so absent variables stay absent keys under
 * exact-optional typing. [LAW:one-source-of-truth]
 */
export const portVarInfoOf = (t: ZInferenceCanonicalType): PortVarInfo => ({
  ...(t.payload.kind === 'var' ? { payloadVar: t.payload.var } : {}),
  ...(t.unit.kind === 'var' ? { unitVar: t.unit.var } : {}),
});

/**
 * A post-solve safety net: after union-find settles, re-check that the two ends
 * of an edge actually agree. Catches a constraint that was dropped or never
 * emitted — a mismatch surfaces as a diagnostic rather than silently shipping an
 * ill-typed edge. The pillar has no `collect` ports, so an edge verification is
 * one shape: source must agree with target. [LAW:no-silent-failure]
 */
export interface EdgeVerification {
  readonly edgeId: string;
  readonly from: PortKey;
  readonly to: PortKey;
}

export interface PayloadUnitSolveInput {
  readonly ports: ReadonlyMap<PortKey, PortVarInfo>;
  readonly constraints: readonly ZPayloadUnitConstraint[];
  readonly edgeVerifications?: readonly EdgeVerification[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type PayloadUnitErrorKind =
  | 'ConflictingPayloads'
  | 'ConflictingUnits'
  | 'PayloadNotInAllowedSet'
  | 'UnitlessMismatch'
  | 'EmptyAllowedSet'
  | 'UnresolvedPayload'
  | 'UnresolvedUnit';

/**
 * Who is at fault, derived solely from the origins that fed the failing group.
 * The classification is the seam to diagnostics: `UserPatchTypeError` is shown
 * to the user as "you wired this wrong", `BlockDefTooSpecific` as "this block's
 * declaration is over-constrained". [FRAMING:representation]
 */
export type PayloadUnitErrorClass = 'UserPatchTypeError' | 'BlockDefTooSpecific' | 'Unresolved';

export interface PayloadUnitSolveError {
  readonly kind: PayloadUnitErrorKind;
  readonly errorClass: PayloadUnitErrorClass;
  readonly message: string;
  readonly ports: readonly PortKey[];
  readonly origins: readonly ConstraintOrigin[];
}

export interface PayloadUnitSolveResult {
  /** var id → resolved payload (shared across every port carrying the var). */
  readonly payloads: ReadonlyMap<PayloadVarId, ZPayloadType>;
  readonly units: ReadonlyMap<UnitVarId, ZUnitType>;
  /** per-port resolution, present for concrete ports too (they carry no var). */
  readonly portPayloads: ReadonlyMap<PortKey, ZPayloadType>;
  readonly portUnits: ReadonlyMap<PortKey, ZUnitType>;
  readonly errors: readonly PayloadUnitSolveError[];
  readonly diagnostics: readonly SolveDiagnostic[];
}

// ---------------------------------------------------------------------------
// UnionFind<T> — tagged parent/value nodes with path compression
// ---------------------------------------------------------------------------

/**
 * A node is either a link toward its parent (the self-link is an unresolved
 * root) or a resolved value (a root holding a concrete payload/unit). The value
 * lives in the node entry itself rather than a side table, so a value root is
 * terminal. `merge` decides what happens when two values meet: `null` means
 * conflict, any value means "these are compatible, here is the combined one".
 * Keeping the domain rule in a callback is what lets one structure serve both
 * payload (strict) and unit (none-as-bottom). [LAW:decomposition]
 */
type UFEntry<T> = { readonly tag: 'link'; readonly to: string } | { readonly tag: 'value'; readonly value: T };

export type UnionConflict<T> = { readonly conflict: readonly [T, T] };
export type UnionOk = { readonly winner: string; readonly loser: string | null };

export class UnionFind<T> {
  private readonly entries = new Map<string, UFEntry<T>>();

  constructor(private readonly merge: (a: T, b: T) => T | null) {}

  private ensure(id: string): void {
    if (!this.entries.has(id)) this.entries.set(id, { tag: 'link', to: id });
  }

  /**
   * The canonical node id for `id`'s group: the node physically holding the
   * value, or the self-linked root. Path-compresses every link walked so repeat
   * lookups stay flat. Returns a node id (not the value) because per-group
   * metadata is keyed by this id outside the structure.
   */
  findRoot(id: string): string {
    this.ensure(id);
    const walked: string[] = [];
    let cur = id;
    for (;;) {
      const entry = this.entries.get(cur)!;
      if (entry.tag === 'value' || entry.to === cur) break;
      walked.push(cur);
      cur = entry.to;
    }
    for (const node of walked) this.entries.set(node, { tag: 'link', to: cur });
    return cur;
  }

  resolved(id: string): T | null {
    const entry = this.entries.get(this.findRoot(id))!;
    return entry.tag === 'value' ? entry.value : null;
  }

  /** Pin `id`'s group to a concrete value, merging with any existing one. */
  assign(id: string, value: T): UnionConflict<T> | null {
    const root = this.findRoot(id);
    const entry = this.entries.get(root)!;
    if (entry.tag === 'value') {
      const merged = this.merge(entry.value, value);
      if (merged === null) return { conflict: [entry.value, value] };
      this.entries.set(root, { tag: 'value', value: merged });
      return null;
    }
    this.entries.set(root, { tag: 'value', value });
    return null;
  }

  /**
   * Unite two groups. A value-bearing root wins so the value survives; when both
   * carry values they are merged (or conflict). When neither does, the
   * lexicographically smaller id wins, making output order deterministic. The
   * loser id is returned so the caller can re-home its per-group metadata onto
   * the winner. [LAW:no-ambient-temporal-coupling]
   */
  union(a: string, b: string): UnionOk | UnionConflict<T> {
    const rootA = this.findRoot(a);
    const rootB = this.findRoot(b);
    if (rootA === rootB) return { winner: rootA, loser: null };

    const entryA = this.entries.get(rootA)!;
    const entryB = this.entries.get(rootB)!;

    if (entryA.tag === 'value' && entryB.tag === 'value') {
      const merged = this.merge(entryA.value, entryB.value);
      if (merged === null) return { conflict: [entryA.value, entryB.value] };
      this.entries.set(rootB, { tag: 'link', to: rootA });
      this.entries.set(rootA, { tag: 'value', value: merged });
      return { winner: rootA, loser: rootB };
    }
    if (entryA.tag === 'value') {
      this.entries.set(rootB, { tag: 'link', to: rootA });
      return { winner: rootA, loser: rootB };
    }
    if (entryB.tag === 'value') {
      this.entries.set(rootA, { tag: 'link', to: rootB });
      return { winner: rootB, loser: rootA };
    }
    const [winner, loser] = rootA < rootB ? [rootA, rootB] : [rootB, rootA];
    this.entries.set(loser, { tag: 'link', to: winner });
    return { winner, loser };
  }
}

// ---------------------------------------------------------------------------
// Value equality / merge rules — the one place payload and unit differ
// ---------------------------------------------------------------------------

/** Every payload member is discriminated solely by `kind`, so kind equality is full equality. */
const payloadEquals = (a: ZPayloadType, b: ZPayloadType): boolean => a.kind === b.kind;

const unitEquals = (a: ZUnitType, b: ZUnitType): boolean => {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'angle':
      return a.unit === (b as Extract<ZUnitType, { kind: 'angle' }>).unit;
    case 'time':
      return a.unit === (b as Extract<ZUnitType, { kind: 'time' }>).unit;
    case 'color':
      return a.unit === (b as Extract<ZUnitType, { kind: 'color' }>).unit;
    case 'space': {
      const other = b as Extract<ZUnitType, { kind: 'space' }>;
      return a.space === other.space && a.dims === other.dims;
    }
    default:
      return true; // none | count — discriminated by kind alone
  }
};

const payloadMerge = (a: ZPayloadType, b: ZPayloadType): ZPayloadType | null =>
  payloadEquals(a, b) ? a : null;

/** `none` is the unit bottom: it merges into any concrete unit. Two distinct concretes conflict. */
const unitMerge = (a: ZUnitType, b: ZUnitType): ZUnitType | null => {
  if (unitEquals(a, b)) return a;
  if (a.kind === 'none') return b;
  if (b.kind === 'none') return a;
  return null;
};

const intersectAllowed = (
  current: readonly ZPayloadType[],
  incoming: readonly ZPayloadType[],
): ZPayloadType[] => current.filter((c) => incoming.some((i) => payloadEquals(c, i)));

// ---------------------------------------------------------------------------
// Per-group metadata
// ---------------------------------------------------------------------------

interface PayloadGroupMeta {
  /** null = unconstrained; otherwise the running intersection of allowed sets. */
  allowedPayloads: readonly ZPayloadType[] | null;
  allowedOrigins: ConstraintOrigin[];
}

interface UnitGroupMeta {
  mustBeUnitless: boolean;
  unitlessOrigins: ConstraintOrigin[];
}

// ---------------------------------------------------------------------------
// Node id scheme — a port's payload/unit node is shared iff it carries that var
// ---------------------------------------------------------------------------

const payloadNode = (port: PortKey, info: PortVarInfo): string =>
  info.payloadVar !== undefined ? `pv:${info.payloadVar}` : `pp:${port}`;

const unitNode = (port: PortKey, info: PortVarInfo): string =>
  info.unitVar !== undefined ? `uv:${info.unitVar}` : `up:${port}`;

const classifyError = (origins: readonly ConstraintOrigin[]): PayloadUnitErrorClass => {
  if (origins.some((o) => o.kind === 'edge')) return 'UserPatchTypeError';
  if (origins.some((o) => o.kind === 'payloadMetadata')) return 'BlockDefTooSpecific';
  return 'Unresolved';
};

// ---------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------

export function solvePayloadUnit(input: PayloadUnitSolveInput): PayloadUnitSolveResult {
  const { ports, constraints, edgeVerifications = [] } = input;

  const payloadUF = new UnionFind<ZPayloadType>(payloadMerge);
  const unitUF = new UnionFind<ZUnitType>(unitMerge);
  const payloadMeta = new Map<string, PayloadGroupMeta>();
  const unitMeta = new Map<string, UnitGroupMeta>();

  const errors: PayloadUnitSolveError[] = [];
  const diagnostics: SolveDiagnostic[] = [];

  // Every port becomes a node so finalization can visit it even with no constraint.
  for (const [port, info] of ports) {
    payloadUF.findRoot(payloadNode(port, info));
    unitUF.findRoot(unitNode(port, info));
  }

  const nodeOfPayload = (port: PortKey): string | null => {
    const info = ports.get(port);
    return info ? payloadNode(port, info) : null;
  };
  const nodeOfUnit = (port: PortKey): string | null => {
    const info = ports.get(port);
    return info ? unitNode(port, info) : null;
  };

  const payloadMetaFor = (node: string): PayloadGroupMeta => {
    const root = payloadUF.findRoot(node);
    let meta = payloadMeta.get(root);
    if (!meta) {
      meta = { allowedPayloads: null, allowedOrigins: [] };
      payloadMeta.set(root, meta);
    }
    return meta;
  };
  const unitMetaFor = (node: string): UnitGroupMeta => {
    const root = unitUF.findRoot(node);
    let meta = unitMeta.get(root);
    if (!meta) {
      meta = { mustBeUnitless: false, unitlessOrigins: [] };
      unitMeta.set(root, meta);
    }
    return meta;
  };

  const pushUnresolvedPort = (kind: 'UnresolvedPayload' | 'UnresolvedUnit', port: PortKey, origin: ConstraintOrigin): void => {
    errors.push({
      kind,
      errorClass: classifyError([origin]),
      message: `Port ${port} referenced by a constraint is not registered`,
      ports: [port],
      origins: [origin],
    });
  };

  // --- Phase 1: process constraints in order -------------------------------
  for (const c of constraints) {
    switch (c.kind) {
      case 'concretePayload': {
        const node = nodeOfPayload(c.port);
        if (node === null) { pushUnresolvedPort('UnresolvedPayload', c.port, c.origin); break; }
        const conflict = payloadUF.assign(node, c.value);
        if (conflict) {
          errors.push({
            kind: 'ConflictingPayloads',
            errorClass: classifyError([c.origin]),
            message: `Conflicting payloads: ${conflict.conflict[0].kind} vs ${conflict.conflict[1].kind}`,
            ports: [c.port],
            origins: [c.origin],
          });
        }
        break;
      }
      case 'concreteUnit': {
        const node = nodeOfUnit(c.port);
        if (node === null) { pushUnresolvedPort('UnresolvedUnit', c.port, c.origin); break; }
        const conflict = unitUF.assign(node, c.value);
        if (conflict) {
          errors.push({
            kind: 'ConflictingUnits',
            errorClass: classifyError([c.origin]),
            message: `Conflicting units: ${conflict.conflict[0].kind} vs ${conflict.conflict[1].kind}`,
            ports: [c.port],
            origins: [c.origin],
          });
        }
        break;
      }
      case 'payloadEq': {
        const a = nodeOfPayload(c.a);
        const b = nodeOfPayload(c.b);
        if (a === null) { pushUnresolvedPort('UnresolvedPayload', c.a, c.origin); break; }
        if (b === null) { pushUnresolvedPort('UnresolvedPayload', c.b, c.origin); break; }
        mergePayloadGroups(payloadUF, payloadMeta, payloadMetaFor, a, b, c.origin, errors, [c.a, c.b]);
        break;
      }
      case 'unitEq': {
        const a = nodeOfUnit(c.a);
        const b = nodeOfUnit(c.b);
        if (a === null) { pushUnresolvedPort('UnresolvedUnit', c.a, c.origin); break; }
        if (b === null) { pushUnresolvedPort('UnresolvedUnit', c.b, c.origin); break; }
        mergeUnitGroups(unitUF, unitMeta, unitMetaFor, a, b, c.origin, errors, [c.a, c.b]);
        break;
      }
      case 'requirePayloadIn': {
        const node = nodeOfPayload(c.port);
        if (node === null) { pushUnresolvedPort('UnresolvedPayload', c.port, c.origin); break; }
        const meta = payloadMetaFor(node);
        meta.allowedPayloads =
          meta.allowedPayloads === null ? [...c.allowed] : intersectAllowed(meta.allowedPayloads, c.allowed);
        meta.allowedOrigins.push(c.origin);
        break;
      }
      case 'requireUnitless': {
        const node = nodeOfUnit(c.port);
        if (node === null) { pushUnresolvedPort('UnresolvedUnit', c.port, c.origin); break; }
        const meta = unitMetaFor(node);
        meta.mustBeUnitless = true;
        meta.unitlessOrigins.push(c.origin);
        break;
      }
    }
  }

  // --- Phase 2: finalization + validation ----------------------------------
  const payloads = new Map<PayloadVarId, ZPayloadType>();
  const units = new Map<UnitVarId, ZUnitType>();
  const portPayloads = new Map<PortKey, ZPayloadType>();
  const portUnits = new Map<PortKey, ZUnitType>();
  const validatedPayloadRoots = new Set<string>();
  const validatedUnitRoots = new Set<string>();

  for (const [port, info] of ports) {
    // -- Payload --
    const pNode = payloadNode(port, info);
    const pRoot = payloadUF.findRoot(pNode);
    let payload = payloadUF.resolved(pNode);
    const pMeta = payloadMeta.get(pRoot);

    if (payload === null && pMeta?.allowedPayloads) {
      if (pMeta.allowedPayloads.length === 1) {
        payload = pMeta.allowedPayloads[0];
        payloadUF.assign(pNode, payload);
      } else if (pMeta.allowedPayloads.length === 0 && !validatedPayloadRoots.has(pRoot)) {
        validatedPayloadRoots.add(pRoot);
        errors.push({
          kind: 'EmptyAllowedSet',
          errorClass: classifyError(pMeta.allowedOrigins),
          message: 'No payload type satisfies every constraint on this group',
          ports: [port],
          origins: pMeta.allowedOrigins,
        });
      }
    }

    if (payload !== null) {
      if (!validatedPayloadRoots.has(pRoot)) {
        validatedPayloadRoots.add(pRoot);
        if (pMeta?.allowedPayloads && pMeta.allowedPayloads.length > 0 && !pMeta.allowedPayloads.some((a) => payloadEquals(a, payload!))) {
          errors.push({
            kind: 'PayloadNotInAllowedSet',
            errorClass: classifyError(pMeta.allowedOrigins),
            message: `Resolved payload ${payload.kind} is outside the allowed set {${pMeta.allowedPayloads.map((a) => a.kind).join(', ')}}`,
            ports: [port],
            origins: pMeta.allowedOrigins,
          });
        }
      }
      portPayloads.set(port, payload);
      if (info.payloadVar !== undefined) payloads.set(info.payloadVar, payload);
    }

    // -- Unit --
    const uNode = unitNode(port, info);
    const uRoot = unitUF.findRoot(uNode);
    let unit = unitUF.resolved(uNode);
    const uMeta = unitMeta.get(uRoot);

    if (unit === null && uMeta?.mustBeUnitless) {
      unit = { kind: 'none' };
      unitUF.assign(uNode, unit);
    }
    if (unit === null && info.unitVar !== undefined) {
      // A unit variable with no concrete evidence is treated as unitless — the
      // common case of a polymorphic numeric chain. The decision is announced,
      // never silent. [LAW:no-silent-failure]
      unit = { kind: 'none' };
      unitUF.assign(uNode, unit);
      if (!validatedUnitRoots.has(uRoot)) {
        validatedUnitRoots.add(uRoot);
        diagnostics.push({
          code: 'UnitDefaultedToNone',
          message: 'Unit variable defaulted to unitless (no concrete unit evidence)',
          ports: [port],
          origins: [],
          stableKey: `UnitDefaultedToNone:${uRoot}`,
        });
      }
    }
    if (unit !== null) {
      if (!validatedUnitRoots.has(uRoot)) {
        validatedUnitRoots.add(uRoot);
        if (uMeta?.mustBeUnitless && unit.kind !== 'none') {
          errors.push({
            kind: 'UnitlessMismatch',
            errorClass: classifyError(uMeta.unitlessOrigins),
            message: `Unit ${unit.kind} where a unitless value is required`,
            ports: [port],
            origins: uMeta.unitlessOrigins,
          });
        }
      }
      portUnits.set(port, unit);
      if (info.unitVar !== undefined) units.set(info.unitVar, unit);
    }
  }

  // --- Phase 3: post-solve edge verification (safety net) ------------------
  for (const ev of edgeVerifications) {
    const fromPayload = portPayloads.get(ev.from);
    const fromUnit = portUnits.get(ev.from);
    const toPayload = portPayloads.get(ev.to);
    const toUnit = portUnits.get(ev.to);
    if (fromPayload === undefined || fromUnit === undefined || toPayload === undefined || toUnit === undefined) continue;

    const payloadOk = payloadEquals(fromPayload, toPayload);
    const unitOk = unitMerge(fromUnit, toUnit) !== null;
    if (payloadOk && unitOk) continue;

    diagnostics.push({
      code: 'PostSolveEdgeTypeMismatch',
      message: `Edge ${ev.edgeId}: ${fromPayload.kind}/${fromUnit.kind} is incompatible with ${toPayload.kind}/${toUnit.kind}`,
      ports: [ev.from, ev.to],
      origins: [{ kind: 'edge', edgeId: ev.edgeId }],
      stableKey: `PostSolveEdgeTypeMismatch:${ev.edgeId}`,
    });
  }

  return { payloads, units, portPayloads, portUnits, errors, diagnostics };
}

/**
 * Capture both groups' metadata before the union, then re-home the loser's meta
 * onto the winner: allowed sets intersect, unitless flags OR, origins concat.
 * Metadata is keyed by root, and union changes the root, so the merge must
 * happen here — the moment we know winner and loser. [LAW:one-source-of-truth]
 */
function mergePayloadGroups(
  uf: UnionFind<ZPayloadType>,
  metaMap: Map<string, PayloadGroupMeta>,
  metaFor: (node: string) => PayloadGroupMeta,
  a: string,
  b: string,
  origin: ConstraintOrigin,
  errors: PayloadUnitSolveError[],
  ports: readonly PortKey[],
): void {
  const rootABefore = uf.findRoot(a);
  const metaA = metaFor(a);
  const metaB = metaFor(b);
  const result = uf.union(a, b);
  if ('conflict' in result) {
    errors.push({
      kind: 'ConflictingPayloads',
      errorClass: classifyError([origin]),
      message: `Conflicting payloads: ${result.conflict[0].kind} vs ${result.conflict[1].kind}`,
      ports,
      origins: [origin],
    });
    return;
  }
  if (result.loser === null) return;
  // The value-bearing side wins regardless of id order, so the winner may be b's
  // group; compare against the root captured before the union, not after.
  const winnerMeta = result.winner === rootABefore ? metaA : metaB;
  const loserMeta = winnerMeta === metaA ? metaB : metaA;
  metaMap.delete(result.loser);
  if (loserMeta.allowedPayloads) {
    winnerMeta.allowedPayloads =
      winnerMeta.allowedPayloads === null
        ? [...loserMeta.allowedPayloads]
        : intersectAllowed(winnerMeta.allowedPayloads, loserMeta.allowedPayloads);
  }
  winnerMeta.allowedOrigins.push(...loserMeta.allowedOrigins);
  metaMap.set(result.winner, winnerMeta);
}

function mergeUnitGroups(
  uf: UnionFind<ZUnitType>,
  metaMap: Map<string, UnitGroupMeta>,
  metaFor: (node: string) => UnitGroupMeta,
  a: string,
  b: string,
  origin: ConstraintOrigin,
  errors: PayloadUnitSolveError[],
  ports: readonly PortKey[],
): void {
  const rootABefore = uf.findRoot(a);
  const metaA = metaFor(a);
  const metaB = metaFor(b);
  const result = uf.union(a, b);
  if ('conflict' in result) {
    errors.push({
      kind: 'ConflictingUnits',
      errorClass: classifyError([origin]),
      message: `Conflicting units: ${result.conflict[0].kind} vs ${result.conflict[1].kind}`,
      ports,
      origins: [origin],
    });
    return;
  }
  if (result.loser === null) return;
  const winnerMeta = result.winner === rootABefore ? metaA : metaB;
  const loserMeta = winnerMeta === metaA ? metaB : metaA;
  metaMap.delete(result.loser);
  winnerMeta.mustBeUnitless = winnerMeta.mustBeUnitless || loserMeta.mustBeUnitless;
  winnerMeta.unitlessOrigins.push(...loserMeta.unitlessOrigins);
  metaMap.set(result.winner, winnerMeta);
}
