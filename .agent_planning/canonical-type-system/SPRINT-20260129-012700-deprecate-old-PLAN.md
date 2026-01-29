# Sprint: deprecate-old-constructors - Deprecate Old Constructors

**Generated**: 2026-01-29T01:26:00Z
**Confidence**: HIGH: 4, MEDIUM: 0, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ Staged deprecation approach is right: introduce canonical, bridge, delete legacy
- ✓ "Stop new uses first" strategy prevents backsliding
- **LOCKED**: Hard rule — NO new feature work may touch old types after deprecation flag enabled

**CRITICAL PROCESS RULE** (from review):
> No new feature work may land that touches old types after the deprecation flag is enabled (or you will never finish the migration). This is process, but it's the only thing that consistently kills "just this one exception."

---

## Sprint Goal

Mark old constructor functions as deprecated and migrate call sites to the canonical constructors.

---

## Scope

**Deliverables:**
1. Add @deprecated JSDoc to old constructors
2. Find and update all call sites
3. Eventually remove deprecated functions

---

## Work Items

### P0: Deprecate signalTypeSignal → canonicalSignal

**Confidence**: HIGH

```typescript
/**
 * @deprecated Use canonicalSignal() instead
 */
export function signalTypeSignal(...)
```

**Acceptance Criteria:**
- [ ] @deprecated JSDoc added
- [ ] All call sites migrated to `canonicalSignal`
- [ ] Function can be removed in next sprint

---

### P1: Deprecate signalTypeField → canonicalField

**Confidence**: HIGH

```typescript
/**
 * @deprecated Use canonicalField() instead
 */
export function signalTypeField(...)
```

**Acceptance Criteria:**
- [ ] @deprecated JSDoc added
- [ ] All call sites migrated to `canonicalField`
- [ ] Note: signature differs (unit position, instance accepts string)

---

### P2: Deprecate eventTypeScalar → canonicalEventOne

**Confidence**: HIGH

```typescript
/**
 * @deprecated Use canonicalEventOne() instead
 */
export function eventTypeScalar(...)
```

**Acceptance Criteria:**
- [ ] @deprecated JSDoc added
- [ ] All call sites migrated to `canonicalEventOne`

---

### P3: Deprecate eventTypePerInstance → canonicalEventField

**Confidence**: HIGH

```typescript
/**
 * @deprecated Use canonicalEventField() instead
 */
export function eventTypePerInstance(...)
```

**Acceptance Criteria:**
- [ ] @deprecated JSDoc added
- [ ] All call sites migrated to `canonicalEventField`

---

## Dependencies

- **constructors-helpers** — New constructors must exist first

## Risks

| Risk | Mitigation |
|------|------------|
| Many call sites | Use grep to find all, migrate systematically |

---

## Files to Modify

- `src/core/canonical-types.ts` — Add deprecation
- All files calling old constructors
