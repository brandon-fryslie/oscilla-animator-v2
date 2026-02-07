/**
 * Pass 1: Type Constraint Solving (D5-clean + Sprint 2 Cardinality Solver)
 *
 * - CanonicalType is fully resolved (no unit/payload vars in core).
 * - Vars exist ONLY in inference layer (this file).
 * - BlockDef may be authored with def-level type variables (templates).
 * - Cardinality constraints are gathered from BlockCardinalityMetadata and solved via union-find.
 * - Output is the sole authority: TypeResolvedPatch.portTypes.
 */

import type { NormalizedPatch, BlockIndex } from '../ir/patches';
import type { Block } from '../../graph/Patch';
import type { CanonicalType, Extent, PayloadType, UnitType, CardinalityValue } from '../../core/canonical-types';
import { isAxisInst, cardinalityMany, instanceRef } from '../../core/canonical-types';
import { getBlockDefinition, getBlockCardinalityMetadata } from '../../blocks/registry';
import type { CardinalityVarId } from '../../core/ids';
import { instanceId } from '../../core/ids';
import { solveCardinality, type CardinalityConstraint } from './solve-cardinality';

// =============================================================================
// Port key
// =============================================================================

export type PortKey = `${number}:${string}:${'in' | 'out'}`;
function portKey(blockIndex: BlockIndex, portName: string, dir: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${dir}` as PortKey;
}

// =============================================================================
// Output
// =============================================================================

export interface TypeResolvedPatch extends NormalizedPatch {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
}

export type TypeConstraintErrorKind =
    | 'UnresolvedUnit'
    | 'ConflictingUnits'
    | 'UnresolvedPayload'
    | 'ConflictingPayloads'
    | 'MissingBlockDef'
    | 'MissingPortDef'
    | 'CardinalityConflict'
    | 'UnresolvedCardinality';

export interface TypeConstraintError {
  readonly kind: TypeConstraintErrorKind;
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly direction: 'in' | 'out';
  readonly message: string;
  readonly suggestions: readonly string[];
}

export type Pass1Result = TypeResolvedPatch & { readonly errors: readonly TypeConstraintError[] };

// =============================================================================
// Inference-only atoms (D5)
// =============================================================================

type UnitVarId = string & { readonly __brand: 'UnitVarId' };
type PayloadVarId = string & { readonly __brand: 'PayloadVarId' };

function _unitVarId(s: string): UnitVarId { return s as UnitVarId; }
function _payloadVarId(s: string): PayloadVarId { return s as PayloadVarId; }
function cardinalityVarId(s: string): CardinalityVarId { return s as CardinalityVarId; }

// Template-level "variables" referenced by BlockDef authoring (defVar ids)
type DefUnitVar = { readonly kind: 'unitVar'; readonly id: string };
type DefPayloadVar = { readonly kind: 'payloadVar'; readonly id: string };

type UnitTemplate = UnitType | DefUnitVar;
type PayloadTemplate = PayloadType | DefPayloadVar;

interface TypeTemplate {
  readonly payload: PayloadTemplate;
  readonly unit: UnitTemplate;
  readonly extent: Extent;
}

// =============================================================================
// Equality (canonical-only)
// =============================================================================

function unitsEqual(a: UnitType, b: UnitType): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function payloadsEqual(a: PayloadType, b: PayloadType): boolean {
  return a.kind === b.kind;
}

// =============================================================================
// Union-find (generic, tagged, no string collision)
// =============================================================================

type UFNodeId<V> = string & { readonly __brand: 'UFNodeId'; readonly __varType?: V };
function ufNodeId<V>(s: string): UFNodeId<V> { return s as UFNodeId<V>; }

type UFParent<T, V> =
    | { readonly tag: 'parent'; readonly id: UFNodeId<V> }
    | { readonly tag: 'value'; readonly value: T };

class UnionFind<T> {
  private parent = new Map<UFNodeId<any>, UFParent<T, any>>();

  ensure(id: UFNodeId<any>): void {
    if (!this.parent.has(id)) this.parent.set(id, { tag: 'parent', id });
  }

  find(id: UFNodeId<any>): UFParent<T, any> {
    this.ensure(id);
    const p = this.parent.get(id)!;

    if (p.tag === 'value') return p;
    if (p.id === id) return p; // root

    const root = this.find(p.id);
    // path compression:
    if (root.tag === 'parent') this.parent.set(id, { tag: 'parent', id: root.id });
    else this.parent.set(id, root);
    return root;
  }

  assign(id: UFNodeId<any>, value: T, eq: (a: T, b: T) => boolean): { ok: true } | { ok: false; conflict: [T, T] } {
    const r = this.find(id);
    if (r.tag === 'value') {
      if (eq(r.value, value)) return { ok: true };
      return { ok: false, conflict: [r.value, value] };
    }
    this.parent.set(r.id, { tag: 'value', value });
    return { ok: true };
  }

  union(a: UFNodeId<any>, b: UFNodeId<any>, eq: (a: T, b: T) => boolean): { ok: true } | { ok: false; conflict: [T, T] } {
    const ra = this.find(a);
    const rb = this.find(b);

    if (ra.tag === 'value' && rb.tag === 'value') {
      if (eq(ra.value, rb.value)) return { ok: true };
      return { ok: false, conflict: [ra.value, rb.value] };
    }

    if (ra.tag === 'value' && rb.tag === 'parent') {
      this.parent.set(rb.id, ra);
      return { ok: true };
    }
    if (rb.tag === 'value' && ra.tag === 'parent') {
      this.parent.set(ra.id, rb);
      return { ok: true };
    }

    if (ra.tag === 'parent' && rb.tag === 'parent') {
      if (ra.id !== rb.id) this.parent.set(ra.id, { tag: 'parent', id: rb.id });
      return { ok: true };
    }

    return { ok: true };
  }

  resolved(id: UFNodeId<any>): T | null {
    const r = this.find(id);
    return r.tag === 'value' ? r.value : null;
  }
}

// =============================================================================
// Node ID constructors
// =============================================================================

type UnitNodeId = UFNodeId<UnitType>;
type PayloadNodeId = UFNodeId<PayloadType>;

function unitNodeFor(blockIndex: BlockIndex, defVarId: string): UnitNodeId {
  return ufNodeId(`block:${blockIndex}:unitVar:${defVarId}`);
}

function unitNodeConcrete(blockIndex: BlockIndex, portName: string, dir: 'in' | 'out'): UnitNodeId {
  return ufNodeId(`block:${blockIndex}:port:${portName}:${dir}:unit`);
}

function payloadNodeFor(blockIndex: BlockIndex, defVarId: string): PayloadNodeId {
  return ufNodeId(`block:${blockIndex}:payloadVar:${defVarId}`);
}

function payloadNodeConcrete(blockIndex: BlockIndex, portName: string, dir: 'in' | 'out'): PayloadNodeId {
  return ufNodeId(`block:${blockIndex}:port:${portName}:${dir}:payload`);
}

// =============================================================================
// Template bridging (legacy BlockDef.inputs/outputs.type compatibility)
// =============================================================================

interface PortInfo {
  readonly block: Block;
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly direction: 'in' | 'out';
  readonly template: TypeTemplate;
  readonly unitNode: UnitNodeId;
  readonly payloadNode: PayloadNodeId;
}

/**
 * Convert a BlockDef port type to TypeTemplate.
 * If the port type is already a template with vars, return as-is.
 * Otherwise bridge legacy canonical types to template form.
 */
function defPortTypeToTemplate(defPortType: any): TypeTemplate {
  // "payload"
  let payload: PayloadTemplate;
  const p = defPortType.payload;
  if (p && typeof p === 'object' && p.kind === 'var' && typeof p.id === 'string') {
    payload = { kind: 'payloadVar', id: p.id };
  } else {
    payload = p as PayloadType;
  }

  // "unit"
  let unit: UnitTemplate;
  const u = defPortType.unit;
  if (u && typeof u === 'object' && u.kind === 'var' && typeof u.id === 'string') {
    unit = { kind: 'unitVar', id: u.id };
  } else {
    unit = u as UnitType;
  }

  return {
    payload,
    unit,
    extent: defPortType.extent as Extent,
  };
}

function getTemplateForPort(block: Block, portName: string, dir: 'in' | 'out'): TypeTemplate | null {
  const def = getBlockDefinition(block.type);
  if (!def) return null;

  const portDef = dir === 'in' ? def.inputs[portName] : def.outputs[portName];
  if (!portDef?.type) return null;

  /* Recommended: portDef.type is already TypeTemplate. If not, bridge it. */
  const t = portDef.type as any;
  if (t && t.payload && t.unit && t.extent) {
    /* If authored as template already: */
    if (t.payload.kind === 'payloadVar' || t.unit.kind === 'unitVar') return t as TypeTemplate;
    /* If authored as canonical (maybe with legacy vars), bridge: */
    return defPortTypeToTemplate(t);
  }
  return null;
}

// =============================================================================
// Inference var identity
// =============================================================================

// UnitVarId and PayloadVarId (branded strings with block scope)
// This prevents collision between blocks that happen to use the same variable name.

// =============================================================================
// Cardinality constraint gathering (Sprint 2)
// =============================================================================

/**
 * Gather cardinality constraints from block metadata.
 *
 * Strategy per cardinalityMode:
 * - preserve → all variable-cardinality ports share a CardinalityVarId
 * - signalOnly → all ports fixed to 'one'
 * - transform → output cardinality is 'many' with block-specific instance ref
 * - fieldOnly → (handled by type validation, no constraint needed here)
 *
 * Key insight: Only ports that can vary (field vs signal) participate in preserve constraints.
 * Ports with concrete cardinality in their BlockDef type are excluded from preserve constraints.
 */
function gatherCardinalityConstraints(
  normalized: NormalizedPatch,
  portInfos: Map<PortKey, PortInfo>,
): CardinalityConstraint[] {
  const constraints: CardinalityConstraint[] = [];

  // Map from blockIndex to constraint varId (one variable per block for preserve-mode)
  const blockCardinalityVar = new Map<BlockIndex, CardinalityVarId>();

  for (let i = 0; i < normalized.blocks.length; i++) {
    const block = normalized.blocks[i];
    const blockIndex = i as BlockIndex;
    const meta = getBlockCardinalityMetadata(block.type);

    if (!meta) continue; // Block has fixed cardinality (no metadata)

    // Collect port keys for this block, filtering by whether cardinality can vary
    const variablePorts: PortKey[] = [];
    const concretePorts: PortKey[] = [];

    for (const [k, info] of portInfos) {
      if (info.blockIndex !== blockIndex) continue;

      // Check if this port's cardinality is already concrete in the template
      const cardinalityIsFixed = isAxisInst(info.template.extent.cardinality);

      if (cardinalityIsFixed) {
        concretePorts.push(k);
      } else {
        variablePorts.push(k);
      }
    }

    switch (meta.cardinalityMode) {
      case 'preserve': {
        // Include ALL ports (concrete + variable) so the UF links them together.
        // This ensures instance refs propagate from inputs to outputs within the block.
        // Concrete ports have placeholder instance refs that need upgrading via edge propagation.
        const allPreservePorts = [...concretePorts, ...variablePorts];
        if (allPreservePorts.length > 0) {
          const varId = cardinalityVarId(`block:${blockIndex}`);
          blockCardinalityVar.set(blockIndex, varId);

          if (meta.broadcastPolicy === 'allowZipSig') {
            // Allow mixed one+many (zip-broadcast)
            constraints.push({
              kind: 'zipBroadcast',
              varId,
              ports: allPreservePorts,
            });
          } else {
            // Strict equality (disallowSignalMix or requireBroadcastExpr)
            constraints.push({
              kind: 'equal',
              varId,
              ports: allPreservePorts,
            });
          }
        }
        break;
      }

      case 'signalOnly': {
        // All ports must be cardinality one
        for (const [k, info] of portInfos) {
          if (info.blockIndex !== blockIndex) continue;
          constraints.push({
            kind: 'fixed',
            port: k,
            value: { kind: 'one' },
          });
        }
        break;
      }

      case 'transform':
      case 'fieldOnly': {
        // For fieldOnly/transform blocks with allowZipSig, generate a zipBroadcast
        // constraint so the solver knows mixed one+many is allowed.
        if (meta.broadcastPolicy === 'allowZipSig') {
          const allPorts = [...concretePorts, ...variablePorts];
          if (allPorts.length > 0) {
            const varId = cardinalityVarId(`block:${blockIndex}`);
            blockCardinalityVar.set(blockIndex, varId);
            constraints.push({
              kind: 'zipBroadcast',
              varId,
              ports: allPorts,
            });
          }
        }
        break;
      }
    }
  }

  return constraints;
}

// =============================================================================
// Instance identity resolution (Sprint 2 P1)
// =============================================================================

/**
 * Check if a block is an instance source (creates new instances).
 * Instance sources have NO field inputs but DO have field outputs.
 */
function isInstanceSource(
  blockIndex: BlockIndex,
  portInfos: Map<PortKey, PortInfo>,
  portTypes: Map<PortKey, CanonicalType>,
): boolean {
  let hasFieldInput = false;
  let hasFieldOutput = false;

  for (const [k, info] of portInfos) {
    if (info.blockIndex !== blockIndex) continue;

    const type = portTypes.get(k);
    if (!type) continue;

    const card = type.extent.cardinality;
    if (isAxisInst(card) && card.value.kind === 'many') {
      if (info.direction === 'in') {
        hasFieldInput = true;
      } else {
        hasFieldOutput = true;
      }
    }
  }

  // Instance source: has field outputs but NO field inputs
  return hasFieldOutput && !hasFieldInput;
}

/**
 * Resolve instance references for transform-mode blocks.
 *
 * Transform-mode blocks create new instances. Their output types have placeholder
 * 'default' instance refs in the BlockDef. This function replaces those placeholders
 * with block-specific instance refs.
 *
 * Strategy:
 * 1. For each transform-mode block, check if it's an instance source
 * 2. Instance sources get block-specific instance refs using the domainType from metadata
 * 3. Other transform blocks inherit instance refs via edge propagation (cardinality solver)
 *
 * This ensures that by the time cardinality solving runs, instance-source blocks have
 * concrete refs that can propagate downstream.
 */
function resolveInstanceRefs(
  normalized: NormalizedPatch,
  portInfos: Map<PortKey, PortInfo>,
  portTypes: Map<PortKey, CanonicalType>,
): void {
  for (let i = 0; i < normalized.blocks.length; i++) {
    const block = normalized.blocks[i];
    const blockIndex = i as BlockIndex;
    const meta = getBlockCardinalityMetadata(block.type);

    // Only handle transform-mode blocks (instance-creating blocks)
    if (!meta || meta.cardinalityMode !== 'transform') continue;

    // Check if this block is an instance source
    if (!isInstanceSource(blockIndex, portInfos, portTypes)) continue;

    // Extract domain type from block metadata
    // TypeScript knows meta.domainType exists because cardinalityMode === 'transform'
    const domain = meta.domainType;
    const instance = instanceId(`block-${blockIndex}`);
    const ref = instanceRef(domain as string, instance as string);

    // Update all output ports of this block to use the concrete instance ref
    for (const [k, info] of portInfos) {
      if (info.blockIndex !== blockIndex) continue;
      if (info.direction !== 'out') continue;

      const currentType = portTypes.get(k);
      if (!currentType) continue;

      // Check if this port has a 'many' cardinality with a placeholder instance
      const card = currentType.extent.cardinality;
      if (isAxisInst(card) && card.value.kind === 'many') {
        // Replace the placeholder instance ref with the block-specific ref
        const newCard = cardinalityMany(ref);
        const newType: CanonicalType = {
          ...currentType,
          extent: {
            ...currentType.extent,
            cardinality: newCard,
          },
        };
        portTypes.set(k, newType);
      }
    }
  }
}

// =============================================================================
// Main pass
// =============================================================================

export interface Pass1Options {
  readonly traceCardinalitySolver?: boolean;
}

export function pass1TypeConstraints(normalized: NormalizedPatch, options?: Pass1Options): Pass1Result {
  const unitUF = new UnionFind<UnitType>();
  const payloadUF = new UnionFind<PayloadType>();
  const errors: TypeConstraintError[] = [];

  const portInfos = new Map<PortKey, PortInfo>();

  // ---- Phase A: Collect ports, create node ids, assign concrete constraints
  for (let i = 0; i < normalized.blocks.length; i++) {
    const block = normalized.blocks[i];
    const blockIndex = i as BlockIndex;

    const def = getBlockDefinition(block.type);
    if (!def) {
      // You may want to hard-error here instead of collecting.
      continue;
    }

    // outputs
    for (const [portName, outDef] of Object.entries(def.outputs)) {
      if (!outDef.type) continue;

      const tmpl = getTemplateForPort(block, portName, 'out');
      if (!tmpl) continue;

      const k = portKey(blockIndex, portName, 'out');

      const unitNode =
          isDefUnitVar(tmpl.unit) ? unitNodeFor(blockIndex, tmpl.unit.id) : unitNodeConcrete(blockIndex, portName, 'out');

      const payloadNode =
          isDefPayloadVar(tmpl.payload) ? payloadNodeFor(blockIndex, tmpl.payload.id) : payloadNodeConcrete(blockIndex, portName, 'out');

      portInfos.set(k, { block, blockIndex, portName, direction: 'out', template: tmpl, unitNode, payloadNode });

      /* Assign concrete constraints immediately for concrete ports: */
      if (!isDefUnitVar(tmpl.unit)) {
        const res = unitUF.assign(unitNode, tmpl.unit, unitsEqual);
        if (!res.ok) addUnitConflict(errors, blockIndex, portName, 'out', res.conflict);
      }
      if (!isDefPayloadVar(tmpl.payload)) {
        const res = payloadUF.assign(payloadNode, tmpl.payload, payloadsEqual);
        if (!res.ok) addPayloadConflict(errors, blockIndex, portName, 'out', res.conflict);
      }
    }

    // inputs (skip non-exposed ports like your current logic if needed)
    for (const [portName, inDef] of Object.entries(def.inputs)) {
      if (!inDef.type) continue;
      if (inDef.exposedAsPort === false) continue;

      const tmpl = getTemplateForPort(block, portName, 'in');
      if (!tmpl) continue;

      const k = portKey(blockIndex, portName, 'in');

      const unitNode =
          isDefUnitVar(tmpl.unit) ? unitNodeFor(blockIndex, tmpl.unit.id) : unitNodeConcrete(blockIndex, portName, 'in');

      const payloadNode =
          isDefPayloadVar(tmpl.payload) ? payloadNodeFor(blockIndex, tmpl.payload.id) : payloadNodeConcrete(blockIndex, portName, 'in');

      portInfos.set(k, { block, blockIndex, portName, direction: 'in', template: tmpl, unitNode, payloadNode });

      if (!isDefUnitVar(tmpl.unit)) {
        const res = unitUF.assign(unitNode, tmpl.unit, unitsEqual);
        if (!res.ok) addUnitConflict(errors, blockIndex, portName, 'in', res.conflict);
      }
      if (!isDefPayloadVar(tmpl.payload)) {
        const res = payloadUF.assign(payloadNode, tmpl.payload, payloadsEqual);
        if (!res.ok) addPayloadConflict(errors, blockIndex, portName, 'in', res.conflict);
      }
    }
  }

  // ---- Phase B: Edge constraints: unify from.out with to.in
  for (const e of normalized.edges) {
    const fromK = portKey(e.fromBlock, e.fromPort, 'out');
    const toK = portKey(e.toBlock, e.toPort, 'in');

    const fromInfo = portInfos.get(fromK);
    const toInfo = portInfos.get(toK);
    if (!fromInfo || !toInfo) continue;

    const u = unitUF.union(fromInfo.unitNode, toInfo.unitNode, unitsEqual);
    if (!u.ok) {
      errors.push({
        kind: 'ConflictingUnits',
        blockIndex: e.toBlock,
        portName: e.toPort,
        direction: 'in',
        message: `Conflicting units across edge: ${describeUnit(u.conflict[0])} vs ${describeUnit(u.conflict[1])}`,
        suggestions: [
          'Insert a unit adapter between these blocks',
          'Change source/consumer units to match',
        ],
      });
    }

    const p = payloadUF.union(fromInfo.payloadNode, toInfo.payloadNode, payloadsEqual);
    if (!p.ok) {
      errors.push({
        kind: 'ConflictingPayloads',
        blockIndex: e.toBlock,
        portName: e.toPort,
        direction: 'in',
        message: `Conflicting payloads across edge: ${p.conflict[0].kind} vs ${p.conflict[1].kind}`,
        suggestions: [
          'Insert a payload adapter (if defined) or change the block types',
          'Ensure connected ports with compatible payload kinds',
        ],
      });
    }
  }

  // If conflicts already exist, stop early (optional but reduces noise).
  // You can choose to keep going and also report unresolveds.
  // I recommend: keep going to report unresolveds too (more actionable).
  // (no early return)

  // ---- Phase C: Build resolved CanonicalType for every port.
  // Process inputs first so cardinality-preserve blocks can inherit field cardinality.
  const portTypes = new Map<PortKey, CanonicalType>();

  const resolvePort = (k: PortKey, info: PortInfo): boolean => {
    const payload = payloadUF.resolved(info.payloadNode);
    const unit = unitUF.resolved(info.unitNode);

    if (!payload) {
      errors.push({
        kind: 'UnresolvedPayload',
        blockIndex: info.blockIndex,
        portName: info.portName,
        direction: info.direction,
        message: `Unresolved payload for ${info.block.type}.${info.portName}`,
        suggestions: [
          'Connect this port to a typed producer/consumer',
          'Add an explicit payload annotation on this block/port (or eliminate polymorphism)',
        ],
      });
      return false;
    }
    if (!unit) {
      errors.push({
        kind: 'UnresolvedUnit',
        blockIndex: info.blockIndex,
        portName: info.portName,
        direction: info.direction,
        message: `Unresolved unit for ${info.block.type}.${info.portName}`,
        suggestions: [
          'Connect this port to a typed producer/consumer',
          'Add an explicit unit annotation on this block/port (or eliminate polymorphism)',
        ],
      });
      return false;
    }

    portTypes.set(k, {
      payload,
      unit,
      extent: info.template.extent,
    });
    return true;
  };

  // Pass 1: resolve all input ports
  for (const [k, info] of portInfos) {
    if (info.direction === 'in') resolvePort(k, info);
  }

  // Pass 2: resolve output ports
  for (const [k, info] of portInfos) {
    if (info.direction === 'out') resolvePort(k, info);
  }

  // ---- Phase C2: Instance identity resolution (Sprint 2 P1)
  // Replace placeholder instance refs in transform-mode blocks with concrete refs
  resolveInstanceRefs(normalized, portInfos, portTypes);

  // ---- Phase D: Cardinality constraint solving (Sprint 2)
  // Gather constraints from BlockCardinalityMetadata
  const cardinalityConstraints = gatherCardinalityConstraints(normalized, portInfos);

  // Solve cardinality constraints
  const cardinalityResult = solveCardinality({
    portTypes,
    constraints: cardinalityConstraints,
    edges: normalized.edges,
    blockName: (idx) => {
      const blk = normalized.blocks[idx];
      return blk ? `${blk.displayName ?? blk.type} (${blk.type})` : `block#${idx}`;
    },
    trace: options?.traceCardinalitySolver,
  });

  // Merge cardinality errors
  for (const cardError of cardinalityResult.errors) {
    errors.push({
      kind: cardError.kind as TypeConstraintErrorKind,
      blockIndex: cardError.blockIndex,
      portName: cardError.portName,
      direction: 'in', // Default to 'in' for now; solver could provide this
      message: cardError.message,
      suggestions: ['Check block cardinality constraints', 'Ensure compatible cardinality along edges'],
    });
  }

  // Use resolved port types from cardinality solver
  const resolvedPortTypes = cardinalityResult.portTypes;

  // ALWAYS return both resolved types AND errors (even if errors.length > 0)
  // The resolved types are the best-effort resolution and are still useful
  return { ...normalized, portTypes: resolvedPortTypes, errors };
}

