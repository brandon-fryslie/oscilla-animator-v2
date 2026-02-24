import type { StateMapping } from '../compiler/ir/types';
import { wrapPhase } from './timeResolution';

function resolveStateKind(mapping: StateMapping | undefined): string {
  if (!mapping?.stateId) {
    return '';
  }

  const stateId = String(mapping.stateId);
  const separator = stateId.lastIndexOf(':');
  const kind = separator >= 0 ? stateId.slice(separator + 1) : stateId;
  return kind.toLowerCase();
}

export function shouldWrapPhaseState(mapping: StateMapping | undefined): boolean {
  const stateKind = resolveStateKind(mapping);
  return stateKind === 'phasor' || stateKind === 'phase' || stateKind.endsWith('phase');
}

export function applyStateWritePolicy(mapping: StateMapping | undefined, value: number): number {
  // [LAW:single-enforcer] Runtime state writes are normalized through one policy
  // boundary so phase-wrap invariants do not depend on individual block lowerings.
  return shouldWrapPhaseState(mapping) ? wrapPhase(value) : value;
}
