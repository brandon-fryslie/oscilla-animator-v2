/**
 * Pass 1: Type Constraint Solving (Unit Inference)
 *
 * This pass runs immediately after graph normalization and before Pass 2 (Type Graph).
 * It resolves all polymorphic type variables (especially unit variables) through
 * constraint propagation.
 *
 * Architecture:
 * - Collects constraints from all edges: Type(fromPort) == Type(toPort)
 * - Uses union-find for efficient constraint propagation
 * - Produces a resolved types map: portKey → SignalType
 * - Unresolved polymorphic ports are hard errors (no fallback to scalar)
 *
 * This implements the spec from design-docs/_to_integrate/01-Units-and-Type-Inference.md
 */

import type { NormalizedPatch, NormalizedEdge, BlockIndex } from '../ir/patches';
import type { Block } from '../../graph/Patch';
import type { SignalType, Unit, PayloadType } from '../../core/canonical-types';
import { isUnitVar, unitsEqual } from '../../core/canonical-types';
import { getBlockDefinition, isPayloadGeneric } from '../../blocks/registry';

// =============================================================================
// Types
// =============================================================================

/**
 * Key for a port: "blockIndex:portName:direction"
 */
export type PortKey = string;

function portKey(blockIndex: BlockIndex, portName: string, direction: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${direction}`;
}

/**
 * Result of type constraint solving.
 */
export interface ResolvedTypesResult {
  readonly kind: 'ok';
  /**
   * Map from port key to resolved SignalType.
   * Only contains entries for ports that were polymorphic and got resolved.
   * Monomorphic ports use their definition type directly.
   */
  readonly resolvedPortTypes: ReadonlyMap<PortKey, SignalType>;
}

export interface TypeConstraintError {
  readonly kind: 'UnresolvedUnit' | 'ConflictingUnits';
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly message: string;
  readonly suggestions: readonly string[];
}

export interface ResolvedTypesError {
  readonly kind: 'error';
  readonly errors: readonly TypeConstraintError[];
}

export type ResolvedTypes = ResolvedTypesResult | ResolvedTypesError;

// =============================================================================
// Union-Find for Unit Variables
// =============================================================================

/**
 * Union-Find data structure for unit constraint solving.
 * Maps unit variable IDs to their representative (either another var or a concrete unit).
 */
class UnitUnionFind {
  private parent: Map<string, string | Unit> = new Map();

  /**
   * Find the representative for a unit.
   * If concrete, returns itself. If var, follows chain to root.
   */
  find(unit: Unit): Unit {
    if (unit.kind !== 'var') {
      return unit; // Concrete units are their own representative
    }

    const id = unit.id;
    const p = this.parent.get(id);

    if (p === undefined) {
      // Not yet in union-find, it's its own representative
      return unit;
    }

    if (typeof p === 'string') {
      // Parent is another var ID, recurse
      const root = this.find({ kind: 'var', id: p });
      // Path compression
      if (root.kind === 'var') {
        this.parent.set(id, root.id);
      } else {
        this.parent.set(id, root);
      }
      return root;
    }

    // Parent is a concrete unit
    return p;
  }

  /**
   * Unify two units.
   * Returns true if successful, false if conflict (two different concrete units).
   */
  union(a: Unit, b: Unit): { ok: true } | { ok: false; conflict: [Unit, Unit] } {
    const rootA = this.find(a);
    const rootB = this.find(b);

    // Both concrete and equal → already unified
    if (rootA.kind !== 'var' && rootB.kind !== 'var') {
      if (unitsEqual(rootA, rootB)) {
        return { ok: true };
      }
      return { ok: false, conflict: [rootA, rootB] };
    }

    // One is var, one is concrete → var becomes concrete
    if (rootA.kind === 'var' && rootB.kind !== 'var') {
      this.parent.set(rootA.id, rootB);
      return { ok: true };
    }
    if (rootB.kind === 'var' && rootA.kind !== 'var') {
      this.parent.set(rootB.id, rootA);
      return { ok: true };
    }

    // Both are vars → merge (arbitrary choice: A points to B)
    if (rootA.kind === 'var' && rootB.kind === 'var' && rootA.id !== rootB.id) {
      this.parent.set(rootA.id, rootB.id);
    }

    return { ok: true };
  }
}

// =============================================================================
// Constraint Collection & Solving
// =============================================================================

/**
 * Get the type of a port from the block definition.
 * Returns the raw definition type (may contain UnitVar).
 */
function getDefinitionPortType(
  block: Block,
  portName: string,
  direction: 'in' | 'out'
): SignalType | null {
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return null;

  if (direction === 'in') {
    const inputDef = blockDef.inputs[portName];
    return inputDef?.type ?? null;
  } else {
    const outputDef = blockDef.outputs[portName];
    return outputDef?.type ?? null;
  }
}

/**
 * Check if a port's type is polymorphic (has a unit variable).
 */
function isPolymorphicPort(type: SignalType | null): boolean {
  if (!type) return false;
  return isUnitVar(type.unit);
}

/**
 * Run type constraint solving on a normalized patch.
 *
 * @param normalized - Fully normalized patch (after all graph passes)
 * @returns Resolved types or errors
 */
export function pass1TypeConstraints(normalized: NormalizedPatch): ResolvedTypes {
  const uf = new UnitUnionFind();
  const errors: TypeConstraintError[] = [];

  // Track which blocks have polymorphic ports
  const polymorphicPorts = new Map<PortKey, { block: Block; blockIndex: BlockIndex; portName: string; direction: 'in' | 'out'; type: SignalType }>();

  // Phase 1: Initialize - identify all polymorphic ports
  for (let i = 0; i < normalized.blocks.length; i++) {
    const block = normalized.blocks[i];
    const blockIndex = i as BlockIndex;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    // Check outputs
    for (const [portName, outputDef] of Object.entries(blockDef.outputs)) {
      if (outputDef.type && isUnitVar(outputDef.type.unit)) {
        const key = portKey(blockIndex, portName, 'out');
        polymorphicPorts.set(key, {
          block,
          blockIndex,
          portName,
          direction: 'out',
          type: outputDef.type,
        });
      }
    }

    // Check inputs (for completeness, though most polymorphism is on outputs)
    for (const [portName, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.type && isUnitVar(inputDef.type.unit)) {
        const key = portKey(blockIndex, portName, 'in');
        polymorphicPorts.set(key, {
          block,
          blockIndex,
          portName,
          direction: 'in',
          type: inputDef.type,
        });
      }
    }
  }

  // Phase 2: Collect constraints from edges
  for (const edge of normalized.edges) {
    const fromBlock = normalized.blocks[edge.fromBlock];
    const toBlock = normalized.blocks[edge.toBlock];

    const fromType = getDefinitionPortType(fromBlock, edge.fromPort, 'out');
    const toType = getDefinitionPortType(toBlock, edge.toPort, 'in');

    if (!fromType || !toType) continue;

    // Constraint: fromType.unit == toType.unit
    const result = uf.union(fromType.unit, toType.unit);
    if (!result.ok) {
      errors.push({
        kind: 'ConflictingUnits',
        blockIndex: edge.toBlock,
        portName: edge.toPort,
        message: `Conflicting units: ${result.conflict[0].kind} vs ${result.conflict[1].kind}`,
        suggestions: [
          'Insert a unit adapter between these blocks',
          'Change the source block to output the expected unit',
        ],
      });
    }
  }

  // Phase 3: Check all polymorphic ports are resolved
  const resolvedPortTypes = new Map<PortKey, SignalType>();

  for (const [key, info] of polymorphicPorts) {
    const resolvedUnit = uf.find(info.type.unit);

    if (isUnitVar(resolvedUnit)) {
      // Still unresolved - this is an error
      errors.push({
        kind: 'UnresolvedUnit',
        blockIndex: info.blockIndex,
        portName: info.portName,
        message: `Cannot resolve unit for ${info.block.type}.${info.portName}`,
        suggestions: [
          'Connect this port to a typed consumer',
          'Set an explicit unit on this block',
          'Insert an adapter to specify the target unit',
        ],
      });
    } else {
      // Resolved - store the concrete type
      resolvedPortTypes.set(key, {
        ...info.type,
        unit: resolvedUnit,
      });
    }
  }

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return { kind: 'ok', resolvedPortTypes };
}

// =============================================================================
// Helper for Pass 2 Integration
// =============================================================================

/**
 * Get the resolved type for a port.
 * First checks the resolved types map, then falls back to definition.
 * Throws if port is polymorphic but not resolved.
 */
export function getResolvedPortType(
  resolved: ResolvedTypesResult,
  block: Block,
  blockIndex: BlockIndex,
  portName: string,
  direction: 'in' | 'out'
): SignalType | null {
  const key = portKey(blockIndex, portName, direction);

  // Check resolved types first
  const resolvedType = resolved.resolvedPortTypes.get(key);
  if (resolvedType) {
    return resolvedType;
  }

  // Fall back to definition
  const defType = getDefinitionPortType(block, portName, direction);
  if (!defType) return null;

  // If definition is polymorphic but not in resolved map, that's a bug
  if (isUnitVar(defType.unit)) {
    throw new Error(
      `BUG: Polymorphic port ${block.type}.${portName} not in resolved types map. ` +
      `This indicates the constraint solver missed this port.`
    );
  }

  return defType;
}
