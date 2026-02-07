/**
 * Shared utilities for block lowering functions.
 */

import type { ValueExprId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { CanonicalType } from '../core/canonical-types';
import type { BlockIRBuilder } from '../compiler/ir/BlockIRBuilder';
import { requireInst } from '../core/canonical-types';

export function withoutContract(type: CanonicalType): CanonicalType {
  const { contract: _contract, ...rest } = type as CanonicalType & { contract?: unknown };
  return rest;
}

/**
 * Align two inputs for a binary operation by broadcasting if needed.
 *
 * Handles all four cardinality combinations:
 * - signal + signal → pass through
 * - field + field → validate matching domains, pass through
 * - signal + field → broadcast signal to field extent
 * - field + signal → broadcast signal to field extent
 *
 * Returns [alignedA, alignedB] ready for kernelZip.
 */
export function alignInputs(
  aId: ValueExprId,
  aType: CanonicalType,
  bId: ValueExprId,
  bType: CanonicalType,
  outType: CanonicalType,
  b: BlockIRBuilder,
): [ValueExprId, ValueExprId] {
  const aCard = requireInst(aType.extent.cardinality, 'cardinality');
  const bCard = requireInst(bType.extent.cardinality, 'cardinality');
  const aIsField = aCard.kind === 'many';
  const bIsField = bCard.kind === 'many';

  if (aIsField && bIsField) {
    const aInst = aCard.instance;
    const bInst = bCard.instance;
    if (aInst.instanceId !== bInst.instanceId || aInst.domainTypeId !== bInst.domainTypeId) {
      throw new Error('field+field zip requires matching instance domains');
    }
    return [aId, bId];
  }
  if (aIsField && !bIsField) {
    return [aId, b.broadcast(bId, outType)];
  }
  if (!aIsField && bIsField) {
    return [b.broadcast(aId, outType), bId];
  }
  return [aId, bId];
}

/**
 * Cardinality-aware zip: picks kernelZip, kernelZipSig, or broadcast+kernelZip
 * based on input cardinalities and the output type.
 *
 * - All inputs same cardinality as output → kernelZip
 * - Exactly one field input, rest signals, output is field → kernelZipSig
 * - Multiple field inputs mixed with signals → broadcast signals, then kernelZip
 * - Output is signal but inputs include fields → error (caller bug)
 */
export function zipAuto(
  inputs: readonly ValueExprId[],
  fn: PureFn,
  outType: CanonicalType,
  b: BlockIRBuilder,
): ValueExprId {
  const outCard = requireInst(outType.extent.cardinality, 'cardinality');

  if (outCard.kind !== 'many') {
    // Signal/zero output — all inputs must be non-field, delegate directly
    return b.kernelZip(inputs, fn, outType);
  }

  // Output is field (many). Partition inputs into fields vs signals.
  const fieldIds: ValueExprId[] = [];
  const signalIds: ValueExprId[] = [];
  for (const id of inputs) {
    const expr = b.getValueExpr(id) as { type: CanonicalType } | undefined;
    if (!expr) throw new Error(`zipAuto: invalid ValueExprId ${id}`);
    const card = requireInst(expr.type.extent.cardinality, 'cardinality');
    if (card.kind === 'many') {
      fieldIds.push(id);
    } else {
      signalIds.push(id);
    }
  }

  if (signalIds.length === 0) {
    // All inputs are fields — plain zip
    return b.kernelZip(inputs, fn, outType);
  }

  if (fieldIds.length === 1) {
    // Exactly one field + N signals → kernelZipSig
    return b.kernelZipSig(fieldIds[0], signalIds, fn, outType);
  }

  // Multiple fields + signals → broadcast signals to field extent, then zip all
  const aligned = inputs.map((id) => {
    const expr = b.getValueExpr(id) as { type: CanonicalType };
    const card = requireInst(expr.type.extent.cardinality, 'cardinality');
    if (card.kind === 'many') return id;
    return b.broadcast(id, outType);
  });
  return b.kernelZip(aligned, fn, outType);
}
