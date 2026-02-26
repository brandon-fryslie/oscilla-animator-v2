import { describe, expect, it } from 'vitest';
import {
  FLOAT,
  HANDLE,
  canonicalMany,
  canonicalType,
  instanceRef,
  unitNone,
} from '../../../../core/canonical-types';
import { isEdgeTypeCompatible } from '../type-compatibility';

describe('type compatibility handle semantics', () => {
  it('fails float↔handle compatibility to prevent float-as-shape wiring', () => {
    const floatOne = canonicalType(FLOAT);
    const handleOne = canonicalType(HANDLE);

    expect(isEdgeTypeCompatible(floatOne, handleOne)).toBe(false);
    expect(isEdgeTypeCompatible(handleOne, floatOne)).toBe(false);
  });

  it('supports one->many Field<Handle> when broadcast is allowed', () => {
    const handleOne = canonicalType(HANDLE);
    const handleMany = canonicalMany(
      HANDLE,
      unitNone(),
      instanceRef('domain:control', 'instance:shape-array'),
    );

    expect(isEdgeTypeCompatible(handleOne, handleMany, false)).toBe(false);
    expect(isEdgeTypeCompatible(handleOne, handleMany, true)).toBe(true);
  });
});
