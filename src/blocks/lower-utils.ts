/**
 * Shared utilities for block lowering functions.
 */

import type { ValueExprId } from '../compiler/ir/Indices';
import type { CanonicalType } from '../core/canonical-types';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import { requireInst } from '../core/canonical-types';

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
  b: IRBuilder,
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
