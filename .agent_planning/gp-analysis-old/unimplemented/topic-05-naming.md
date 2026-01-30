---
topic: 05
name: Naming Conventions
spec_file: design-docs/canonical-types/04-CanonicalTypes-Analysis.md
category: unimplemented
audited: 2026-01-28T21:00:48Z
item_count: 2
blocks_critical: []
---

# Topic 05: Naming Conventions — Unimplemented

## Items

### U-4: Rename signalType* helpers to canonical*

**Spec requirement**: Section 4 step 1 specifies:
> "rename signalTypeField/signalTypeSignal/... to canonicalField/canonicalSignal/... (optional but reduces conceptual confusion)"

**Scope**: API rename (non-breaking if re-exported)

**Blocks**: nothing — cosmetic cleanup

**Evidence of absence**: Current names in `src/core/canonical-types.ts`:
- `signalTypeSignal()` (line 809)
- `signalTypeField()` (line 822)
- `signalTypeTrigger()` (line 837)
- `signalTypeStatic()` (line 848)
- `signalTypePerLaneEvent()` (line 861)
- `signalTypePolymorphic()` (line 880)

**Suggested approach**:
1. Rename to `canonicalSignal()`, `canonicalField()`, etc.
2. Re-export old names as deprecated aliases during migration
3. Update all call sites
4. Remove aliases after migration

---

### U-5: Quarantine worldToAxes helper

**Spec requirement**: Section 4 says:
> "Keep (migration-only): worldToAxes... quarantine into a legacy/ module (or delete once migration finishes)"

**Scope**: move to legacy module

**Blocks**: nothing — cosmetic cleanup

**Evidence**: `worldToAxes()` exists at `src/core/canonical-types.ts:770-800`. It's a migration helper for converting old "World" concept to new axes.

**When safe to remove**: When no code uses the old 'static' | 'scalar' | 'signal' | 'field' | 'event' world terminology.
