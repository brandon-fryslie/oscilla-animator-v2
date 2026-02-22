/**
 * Lens Utilities for Editor UI
 *
 * Provides helper functions for lens management in the editor.
 */

import type { InferenceCanonicalType, InferenceUnitType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar } from '../../core/inference-types';
import {
  isAxisInst,
  isAxisVar,
  unitsEqual,
  payloadsEqual,
  cardinalitiesEqual,
  temporalitiesEqual,
} from '../../core/canonical-types';
import { getBlockTypesByCategory, requireAnyBlockDef } from '../../blocks/registry';
import type { LensAttachment } from '../../graph/Patch';

/**
 * Information about an available lens type for UI display.
 */
export interface LensTypeInfo {
  /** Block type identifier */
  blockType: string;
  /** Human-readable label */
  label: string;
  /** Description of what the lens does */
  description: string;
  /** Input type the lens accepts */
  inputType: InferenceCanonicalType;
  /** Output type the lens produces */
  outputType: InferenceCanonicalType;
}

export interface LensMenuGroups {
  common: LensTypeInfo[];
  others: LensTypeInfo[];
}

const COMMON_LENS_TYPES: readonly string[] = [
  'ScaleBias',
  'Clamp',
  'Wrap01',
  'Deadzone',
];

/**
 * Get all available lens types for UI selection.
 * Includes both adapter blocks (type converters) and lens blocks (value shapers).
 *
 * @returns Array of lens type info, sorted by label
 */
