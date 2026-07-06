/**
 * TypeOracle — the editor's neutral authority on port types.
 *
 * The editor asks exactly two type questions about the ports in the graph it is
 * showing: "can this output feed that input?" (wiring legality) and "what is this
 * port's type?" (display). Both require reading the era's real type model, so both
 * belong to ONE seam — otherwise every consumer would re-implement the
 * blockId+portId → era-type resolution. Each era supplies a provider that answers
 * in the editor's neutral vocabulary; the UI renders the verdicts and labels
 * without holding a single type opinion, so the drag feedback can never disagree
 * with what that era's compiler accepts. [FRAMING:representation] [LAW:one-source-of-truth]
 *
 * This is the sibling of GraphDataAdapter (what is IN the graph) and BlockCatalog
 * (what could be ADDED): the oracle answers what the graph's ports MEAN. Unlike the
 * catalog (a static registry projection) it reads the live graph, so — like the
 * adapter — a provider wraps the era's store and is constructed per editor mount.
 * [LAW:decomposition]
 */

import type { PortTypeDisplay } from './types';

// =============================================================================
// Neutral vocabulary
// =============================================================================

export type PortDirection = 'input' | 'output';

/** A reference to one port on one block in the graph the editor is showing. */
export interface PortRef {
  readonly blockId: string;
  readonly portId: string;
}

/**
 * The verdict for wiring one OUTPUT port (`source`) to one INPUT port (`target`).
 * A discriminated value, not a bare boolean, so a consumer stays exhaustive and a
 * new outcome forces a decision rather than a silent fall-through.
 * [LAW:types-are-the-program]
 *
 * `allowedViaAdapter` marks a wire that is legal only because an adapter bridges
 * the two types — the drag gate permits it, and a consumer may name the adapter.
 * `rejected` carries a human reason for the same feedback surfaces.
 */
export type ConnectionVerdict =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'allowedViaAdapter'; readonly adapterLabel: string }
  | { readonly kind: 'rejected'; readonly reason: string };

/**
 * Whether a verdict permits the wire (a direct match or an adapter-bridged one).
 * The single place "does this verdict let the wire happen?" is decided, so the
 * drag gate and any future picker read it the same way. [LAW:one-source-of-truth]
 *
 * A positive, exhaustive dispatch — not a `!== 'rejected'` negative check — so a
 * new ConnectionVerdict kind is a compile error here that forces an explicit
 * permit decision, rather than being silently permitted. This is what protects
 * callers that read only `verdictPermits` (the drag gate) and never switch on the
 * verdict themselves. [LAW:types-are-the-program]
 */
export function verdictPermits(verdict: ConnectionVerdict): boolean {
  switch (verdict.kind) {
    case 'allowed':
    case 'allowedViaAdapter':
      return true;
    case 'rejected':
      return false;
    default: {
      const _exhaustive: never = verdict;
      throw new Error(`Unhandled ConnectionVerdict kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// =============================================================================
// TypeOracle interface
// =============================================================================

/**
 * The editor-owned type authority for one graph. A provider resolves each port
 * reference to its era's type internally; the UI passes only neutral ids and reads
 * neutral answers. [LAW:one-way-deps]
 */
export interface TypeOracle {
  /**
   * Can the OUTPUT port `source` feed the INPUT port `target`? The atomic wiring
   * verdict — the sole authority the editor consults for wire legality.
   */
  canConnect(source: PortRef, target: PortRef): ConnectionVerdict;

  /**
   * The port's neutral, presentation-ready type, or `undefined` when the era has
   * no type for it (an unknown port, or an era with no type model). The
   * format-for-display half of the type authority. `direction` disambiguates when
   * an input and an output on the same block share a port id.
   */
  describePort(ref: PortRef, direction: PortDirection): PortTypeDisplay | undefined;
}

// =============================================================================
// Permissive provider
// =============================================================================

/**
 * The oracle for an editor surface that imposes NO wiring constraints and has no
 * type model — today, the composite editor, which edits a subgraph definition
 * before any instance-level type resolution exists. Making "no validation here" an
 * explicit provider value keeps it out of the drag gate as a hidden `if (!types)`
 * branch: the variability lives in which oracle a mount supplies, not in whether
 * the gate runs. [LAW:dataflow-not-control-flow] [LAW:no-silent-failure]
 */
export const permissiveTypeOracle: TypeOracle = {
  canConnect: () => ({ kind: 'allowed' }),
  describePort: () => undefined,
};
