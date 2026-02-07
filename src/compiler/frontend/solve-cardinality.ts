/**
 * Cardinality Constraint Solver (Sprint 2)
 *
 * Resolves cardinality variables to concrete CardinalityValue via union-find.
 *
 * Key insight: zipBroadcast ports must NOT be eagerly unioned in Phase 1.
 * They are kept as independent UF nodes. In Phase 3, edges involving zip
 * members attempt union — compatible edges (many-many) succeed and propagate
 * instance refs, while one-vs-many conflicts are suppressed (broadcast case).
 * Phase 4 then upgrades placeholder many values to concrete refs.
 *
 * Critical: Phase 4 must NOT commit pendingOne (card=one) to a UF root that
 * is shared with a zip OUTPUT port from another block. That output port needs
 * card=many, and poisoning the shared root with 'one' would prevent it.
 */

import type { BlockIndex } from '../ir/patches';
import type { CanonicalType, Cardinality, CardinalityValue } from '../../core/canonical-types';
import { isAxisInst, cardinalityOne, cardinalityMany } from '../../core/canonical-types';
import type { CardinalityVarId } from '../../core/ids';
import type { PortKey } from './analyze-type-constraints';

// =============================================================================
// Constraint Types
// =============================================================================

export type CardinalityConstraint =
  | { readonly kind: 'equal'; readonly varId: CardinalityVarId; readonly ports: readonly PortKey[] }
  | { readonly kind: 'fixed'; readonly port: PortKey; readonly value: CardinalityValue }
  | { readonly kind: 'zipBroadcast'; readonly varId: CardinalityVarId; readonly ports: readonly PortKey[] };

// =============================================================================
// Union-Find for Cardinality
// =============================================================================

type UFNodeId = string & { readonly __brand: 'CardinalityUFNodeId' };
function ufNodeId(s: string): UFNodeId { return s as UFNodeId; }

class CardinalityUnionFind {
  private parent = new Map<UFNodeId, UFNodeId>();
  private value = new Map<UFNodeId, CardinalityValue>();

  ensure(id: UFNodeId): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: UFNodeId): UFNodeId {
    this.ensure(id);
    const p = this.parent.get(id)!;
    if (p === id) return id;
    const root = this.find(p);
    this.parent.set(id, root);
    return root;
  }

  assign(id: UFNodeId, val: CardinalityValue): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const root = this.find(id);
    const existing = this.value.get(root);
    if (existing !== undefined) {
      if (cardinalitiesEqual(existing, val)) {
        this.value.set(root, preferConcreteCardinality(existing, val));
        return { ok: true };
      }
      return { ok: false, conflict: [existing, val] };
    }
    this.value.set(root, val);
    return { ok: true };
  }

  union(a: UFNodeId, b: UFNodeId): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return { ok: true };

    const valA = this.value.get(rootA);
    const valB = this.value.get(rootB);

    if (valA !== undefined && valB !== undefined) {
      if (!cardinalitiesEqual(valA, valB)) {
        return { ok: false, conflict: [valA, valB] };
      }
      const preferred = preferConcreteCardinality(valA, valB);
      this.parent.set(rootB, rootA);
      this.value.set(rootA, preferred);
      this.value.delete(rootB);
      return { ok: true };
    }

    if (valA !== undefined) {
      this.parent.set(rootB, rootA);
      return { ok: true };
    }
    if (valB !== undefined) {
      this.parent.set(rootA, rootB);
      return { ok: true };
    }
    this.parent.set(rootA, rootB);
    return { ok: true };
  }

  resolved(id: UFNodeId): CardinalityValue | null {
    const root = this.find(id);
    return this.value.get(root) ?? null;
  }

  dumpGroups(): Array<{ root: UFNodeId; members: UFNodeId[]; value: CardinalityValue | null }> {
    const groups = new Map<UFNodeId, UFNodeId[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      let arr = groups.get(root);
      if (!arr) { arr = []; groups.set(root, arr); }
      arr.push(id);
    }
    const result: Array<{ root: UFNodeId; members: UFNodeId[]; value: CardinalityValue | null }> = [];
    for (const [root, members] of groups) {
      result.push({ root, members, value: this.value.get(root) ?? null });
    }
    return result;
  }
}