export function getAvailableLensTypes(): LensTypeInfo[] {
  const adapterBlocks = getBlockTypesByCategory('adapter');
  const lensBlocks = getBlockTypesByCategory('lens');
  const allBlocks = [...adapterBlocks, ...lensBlocks];

  return allBlocks
    .map(def => ({
      blockType: def.type,
      label: def.label,
      description: def.description ?? '',
      inputType: def.inputs['in']?.type,
      outputType: def.outputs['out']?.type,
    }))
    .filter((info): info is LensTypeInfo => !!info.inputType && !!info.outputType) // Only include valid lenses
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Get a human-readable label for a lens type.
 *
 * @param lensType - Block type identifier
 * @returns Human-readable label
 */
export function getLensLabel(lensType: string): string {
  const lenses = getAvailableLensTypes();
  const lens = lenses.find(l => l.blockType === lensType);
  return lens?.label ?? lensType.replace('Adapter_', '').replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Get default params for a lens block by reading its non-primary input defaults.
 * Primary signal input is conventionally "in" and is excluded.
 */
export function getLensDefaultParams(lensType: string): Record<string, unknown> | undefined {
  const lensDef = requireAnyBlockDef(lensType);
  const params: Record<string, unknown> = {};
  for (const [inputId, inputDef] of Object.entries(lensDef.inputs)) {
    if (inputId === 'in') continue;
    if (inputDef.defaultValue !== undefined) {
      params[inputId] = inputDef.defaultValue;
    }
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Build all accepted source-address forms for a connection.
 * // [LAW:one-source-of-truth] Address construction is centralized to avoid per-callsite drift.
 */
export function buildLensSourceAddresses(
  sourceBlockId: string,
  sourcePortId: string,
  sourceDisplayName?: string,
): readonly string[] {
  const addresses = [`v1:blocks.${sourceBlockId}.outputs.${sourcePortId}`];
  if (sourceDisplayName && sourceDisplayName !== sourceBlockId) {
    addresses.push(`v1:blocks.${sourceDisplayName}.outputs.${sourcePortId}`);
  }
  return addresses;
}

/**
 * Returns true when a lens attachment targets the given source connection.
 */
export function lensTargetsConnection(
  lens: LensAttachment,
  sourceBlockId: string,
  sourcePortId: string,
  sourceDisplayName?: string,
): boolean {
  const accepted = buildLensSourceAddresses(sourceBlockId, sourcePortId, sourceDisplayName);
  return accepted.includes(lens.sourceAddress);
}

/**
 * Check if a lens can be applied between two types.
 *
 * @param sourceType - Output type from source port
 * @param lensInputType - Input type the lens accepts
 * @param lensOutputType - Output type the lens produces
 * @param targetType - Input type of target port
 * @returns true if lens is compatible
 */
export function canApplyLens(
  sourceType: InferenceCanonicalType,
  lensInputType: InferenceCanonicalType,
  lensOutputType: InferenceCanonicalType,
  targetType: InferenceCanonicalType
): boolean {
  // Match in two phases with shared var bindings from the lens types:
  // source -> lens input, then lens output -> target.
  const env: MatchEnv = {
    payloadVars: new Map(),
    unitVars: new Map(),
    cardVars: new Map(),
    tempVars: new Map(),
    bindingVars: new Map(),
    perspectiveVars: new Map(),
    branchVars: new Map(),
  };
  const sourceMatches = matchesLensPattern(sourceType, lensInputType, env);
  const outputMatches = matchesLensPattern(targetType, lensOutputType, env);
  return sourceMatches && outputMatches;
}

/**
 * Check if two signal types match.
 * Handles payload and unit comparison with full structural equality.
 */
interface MatchEnv {
  payloadVars: Map<string, import('../../core/inference-types').InferencePayloadType>;
  unitVars: Map<string, InferenceUnitType>;
  cardVars: Map<string, unknown>;
  tempVars: Map<string, unknown>;
  bindingVars: Map<string, unknown>;
  perspectiveVars: Map<string, unknown>;
  branchVars: Map<string, unknown>;
}

function matchesLensPattern(
  actual: InferenceCanonicalType,
  pattern: InferenceCanonicalType,
  env: MatchEnv,
): boolean {
  if (!matchPayload(actual.payload, pattern.payload, env)) return false;
  if (!matchUnit(actual.unit, pattern.unit, env)) return false;
  if (!matchAxis(actual.extent.cardinality, pattern.extent.cardinality, env.cardVars, cardinalitiesEqual)) return false;
  if (!matchAxis(actual.extent.temporality, pattern.extent.temporality, env.tempVars, temporalitiesEqual)) return false;
  if (!matchAxis(actual.extent.binding, pattern.extent.binding, env.bindingVars, jsonEqual)) return false;
  if (!matchAxis(actual.extent.perspective, pattern.extent.perspective, env.perspectiveVars, jsonEqual)) return false;
  if (!matchAxis(actual.extent.branch, pattern.extent.branch, env.branchVars, jsonEqual)) return false;
  return true;
}

function matchPayload(
  actual: import('../../core/inference-types').InferencePayloadType,
  pattern: import('../../core/inference-types').InferencePayloadType,
  env: MatchEnv,
): boolean {
  if (isPayloadVar(pattern)) {
    const bound = env.payloadVars.get(pattern.id);
    if (!bound) {
      env.payloadVars.set(pattern.id, actual);
      return true;
    }
    if (isPayloadVar(bound) || isPayloadVar(actual)) return true;
    return payloadsEqual(bound as import('../../core/canonical-types').PayloadType, actual as import('../../core/canonical-types').PayloadType);
  }
  if (isPayloadVar(actual)) return true;
  return payloadsEqual(actual as import('../../core/canonical-types').PayloadType, pattern as import('../../core/canonical-types').PayloadType);
}

function matchUnit(
  actual: InferenceUnitType,
  pattern: InferenceUnitType,
  env: MatchEnv,
): boolean {
  if (isUnitVar(pattern)) {
    const bound = env.unitVars.get(pattern.id);
    if (!bound) {
      env.unitVars.set(pattern.id, actual);
      return true;
    }
    if (isUnitVar(bound) || isUnitVar(actual)) return true;
    return unitsEqual(bound as import('../../core/canonical-types').UnitType, actual as import('../../core/canonical-types').UnitType);
  }
  if (isUnitVar(actual)) return true;
  return unitsEqual(actual as import('../../core/canonical-types').UnitType, pattern as import('../../core/canonical-types').UnitType);
}

function matchAxis<T, V extends string>(
  actual: import('../../core/canonical-types').Axis<T, V>,
  pattern: import('../../core/canonical-types').Axis<T, V>,
  env: Map<string, unknown>,
  equals: (a: T, b: T) => boolean,
): boolean {
  if (isAxisVar(pattern)) {
    const key = String(pattern.var);
    const bound = env.get(key) as T | undefined;
    if (!isAxisInst(actual)) {
      return bound === undefined || true;
    }
    if (bound === undefined) {
      env.set(key, actual.value as unknown);
      return true;
    }
    return equals(bound, actual.value);
  }
  if (!isAxisInst(actual)) {
    return true;
  }
  if (!isAxisInst(pattern)) {
    return true;
  }
  return equals(actual.value, pattern.value);
}

function jsonEqual<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Find compatible lenses for a connection.
 *
 * @param sourceType - Output type from source port
 * @param targetType - Input type of target port
 * @returns Array of compatible lens types
 */
export function findCompatibleLenses(
  sourceType: InferenceCanonicalType,
  targetType: InferenceCanonicalType
): LensTypeInfo[] {
  const allLenses = getAvailableLensTypes();
  return allLenses.filter(lens =>
    canApplyLens(sourceType, lens.inputType, lens.outputType, targetType)
  );
}

/**
 * Split compatible lenses into top-level common actions and overflow submenu actions.
 * // [LAW:dataflow-not-control-flow] Menu structure is a pure derivation of compatible lens data.
 */
export function groupLensMenuOptions(compatibleLenses: readonly LensTypeInfo[]): LensMenuGroups {
  const byType = new Map(compatibleLenses.map((lens) => [lens.blockType, lens]));
  const common = COMMON_LENS_TYPES
    .map((type) => byType.get(type))
    .filter((lens): lens is LensTypeInfo => lens != null);
  const commonSet = new Set(common.map((lens) => lens.blockType));
  const others = compatibleLenses.filter((lens) => !commonSet.has(lens.blockType));
  return { common, others };
}
