import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';
import { instanceRef, requireInst } from '../../core/canonical-types';
import type { LowerCtx } from '../registry';

export interface ResolvedManyFieldInstance {
  readonly instanceId: import('../../compiler/ir/Indices').InstanceId;
  readonly instanceDecl: import('../../compiler/ir/types').InstanceDecl;
  readonly ref: ReturnType<typeof instanceRef>;
}

export function resolveManyFieldInstance(
  ctx: LowerCtx,
  input: ValueRefExpr,
  inputName: string,
): ResolvedManyFieldInstance {
  const card = requireInst(input.type.extent.cardinality, 'cardinality');
  if (card.kind !== 'many') {
    throw new Error(`${inputName} must be a field (many cardinality), got ${card.kind}`);
  }
  const inputInstanceRef = card.instance;
  const inputInstanceId = (
    typeof inputInstanceRef === 'object'
      ? inputInstanceRef.instanceId
      : inputInstanceRef
  );
  if (!inputInstanceId) {
    throw new Error(`${inputName} is missing instance context`);
  }
  const candidateInstanceIds: Array<import('../../compiler/ir/Indices').InstanceId | undefined> = [
    ctx.inferredInstance,
    ctx.instance,
    inputInstanceId,
  ];
  const resolvedInstanceId = candidateInstanceIds.find((candidate) => (
    candidate !== undefined && ctx.instances.has(candidate)
  ));
  if (!resolvedInstanceId) {
    throw new Error(`${inputName} references unknown instance '${String(inputInstanceId)}'`);
  }
  // [LAW:single-enforcer] Instance binding is decided at lowering context
  // boundaries (inferred/contextual first, cardinality fallback).
  const instanceId = resolvedInstanceId;
  const instanceDecl = ctx.instances.get(instanceId);
  if (!instanceDecl) {
    throw new Error(`${inputName} references unknown instance '${String(instanceId)}'`);
  }
  const ref = instanceRef(instanceDecl.domainType as string, instanceId as string);
  return { instanceId, instanceDecl, ref };
}