// =============================================================================
// Equality helpers
// =============================================================================

function isPlaceholderInstance(val: CardinalityValue): boolean {
  if (val.kind !== 'many') return false;
  return val.instance.domainTypeId === 'default' && val.instance.instanceId === 'default';
}

function cardinalitiesEqual(a: CardinalityValue, b: CardinalityValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'many' && b.kind === 'many') {
    if (isPlaceholderInstance(a) || isPlaceholderInstance(b)) return true;
    return a.instance.domainTypeId === b.instance.domainTypeId && a.instance.instanceId === b.instance.instanceId;
  }
  return true;
}

function preferConcreteCardinality(a: CardinalityValue, b: CardinalityValue): CardinalityValue {
  if (a.kind === 'many' && b.kind === 'many') {
    if (isPlaceholderInstance(a) && !isPlaceholderInstance(b)) return b;
    if (!isPlaceholderInstance(a) && isPlaceholderInstance(b)) return a;
  }
  return a;
}

// =============================================================================
// Trace formatting helpers
// =============================================================================

function fmtCard(val: CardinalityValue | null): string {
  if (!val) return '<unresolved>';
  if (val.kind === 'one') return 'one';
  if (val.kind === 'zero') return 'zero';
  if (val.kind === 'many') {
    if (isPlaceholderInstance(val)) return 'many(placeholder)';
    return `many(${val.instance.domainTypeId}:${val.instance.instanceId})`;
  }
  return JSON.stringify(val);
}

function fmtNode(id: string, blockName?: (index: BlockIndex) => string): string {
  if (id.startsWith('port:')) {
    const portKey = id.slice(5) as PortKey;
    return formatPort(portKey, blockName);
  }
  return id;
}

function traceUFDump(label: string, uf: CardinalityUnionFind, blockName?: (index: BlockIndex) => string): void {
  const groups = uf.dumpGroups();
  console.log(`  [UF Dump] ${label} (${groups.length} groups)`);
  for (const g of groups) {
    const members = g.members.map(m => fmtNode(m, blockName)).join(', ');
    console.log(`    root=${fmtNode(g.root, blockName)}  val=${fmtCard(g.value)}  members=[${members}]`);
  }
}

// =============================================================================
// Error Types
// =============================================================================

export interface CardinalityConstraintError {
  readonly kind: 'CardinalityConflict' | 'UnresolvedCardinality' | 'InvalidZipBroadcast';
  readonly port: PortKey;
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly message: string;
  readonly details?: {
    readonly conflict?: [CardinalityValue, CardinalityValue];
    readonly varId?: CardinalityVarId;
  };
}

// =============================================================================
// Solver interface
// =============================================================================

export interface SolveCardinalityInput {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly constraints: readonly CardinalityConstraint[];
  readonly edges: ReadonlyArray<{
    readonly fromBlock: BlockIndex;
    readonly fromPort: string;
    readonly toBlock: BlockIndex;
    readonly toPort: string;
  }>;
  readonly blockName?: (index: BlockIndex) => string;
  readonly trace?: boolean;
}

export interface SolveCardinalityResult {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly errors: readonly CardinalityConstraintError[];
}

function formatPort(port: PortKey, blockName?: (index: BlockIndex) => string): string {
  const [blockIndex, portName] = parsePortKey(port);
  if (blockName) return `${blockName(blockIndex)}.${portName}`;
  return `block#${blockIndex}.${portName}`;
}

// =============================================================================
// Solver
// =============================================================================

