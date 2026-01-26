/**
 * Domain Registry
 *
 * Defines the domain type hierarchy and intrinsic properties.
 * This is compile-time configuration, not runtime state.
 *
 * See: design-docs/WHAT-IS-A-DOMAIN.md for conceptual foundation
 */

import type { PayloadType } from './canonical-types';
import { FLOAT, INT, BOOL, VEC2 } from './canonical-types';

// =============================================================================
// Domain Type System
// =============================================================================

/**
 * Brand for domain type identifiers.
 * Domain types classify elements (shape, circle, control, event).
 */
export type DomainTypeId = string & { readonly __brand: 'DomainTypeId' };

/**
 * Brand for instance identifiers.
 * Instances are specific instantiations of a domain type (count, layout).
 */
export type InstanceId = string & { readonly __brand: 'InstanceId' };

/**
 * Factory for DomainTypeId.
 */
export function domainTypeId(s: string): DomainTypeId {
  return s as DomainTypeId;
}

/**
 * Factory for InstanceId.
 */
export function instanceId(s: string): InstanceId {
  return s as InstanceId;
}

/**
 * Intrinsic property specification.
 * Intrinsics are properties granted by domain membership.
 */
export interface IntrinsicSpec {
  readonly name: string;
  readonly type: PayloadType;
  readonly computation: 'inherent' | 'derived';
}

/**
 * Domain type specification.
 * Defines the classification, parent (for subtyping), and intrinsic properties.
 */
export interface DomainType {
  readonly id: DomainTypeId;
  readonly parent: DomainTypeId | null;
  readonly intrinsics: readonly IntrinsicSpec[];
}

// =============================================================================
// Domain Type Constants
// =============================================================================

export const DOMAIN_SHAPE = domainTypeId('shape');
export const DOMAIN_CIRCLE = domainTypeId('circle');
export const DOMAIN_RECTANGLE = domainTypeId('rectangle');
export const DOMAIN_CONTROL = domainTypeId('control');
export const DOMAIN_EVENT = domainTypeId('event');

// =============================================================================
// Intrinsic Definitions
// =============================================================================

const INTRINSICS = {
  position: { name: 'position', type: VEC2, computation: 'inherent' as const },
  bounds: { name: 'bounds', type: VEC2, computation: 'derived' as const },
  area: { name: 'area', type: FLOAT, computation: 'derived' as const },
  index: { name: 'index', type: INT, computation: 'inherent' as const },
  normalizedIndex: { name: 'normalizedIndex', type: FLOAT, computation: 'derived' as const },
  radius: { name: 'radius', type: FLOAT, computation: 'inherent' as const },
  width: { name: 'width', type: FLOAT, computation: 'inherent' as const },
  height: { name: 'height', type: FLOAT, computation: 'inherent' as const },
  value: { name: 'value', type: FLOAT, computation: 'inherent' as const },
  min: { name: 'min', type: FLOAT, computation: 'inherent' as const },
  max: { name: 'max', type: FLOAT, computation: 'inherent' as const },
  time: { name: 'time', type: FLOAT, computation: 'inherent' as const },
  fired: { name: 'fired', type: BOOL, computation: 'inherent' as const },
} as const;

// =============================================================================
// Domain Type Registry
// =============================================================================

const DOMAIN_TYPES: ReadonlyMap<DomainTypeId, DomainType> = new Map([
  [DOMAIN_SHAPE, {
    id: DOMAIN_SHAPE,
    parent: null,
    intrinsics: [
      INTRINSICS.position,
      INTRINSICS.bounds,
      INTRINSICS.area,
      INTRINSICS.index,
      INTRINSICS.normalizedIndex,
    ],
  }],
  [DOMAIN_CIRCLE, {
    id: DOMAIN_CIRCLE,
    parent: DOMAIN_SHAPE,
    intrinsics: [INTRINSICS.radius],  // Plus inherited from shape
  }],
  [DOMAIN_RECTANGLE, {
    id: DOMAIN_RECTANGLE,
    parent: DOMAIN_SHAPE,
    intrinsics: [INTRINSICS.width, INTRINSICS.height],
  }],
  [DOMAIN_CONTROL, {
    id: DOMAIN_CONTROL,
    parent: null,
    intrinsics: [
      INTRINSICS.index,
      INTRINSICS.position,
      INTRINSICS.value,
      INTRINSICS.min,
      INTRINSICS.max,
    ],
  }],
  [DOMAIN_EVENT, {
    id: DOMAIN_EVENT,
    parent: null,
    intrinsics: [
      INTRINSICS.time,
      INTRINSICS.fired,
    ],
  }],
]);

// =============================================================================
// Registry API
// =============================================================================

/**
 * Get domain type specification by ID.
 */
export function getDomainType(id: DomainTypeId): DomainType | undefined {
  return DOMAIN_TYPES.get(id);
}

/**
 * Check if sub is a subdomain of parent (supports hierarchy).
 * Example: circle is a subdomain of shape.
 */
export function isSubdomainOf(sub: DomainTypeId, parent: DomainTypeId): boolean {
  if (sub === parent) return true;
  const subType = DOMAIN_TYPES.get(sub);
  if (!subType || !subType.parent) return false;
  return isSubdomainOf(subType.parent, parent);
}

/**
 * Get all intrinsics for a domain type, including inherited.
 */
export function getIntrinsics(domainType: DomainTypeId): readonly IntrinsicSpec[] {
  const result: IntrinsicSpec[] = [];
  let current: DomainTypeId | null = domainType;

  while (current) {
    const type = DOMAIN_TYPES.get(current);
    if (!type) break;
    result.push(...type.intrinsics);
    current = type.parent;
  }

  return result;
}

/**
 * Check if a domain type has a specific intrinsic property.
 */
export function hasIntrinsic(domainType: DomainTypeId, intrinsicName: string): boolean {
  return getIntrinsics(domainType).some(i => i.name === intrinsicName);
}
