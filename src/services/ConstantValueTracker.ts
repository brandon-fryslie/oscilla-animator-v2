/**
 * Constant Value Tracker
 *
 * Tracks values for edges that were optimized away due to constant-folding.
 * This allows the debug system to show computed values for eliminated blocks.
 *
 * Example: If a Const block connected to a Multiply is folded, we can still
 * show the constant value even though the blocks don't exist at runtime.
 */

import type { Patch } from '../graph/Patch';
import type { CanonicalType } from '../core/canonical-types';
import { BOOL, CAMERA_PROJECTION, COLOR, FLOAT, VEC2, VEC3, canonicalType } from '../core/canonical-types';
import { canonicalScalar } from '../core/canonical-types/canonical-type';
import { getAnyBlockDefinition } from '../blocks/registry';

/**
 * A constant value that can be displayed in the debug panel.
 */
export interface ConstantValue {
  /** The constant value */
  value: unknown;
  /** Type of the value */
  type: CanonicalType;
  /** Why this is a constant (for display) */
  reason: 'const-block' | 'default-value' | 'computed-constant';
  /** Human-readable explanation */
  description: string;
}

interface ConstantProbe {
  edgeId: string;
  fromBlockId: string;
  fromPort: string;
}

interface ResolvedConstant {
  value: unknown;
  reason: ConstantValue['reason'];
  description: string;
}

function inferConstantType(value: unknown): CanonicalType {
  if (typeof value === 'boolean') {
    return canonicalScalar(BOOL);
  }
  if (typeof value === 'string') {
    if (value === 'orthographic' || value === 'perspective') {
      return canonicalType(CAMERA_PROJECTION);
    }
    return canonicalScalar(FLOAT);
  }
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((v) => typeof v === 'number')) {
      return canonicalScalar(VEC2);
    }
    if (value.length === 3 && value.every((v) => typeof v === 'number')) {
      return canonicalScalar(VEC3);
    }
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).r === 'number' &&
    typeof (value as Record<string, unknown>).g === 'number' &&
    typeof (value as Record<string, unknown>).b === 'number' &&
    typeof (value as Record<string, unknown>).a === 'number'
  ) {
    return canonicalType(COLOR);
  }
  return canonicalScalar(FLOAT);
}

function resolveDefaultValue(
  patch: Patch,
  blockId: string,
  inputPortId: string,
): ResolvedConstant | undefined {
  const block = patch.blocks.get(blockId as any);
  if (!block) return undefined;
  const blockDef = getAnyBlockDefinition(block.type);
  if (!blockDef) return undefined;
  const inputDef = blockDef.inputs[inputPortId];
  if (!inputDef) return undefined;

  const portDefault = block.inputPorts.get(inputPortId)?.defaultSource?.params?.value;
  if (portDefault !== undefined) {
    return {
      value: portDefault,
      reason: 'default-value',
      description: `Default value from ${block.type}.${inputPortId}`,
    };
  }

  const inputDefault = inputDef.defaultSource?.params?.value;
  if (inputDefault !== undefined) {
    return {
      value: inputDefault,
      reason: 'default-value',
      description: `Registry default source value for ${block.type}.${inputPortId}`,
    };
  }

  if (inputDef.defaultValue !== undefined) {
    return {
      value: inputDef.defaultValue,
      reason: 'default-value',
      description: `Registry default value for ${block.type}.${inputPortId}`,
    };
  }

  return undefined;
}