export function solveCardinality(input: SolveCardinalityInput): SolveCardinalityResult {
  const uf = new CardinalityUnionFind();
  const errors: CardinalityConstraintError[] = [];
  const { blockName, trace } = input;
  const portToNode = new Map<PortKey, UFNodeId>();
  const zipBroadcastGroups = new Map<CardinalityVarId, readonly PortKey[]>();
  const zipMemberPorts = new Set<PortKey>();
  const pendingOneNodes = new Map<UFNodeId, CardinalityValue>();

  // Build a set of zip OUTPUT ports for quick lookup in Phase 4.
  // These ports need card=many when their group has a many input;
  // we must not poison their UF root with 'one' from a downstream input.
  const zipOutputPorts = new Set<PortKey>();

  // Phase 1: Create nodes. Union 'equal' groups. zipBroadcast ports stay independent.
  for (const constraint of input.constraints) {
    if (constraint.kind === 'equal') {
      const groupNodeId = ufNodeId(`var:${constraint.varId}`);
      uf.ensure(groupNodeId);
      for (const port of constraint.ports) {
        const portNodeId = ufNodeId(`port:${port}`);
        uf.ensure(portNodeId);
        portToNode.set(port, portNodeId);
        const res = uf.union(portNodeId, groupNodeId);
        if (!res.ok) {
          const [blockIndex, portName] = parsePortKey(port);
          errors.push({
            kind: 'CardinalityConflict', port, blockIndex, portName,
            message: `Cardinality conflict in group ${constraint.varId} at ${formatPort(port, blockName)}`,
            details: { conflict: res.conflict, varId: constraint.varId },
          });
        }
      }
    } else if (constraint.kind === 'zipBroadcast') {
      zipBroadcastGroups.set(constraint.varId, constraint.ports);
      for (const port of constraint.ports) {
        const portNodeId = ufNodeId(`port:${port}`);
        uf.ensure(portNodeId);
        portToNode.set(port, portNodeId);
        zipMemberPorts.add(port);
        if (port.endsWith(':out')) {
          zipOutputPorts.add(port);
        }
      }
    } else if (constraint.kind === 'fixed') {
      const portNodeId = ufNodeId(`port:${constraint.port}`);
      uf.ensure(portNodeId);
      portToNode.set(constraint.port, portNodeId);
      const res = uf.assign(portNodeId, constraint.value);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(constraint.port);
        errors.push({
          kind: 'CardinalityConflict', port: constraint.port, blockIndex, portName,
          message: `Cardinality conflict at ${formatPort(constraint.port, blockName)}: fixed value conflicts`,
          details: { conflict: res.conflict },
        });
      }
      if (trace) console.log(`  [Phase1] fixed ${formatPort(constraint.port, blockName)} = ${fmtCard(constraint.value)}`);
    }
  }

  if (trace) {
    console.log('[CardinalitySolver] === Phase 1: Constraints ===');
    for (const c of input.constraints) {
      if (c.kind === 'equal') {
        console.log(`  equal var=${c.varId} ports=[${c.ports.map(p => formatPort(p, blockName)).join(', ')}]`);
      } else if (c.kind === 'zipBroadcast') {
        console.log(`  zipBroadcast var=${c.varId} ports=[${c.ports.map(p => formatPort(p, blockName)).join(', ')}]`);
      }
    }
    traceUFDump('After Phase 1', uf, blockName);
  }

  // Phase 2: Propagate concrete values from port types. Defer 'one' for zip members.
  if (trace) console.log('[CardinalitySolver] === Phase 2: Port type propagation ===');
  for (const [port, type] of input.portTypes) {
    const card = type.extent.cardinality;
    if (isAxisInst(card)) {
      let nodeId = portToNode.get(port);
      if (!nodeId) {
        nodeId = ufNodeId(`port:${port}`);
        uf.ensure(nodeId);
        portToNode.set(port, nodeId);
      }
      if (zipMemberPorts.has(port) && card.value.kind === 'one') {
        pendingOneNodes.set(nodeId, card.value);
        if (trace) console.log(`  [Phase2] DEFERRED pendingOne ${formatPort(port, blockName)} = ${fmtCard(card.value)}`);
        continue;
      }
      const res = uf.assign(nodeId, card.value);
      if (trace) console.log(`  [Phase2] assign ${formatPort(port, blockName)} = ${fmtCard(card.value)} → ${res.ok ? 'OK' : 'CONFLICT'}`);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(port);
        errors.push({
          kind: 'CardinalityConflict', port, blockIndex, portName,
          message: `Cardinality conflict at ${formatPort(port, blockName)}: ${JSON.stringify(res.conflict[0])} vs ${JSON.stringify(res.conflict[1])}`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 3: Propagate along edges.
  // Union all edge endpoints. Suppress one-vs-many conflicts for zip members.
  if (trace) console.log('[CardinalitySolver] === Phase 3: Edge propagation ===');
  for (const edge of input.edges) {
    const fromPort: PortKey = `${edge.fromBlock}:${edge.fromPort}:out` as PortKey;
    const toPort: PortKey = `${edge.toBlock}:${edge.toPort}:in` as PortKey;
    const fromNode = portToNode.get(fromPort);
    const toNode = portToNode.get(toPort);
    if (!fromNode || !toNode) continue;

    const hasZipMember = zipMemberPorts.has(fromPort) || zipMemberPorts.has(toPort);
    const res = uf.union(fromNode, toNode);
    if (!res.ok) {
      const [conflictA, conflictB] = res.conflict;
      const isOneVsMany = (conflictA.kind === 'one' && conflictB.kind === 'many') ||
                          (conflictA.kind === 'many' && conflictB.kind === 'one');
      if (hasZipMember && isOneVsMany) {
        if (trace) console.log(`  [Phase3] edge ${formatPort(fromPort, blockName)} → ${formatPort(toPort, blockName)}: SUPPRESSED (zip broadcast ${fmtCard(conflictA)} vs ${fmtCard(conflictB)})`);
      } else {
        if (trace) console.log(`  [Phase3] edge ${formatPort(fromPort, blockName)} → ${formatPort(toPort, blockName)}: CONFLICT ${fmtCard(conflictA)} vs ${fmtCard(conflictB)}`);
        const [blockIndex, portName] = parsePortKey(toPort);
        errors.push({
          kind: 'CardinalityConflict', port: toPort, blockIndex, portName,
          message: `Cardinality conflict along edge from ${formatPort(fromPort, blockName)} to ${formatPort(toPort, blockName)}`,
          details: { conflict: res.conflict },
        });
      }
    } else {
      if (trace) {
        const newRoot = uf.find(fromNode);
        console.log(`  [Phase3] edge ${formatPort(fromPort, blockName)} → ${formatPort(toPort, blockName)}: OK root=${fmtNode(newRoot, blockName)} val=${fmtCard(uf.resolved(fromNode))}`);
      }
    }
  }
  if (trace) traceUFDump('After Phase 3', uf, blockName);

  // Phase 4: Resolve zipBroadcast groups.
  // Find best concrete many value. Upgrade placeholder many to concrete.
  // Commit pending ones for signal ports. Assign many to truly unresolved.
  //
  // CRITICAL: Before committing pendingOne (card=one) to an input port, check
  // if its UF root is shared with a zip OUTPUT port from a DIFFERENT block.
  // If so, committing 'one' would poison that output port's cardinality.
  // Instead, skip the pendingOne commit and let the output get 'many'.
  if (trace) console.log('[CardinalitySolver] === Phase 4: ZipBroadcast resolution ===');
  let phase4Changed = true;
  let phase4Iterations = 0;
  const maxPhase4Iterations = 20;
  while (phase4Changed && phase4Iterations < maxPhase4Iterations) {
    phase4Changed = false;
    phase4Iterations++;
    if (trace) console.log(`  [Phase4] iteration ${phase4Iterations}`);

    for (const [, ports] of zipBroadcastGroups) {
      let bestMany: CardinalityValue | null = null;
      for (const port of ports) {
        const nodeId = portToNode.get(port);
        if (!nodeId) continue;
        const resolved = uf.resolved(nodeId);
        if (resolved && resolved.kind === 'many') {
          if (!bestMany || (isPlaceholderInstance(bestMany) && !isPlaceholderInstance(resolved))) {
            bestMany = resolved;
          }
        }
      }
      if (bestMany) {
        for (const port of ports) {
          const nodeId = portToNode.get(port);
          if (!nodeId) continue;
          const resolved = uf.resolved(nodeId);
          if (!resolved) {
            const isOutputPort = port.endsWith(':out');
            if (pendingOneNodes.has(nodeId) && !isOutputPort) {
              // Before committing 'one', check if the UF root is shared with
              // a zip OUTPUT port from a DIFFERENT block.
              const thisBlockPrefix = port.split(':')[0] + ':';
              const thisRoot = uf.find(nodeId);
              let hasExternalOutput = false;
              for (const outPort of zipOutputPorts) {
                if (outPort.startsWith(thisBlockPrefix)) continue; // Same block: OK
                const outNodeId = portToNode.get(outPort);
                if (outNodeId && uf.find(outNodeId) === thisRoot) {
                  hasExternalOutput = true;
                  break;
                }
              }
              if (hasExternalOutput) {
                if (trace) console.log(`    [Phase4] SKIP pendingOne ${formatPort(port, blockName)} — shared root with external zip output`);
                continue;
              }
              // Safe to commit as one (no external output sharing root)
              uf.assign(nodeId, pendingOneNodes.get(nodeId)!);
              pendingOneNodes.delete(nodeId);
              if (trace) console.log(`    [Phase4] COMMIT pendingOne ${formatPort(port, blockName)} = one`);
            } else {
              // Output port OR truly unresolved: assign many
              uf.assign(nodeId, bestMany);
              pendingOneNodes.delete(nodeId);
              phase4Changed = true;
              if (trace) console.log(`    [Phase4] ASSIGN ${formatPort(port, blockName)} = ${fmtCard(bestMany)}`);
            }
          } else if (resolved.kind === 'many' && isPlaceholderInstance(resolved) && !isPlaceholderInstance(bestMany)) {
            uf.assign(nodeId, bestMany);
            phase4Changed = true;
            if (trace) console.log(`    [Phase4] UPGRADE ${formatPort(port, blockName)} placeholder → ${fmtCard(bestMany)}`);
          }
        }
      }
    }
    if (trace) traceUFDump(`After Phase 4 iteration ${phase4Iterations}`, uf, blockName);
  }

  // Phase 4b: Commit remaining deferred one-values
  if (trace) console.log('[CardinalitySolver] === Phase 4b: Remaining pendingOne ===');
  for (const [nodeId, value] of pendingOneNodes) {
    if (!uf.resolved(nodeId)) {
      uf.assign(nodeId, value);
      if (trace) console.log(`  [Phase4b] COMMIT ${fmtNode(nodeId, blockName)} = ${fmtCard(value)}`);
    }
  }

  // Phase 5: Write resolved cardinalities back to port types
  if (trace) console.log('[CardinalitySolver] === Phase 5: Final resolution ===');
  const resolvedPortTypes = new Map<PortKey, CanonicalType>();
  for (const [port, type] of input.portTypes) {
    const nodeId = portToNode.get(port);
    let resolvedCard: Cardinality;
    if (nodeId) {
      const resolved = uf.resolved(nodeId);
      if (resolved) {
        if (resolved.kind === 'one') resolvedCard = cardinalityOne();
        else if (resolved.kind === 'many') resolvedCard = cardinalityMany(resolved.instance);
        else resolvedCard = { kind: 'inst', value: resolved };
      } else {
        const [blockIndex, portName] = parsePortKey(port);
        errors.push({
          kind: 'UnresolvedCardinality', port, blockIndex, portName,
          message: `Cannot infer cardinality for ${formatPort(port, blockName)}`,
        });
        resolvedCard = type.extent.cardinality;
      }
    } else {
      resolvedCard = type.extent.cardinality;
    }
    resolvedPortTypes.set(port, { ...type, extent: { ...type.extent, cardinality: resolvedCard } });
    if (trace) {
      const cardVal = nodeId ? uf.resolved(nodeId) : null;
      console.log(`  [Phase5] ${formatPort(port, blockName)} → ${fmtCard(cardVal)}`);
    }
  }
  if (trace) console.log('[CardinalitySolver] === Done ===');

  return { portTypes: resolvedPortTypes, errors };
}

// =============================================================================
// Helpers
// =============================================================================

function parsePortKey(key: PortKey): [BlockIndex, string] {
  const parts = key.split(':');
  const blockIndex = parseInt(parts[0], 10) as BlockIndex;
  const portName = parts[1];
  return [blockIndex, portName];
}
