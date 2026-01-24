---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 3
blocks_critical: [C-2]
---

# Topic 01: Type System — Unimplemented

## Items

### U-1: Phase arithmetic enforcement
**Spec requirement**: phase + float = phase, phase * float = phase, phase + phase = TYPE ERROR
**Scope**: new function in type system or expr compiler
**Blocks**: nothing — standalone (enforcement, not representation)
**Evidence of absence**: No matches for "phase.*arithmetic" or "phase.*phase.*error" in src/

### U-2: InstanceDecl in core type system
**Spec requirement**: InstanceDecl interface (id, domainType, primitiveId, maxCount, countExpr, lifecycle) as per-patch declaration
**Scope**: Exists in compiler IR (src/compiler/ir/types.ts) but not in core type system as a user-facing concept
**Blocks**: nothing — compiler has its own version
**Evidence of absence**: InstanceDecl exists in IR types but not re-exported from core/canonical-types.ts

### U-3: DefaultSemantics<T> type helper
**Spec requirement**: Generic default semantics helper for default resolution
**Scope**: new type
**Blocks**: nothing — standalone
**Evidence of absence**: No matches for "DefaultSemantics" in src/