function resolveOutputConstant(
  patch: Patch,
  blockId: string,
  outputPort: string,
  incomingEdgesByTarget: ReadonlyMap<string, ReadonlyArray<{ fromBlockId: string; fromPort: string }>>,
  cache: Map<string, ResolvedConstant | null>,
  visiting: Set<string>,
): ResolvedConstant | undefined {
  const cacheKey = `${blockId}:${outputPort}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached ?? undefined;
  }
  if (visiting.has(cacheKey)) {
    return undefined;
  }

  const block = patch.blocks.get(blockId as any);
  if (!block) {
    cache.set(cacheKey, null);
    return undefined;
  }
  const blockDef = getAnyBlockDefinition(block.type);
  if (!blockDef) {
    cache.set(cacheKey, null);
    return undefined;
  }

  visiting.add(cacheKey);

  const resolveInput = (inputPortId: string): ResolvedConstant | undefined => {
    const incoming = incomingEdgesByTarget.get(`${blockId}:${inputPortId}`) ?? [];
    if (incoming.length === 1) {
      const [source] = incoming;
      return resolveOutputConstant(
        patch,
        source.fromBlockId,
        source.fromPort,
        incomingEdgesByTarget,
        cache,
        visiting,
      );
    }
    if (incoming.length > 1) {
      return undefined;
    }
    return resolveDefaultValue(patch, blockId, inputPortId);
  };

  const numeric = (inputPortId: string): number | undefined => {
    const input = resolveInput(inputPortId);
    if (!input || typeof input.value !== 'number') return undefined;
    return input.value;
  };

  let resolved: ResolvedConstant | undefined;

  // [LAW:one-source-of-truth] Constant value derivation dispatches on canonical
  // block definitions/types, not legacy aliases.
  if (block.type === 'Const' && outputPort === 'out') {
    const value = (block.params as Record<string, unknown>).value;
    if (value !== undefined) {
      resolved = {
        value,
        reason: 'const-block',
        description: 'Constant value from Const block',
      };
    }
  }

  if (!resolved && block.type === 'CameraProjectionConst' && outputPort === 'out') {
    const mode = (block.params as Record<string, unknown>).value;
    if (mode === 1) {
      resolved = {
        value: 'perspective',
        reason: 'const-block',
        description: 'Constant camera projection mode',
      };
    } else if (mode === 0 || mode === undefined) {
      resolved = {
        value: 'orthographic',
        reason: 'const-block',
        description: 'Constant camera projection mode',
      };
    }
  }

  if (!resolved && outputPort === 'out') {
    switch (block.type) {
      case 'Add': {
        const a = numeric('a');
        const b = numeric('b');
        if (a !== undefined && b !== undefined) {
          resolved = { value: a + b, reason: 'computed-constant', description: `Computed Add(${a}, ${b})` };
        }
        break;
      }
      case 'Subtract': {
        const a = numeric('a');
        const b = numeric('b');
        if (a !== undefined && b !== undefined) {
          resolved = { value: a - b, reason: 'computed-constant', description: `Computed Subtract(${a}, ${b})` };
        }
        break;
      }
      case 'Multiply': {
        const a = numeric('a');
        const b = numeric('b');
        if (a !== undefined && b !== undefined) {
          resolved = { value: a * b, reason: 'computed-constant', description: `Computed Multiply(${a}, ${b})` };
        }
        break;
      }
      case 'Divide': {
        const a = numeric('a');
        const b = numeric('b');
        if (a !== undefined && b !== undefined && b !== 0) {
          resolved = { value: a / b, reason: 'computed-constant', description: `Computed Divide(${a}, ${b})` };
        }
        break;
      }
      case 'Lerp': {
        const a = numeric('a');
        const b = numeric('b');
        const t = numeric('t');
        if (a !== undefined && b !== undefined && t !== undefined) {
          resolved = {
            value: a + (b - a) * t,
            reason: 'computed-constant',
            description: `Computed Lerp(${a}, ${b}, ${t})`,
          };
        }
        break;
      }
      default:
        break;
    }
  }

  if (!resolved && block.type === 'Sin' && outputPort === 'result') {
    const input = numeric('input');
    if (input !== undefined) {
      resolved = { value: Math.sin(input), reason: 'computed-constant', description: `Computed Sin(${input})` };
    }
  }

  if (!resolved && block.type === 'Cos' && outputPort === 'result') {
    const input = numeric('input');
    if (input !== undefined) {
      resolved = { value: Math.cos(input), reason: 'computed-constant', description: `Computed Cos(${input})` };
    }
  }

  visiting.delete(cacheKey);
  cache.set(cacheKey, resolved ?? null);
  return resolved;
}

/**
 * Extract constant values from eliminated blocks.
 *
 * This is a best-effort attempt to provide debug values for edges
 * that don't map to runtime slots. It handles:
 * - Const blocks (easy - just read the parameter)
 * - Default sources with constant values
 * - Other simple constant expressions
 *
 * @param patch - Source patch
 * @param unmappedEdges - Edges that couldn't be mapped
 * @returns Map from edge ID to constant value
 */
export function extractConstantValues(
  patch: Patch,
  unmappedEdges: ConstantProbe[]
): Map<string, ConstantValue> {
  const constants = new Map<string, ConstantValue>();
  const incomingEdgesByTarget = new Map<string, Array<{ fromBlockId: string; fromPort: string }>>();
  for (const edge of patch.edges) {
    if (!edge.enabled) continue;
    const key = `${edge.to.blockId}:${edge.to.slotId}`;
    const existing = incomingEdgesByTarget.get(key);
    const source = { fromBlockId: edge.from.blockId, fromPort: edge.from.slotId };
    if (existing) {
      existing.push(source);
    } else {
      incomingEdgesByTarget.set(key, [source]);
    }
  }
  const resolutionCache = new Map<string, ResolvedConstant | null>();
  const visiting = new Set<string>();

  for (const unmapped of unmappedEdges) {
    const resolved = resolveOutputConstant(
      patch,
      unmapped.fromBlockId,
      unmapped.fromPort,
      incomingEdgesByTarget,
      resolutionCache,
      visiting,
    );
    if (!resolved) continue;

    constants.set(unmapped.edgeId, {
      value: resolved.value,
      type: inferConstantType(resolved.value),
      reason: resolved.reason,
      description: resolved.description,
    });
  }

  return constants;
}