// =============================================================================
// Small helpers
// =============================================================================

function isDefUnitVar(u: UnitTemplate): u is DefUnitVar {
  return typeof u === 'object' && u !== null && (u as any).kind === 'unitVar';
}
function isDefPayloadVar(p: PayloadTemplate): p is DefPayloadVar {
  return typeof p === 'object' && p !== null && (p as any).kind === 'payloadVar';
}

function addUnitConflict(
    errors: TypeConstraintError[],
    blockIndex: BlockIndex,
    portName: string,
    direction: 'in' | 'out',
    conflict: [UnitType, UnitType],
): void {
  errors.push({
    kind: 'ConflictingUnits',
    blockIndex,
    portName,
    direction,
    message: `Conflicting units: ${describeUnit(conflict[0])} vs ${describeUnit(conflict[1])}`,
    suggestions: [
      'Fix the block definition (if it is internally inconsistent)',
      'Or ensure polymorphic ports are constrained by wiring',
    ],
  });
}

function addPayloadConflict(
    errors: TypeConstraintError[],
    blockIndex: BlockIndex,
    portName: string,
    direction: 'in' | 'out',
    conflict: [PayloadType, PayloadType],
): void {
  errors.push({
    kind: 'ConflictingPayloads',
    blockIndex,
    portName,
    direction,
    message: `Conflicting payloads: ${conflict[0].kind} vs ${conflict[1].kind}`,
    suggestions: [
      'Fix the block definition (if it is internally inconsistent)',
      'Or constrain polymorphic ports by wiring or adapters',
    ],
  });
}

function describeUnit(u: UnitType): string {
  return JSON.stringify(u);
}

// =============================================================================
// Downstream lookup (single source of truth)
// =============================================================================

export function getPortType(
    patch: TypeResolvedPatch,
    blockIndex: BlockIndex,
    portName: string,
    direction: 'in' | 'out',
): CanonicalType | undefined {
  return patch.portTypes.get(portKey(blockIndex, portName, direction));
}
