# Core Type System - Unimplemented Context

## Spec Documents Referenced

1. **design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md**
   - Defines the 5-axis semantic model
   - States perspective and branch are v1+ features
   - Lines 40-50: Perspective for camera/viewpoint semantics
   - Lines 48-50: Branch for preview/physics/undo safety

2. **design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/t2_perspective.md**
   - Explicit v0 vs v1+ distinction
   - v0: only `{ kind: 'default' }`
   - v1+: world | view(id) | screen(id)
   - Quote: "These are included in the canonical spec to establish the axis's intended domain, even though v0 only uses default."

3. **design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/t2_branch.md**
   - Explicit v0 vs v1+ distinction
   - v0: only `{ kind: 'default' }`
   - v1+: main | preview(id) | checkpoint(id) | undo(id) | prediction(id) | speculative(id) | replay(id)
   - Quote: "Only the default branch exists in v0. All values share one timeline."

## Current Implementation

### Perspective Axis
File: src/core/canonical-types.ts:653-657

```typescript
export type PerspectiveValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };
```

### Branch Axis
File: src/core/canonical-types.ts:664-668

```typescript
export type BranchValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };
```

Both use a generic `specific` variant with InstanceRef instead of the named variants in the v1+ spec.

## Why This Is Unimplemented (Not Critical)

1. **Spec explicitly defers to v1+**: The spec documents acknowledge v0 has simplified axes
2. **v0 requirements met**: Default-only values work for current use cases
3. **Generic pattern provides extensibility**: The `specific` variant allows future expansion without breaking changes
4. **No runtime impact**: All v0 code uses default values; specific variants unused

## Implementation Notes for v1+

When implementing full perspective/branch:

1. **Option A**: Replace `specific` with named variants per spec
   - Pro: Matches spec exactly
   - Con: Breaks any code using generic pattern

2. **Option B**: Keep `specific` pattern, add helpers
   - Pro: Backward compatible
   - Con: Less self-documenting than named variants

3. **Option C**: Hybrid - keep both
   - `specific` for generic extensibility
   - Named constructors/guards for common cases
   - Example: `worldPerspective()`, `isViewPerspective()`

## Related Files

- src/core/canonical-types.ts - Type definitions
- src/core/ids.ts - Branded ID types (would need ViewId, ScreenId, PreviewId, etc. for v1+)
- design-docs/canonical-types/11-Perspective.md - Full perspective axis spec

## Verification

No production code currently uses perspective or branch for anything other than default values. Grep confirms:

```bash
# No usage of perspective.kind === 'specific'
grep -r "perspective.*specific" src --include="*.ts" --exclude="*test*"
# Returns: only type definitions

# No usage of branch.kind === 'specific'
grep -r "branch.*specific" src --include="*.ts" --exclude="*test*"
# Returns: only type definitions
```

All runtime code uses default values, confirming v0 scope is correct.
