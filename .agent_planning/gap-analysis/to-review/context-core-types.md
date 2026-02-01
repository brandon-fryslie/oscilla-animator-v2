# Core Type System - To Review Context

## 1. InstanceRef Field Ordering

### Spec Version
design-docs/canonical-types/00-exhaustive-type-system.md:79-82

```typescript
export interface InstanceRef {
  readonly instanceId: InstanceId;
  readonly domainTypeId: DomainTypeId;
}
```

### Implementation Version
src/core/canonical-types.ts:790-793

```typescript
export interface InstanceRef {
  readonly domainTypeId: DomainTypeId;
  readonly instanceId: InstanceId;
}
```

### Analysis

The implementation reverses the order (type first, then instance). This is arguably more intuitive because:
- Domain type is the "class" or "category"
- Instance is the "specific member" of that category
- Type-then-instance follows OOP naming patterns (ClassName.instanceName)

**Impact**: None. TypeScript object field order doesn't affect:
- Runtime behavior (objects are unordered maps)
- Serialization (JSON serializers don't preserve field order semantics)
- Type checking (structural typing ignores field order)

**Recommendation**: Keep current implementation. It's arguably better ergonomics.

---

## 2. Extended Unit Types

### Spec Version (Minimal)
design-docs/canonical-types/00-exhaustive-type-system.md:138-143

```typescript
export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' };
```

### Implementation Version (Extended)
src/core/canonical-types.ts:53-61

```typescript
export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'count' }  // ADDED
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' }
  | { readonly kind: 'space'; readonly unit: 'ndc' | 'world' | 'view'; readonly dims: 2 | 3 }  // ADDED
  | { readonly kind: 'color'; readonly unit: 'rgba01' };  // ADDED
```

### Rationale for Extensions

From src/core/canonical-types.ts:47-49 header comment:
> "Restructured to 8 structured kinds (items #18, #19):
> - Simple: none, scalar, norm01, count
> - Structured: angle, time, space, color"

#### count
- **Use case**: Integer indices and counts (distinct from dimensionless scalar)
- **Validation**: Ensures int payload with semantic count meaning
- **Example**: Array index, loop iteration count

#### space
- **Use case**: Spatial coordinates with dimension awareness
- **Validation**: Payload must be vec2 or vec3, matching dims
- **Example**: vec2 with unit='ndc' dims=2 (normalized device coords)
- **Future**: Ties into perspective axis (world/view space distinction)

#### color
- **Use case**: RGBA color values with well-defined range
- **Validation**: Payload must be color (4-component)
- **Example**: color with unit='rgba01' (each channel [0,1])

### Spec vs Implementation Discrepancy

The spec shows a minimal set (5 unit types), while implementation has 8.

**Possible explanations**:
1. Spec shows minimal viable set, implementation adds production-ready extensions
2. Spec predates these extensions (items #18, #19 referenced in code)
3. These extensions were added after initial spec writing

### Evidence in Codebase

Unit validation uses extended set: src/core/canonical-types.ts:248-256

```typescript
const ALLOWED_UNITS: Record<PayloadKind, readonly UnitType['kind'][]> = {
  float: ['scalar', 'norm01', 'angle', 'time'],
  int: ['count', 'time'],
  vec2: ['space'],
  vec3: ['space'],
  color: ['color'],
  bool: ['none'],
  cameraProjection: ['none'],
};
```

This shows:
- int → count is a canonical pairing
- vec2/vec3 → space is enforced
- color → color is enforced

Without these unit types, the type system couldn't distinguish:
- int index (count) from int timestamp (time)
- vec2 position (space) from generic vec2
- color RGBA from generic 4-float array

### Impact Analysis

**If removed** (to match minimal spec):
- Loss of semantic precision
- Payload-unit validation becomes weaker
- Type errors harder to catch

**If kept**:
- More precise type checking
- Better error messages
- Stronger invariants

**Recommendation**: Keep extended units. They are well-motivated and improve type safety. Update spec to document them as canonical additions, not extensions.

---

## 3. Generic 'specific' Pattern for Perspective/Branch

### Spec v1+ Design

design-docs/canonical-types/00-exhaustive-type-system.md shows named variants:

```typescript
type PerspectiveValue =
  | { kind: 'default' }
  | { kind: 'world' }
  | { kind: 'view'; viewId: ViewId }
  | { kind: 'screen'; screenId: ScreenId };

type BranchValue =
  | { kind: 'default' }
  | { kind: 'main' }
  | { kind: 'preview'; previewId: PreviewId }
  | { kind: 'checkpoint'; checkpointId: CheckpointId }
  // ... etc
```

### Implementation Pattern

src/core/canonical-types.ts uses generic extensibility:

```typescript
export type PerspectiveValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };

export type BranchValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };
```

### Comparison

| Aspect | Named Variants (Spec) | Generic Specific (Impl) |
|--------|----------------------|------------------------|
| Explicitness | High - each variant self-documenting | Low - requires instance lookup |
| Extensibility | Low - new variants require type changes | High - InstanceRef handles any domain |
| Type Safety | High - discriminate by kind | Medium - must validate instance domain |
| Consistency | Breaks pattern (other axes don't have named variants) | Matches cardinality.many pattern |

### InstanceRef Alignment

The implementation pattern aligns with how cardinality.many works:

```typescript
type CardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceRef };
```

Using `specific` with InstanceRef for perspective/branch follows the same pattern:
- Generic container (specific, many)
- Specific identity via InstanceRef
- Domain type distinguishes semantics

### Trade-offs

**Spec approach (named variants)**:
- ✓ Self-documenting code
- ✓ Exhaustive switch checking
- ✗ Requires anticipating all future variants
- ✗ Breaking change to add new variant

**Implementation approach (generic)**:
- ✓ Domain-extensible without type changes
- ✓ Consistent with InstanceRef pattern
- ✗ Less self-documenting
- ✗ Requires runtime domain validation

### Hybrid Solution

Possible middle ground:
1. Keep generic `specific` type
2. Add domain-specific constructors and type guards
3. Add constants for well-known domains

Example:

```typescript
// Type (generic)
type PerspectiveValue =
  | { kind: 'default' }
  | { kind: 'specific'; instance: InstanceRef };

// Well-known domains
const PERSPECTIVE_WORLD = domainTypeId('perspective:world');
const PERSPECTIVE_VIEW = domainTypeId('perspective:view');
const PERSPECTIVE_SCREEN = domainTypeId('perspective:screen');

// Constructors
function worldPerspective(): PerspectiveValue {
  return { kind: 'specific', instance: instanceRef(PERSPECTIVE_WORLD, 'world') };
}

function viewPerspective(viewId: string): PerspectiveValue {
  return { kind: 'specific', instance: instanceRef(PERSPECTIVE_VIEW, viewId) };
}

// Type guards
function isWorldPerspective(p: PerspectiveValue): boolean {
  return p.kind === 'specific' && p.instance.domainTypeId === PERSPECTIVE_WORLD;
}
```

This gives:
- ✓ Generic extensibility
- ✓ Self-documenting helpers
- ✓ Exhaustive checking via well-known constants
- ✓ No breaking changes for new variants

### Recommendation

TO-REVIEW with user. Both approaches have merit:

1. **Stick with generic pattern**: Simpler, more extensible, consistent with InstanceRef usage elsewhere
2. **Switch to named variants**: Matches spec, more self-documenting, better exhaustiveness checking
3. **Hybrid approach**: Best of both, but more code to maintain

Given v0 only uses default values, this decision can be deferred until v1+ implementation begins.

---

## Related Spec Documents

- design-docs/canonical-types/11-Perspective.md - Full perspective axis spec
- design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md - Overall axis design philosophy
- design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/t2_perspective.md
- design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/t2_branch.md

## Related Code

- src/core/canonical-types.ts - Type definitions
- src/core/ids.ts - Branded ID types
- src/core/domain-registry.ts - Domain type system (could define perspective/branch domains)
