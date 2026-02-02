# Sprint 2 Redesign Summary: Lenses

## User Request

Separate the adapter system into two completely independent systems:
1. **Lenses**: User/editor explicitly controls transformations
2. **Type Checking**: Compiler validates type compatibility

Call the explicit system "Lenses" to support future expansion (scaling, quantization, color space).

## Key Changes from Sprint 1 Plan

| Aspect | Before Sprint 2 | After Sprint 2 |
|--------|-----------------|----------------|
| **Lenses** | Did not exist | User-controlled signal transformations (Phase 1) |
| **Adapters** | Auto-inserted for type mismatches | Still auto-inserted for type mismatches (Phase 2) |
| **Pass 2 Logic** | Single mixed pass | Two sequential phases (lens expansion then adapter insertion) |
| **Output Ports** | Not supported | Reserved for future lenses |
| **Extensibility** | Adapters only | Lenses + params (scaling, quantization, etc.) |

## Sprint 2 Implementation Strategy

### Phase A: Rename Everything
```
AdapterAttachment    → LensAttachment
InputPort.adapters   → InputPort.lenses
AdapterAddress       → LensAddress
addAdapter()         → addLens()
generateAdapterId()  → generateLensId()  [optional]
v1:blocks.X.inputs.Y.adapters.Z → v1:blocks.X.inputs.Y.lenses.Z
```

### Phase B: Refactor Pass 2 (Two Independent Phases)

**Old Pass 2** (mixed logic):
```
For each edge:
  if type mismatch and no explicit adapter:
    auto-insert adapter (fallback)
  else if explicit adapter:
    expand to block
```

**New Pass 2** (two phases, sequential):
```
Phase 1: expandExplicitLenses()
  For each port.lenses:
    create lens block
    insert between source and target

Phase 2: autoInsertAdapters()
  For each remaining edge:
    if type mismatch and adapter exists:
      auto-insert adapter block
    if type mismatch and no adapter:
      report error
```

NOTE: Adapters (auto-inserted for type mismatches) were NOT removed.
Lenses (user-controlled transformations) were ADDED as a separate Phase 1.

### Phase C: Future-Proof Data Model

Add to `LensAttachment`:
```typescript
readonly params?: Record<string, unknown>;  // scale factor, quantization bits, etc.
```

Add to `OutputPort`:
```typescript
readonly lenses?: readonly LensAttachment[];  // Not used now, but designed in
```

This way, output lenses can be added later without breaking changes.

## Detailed File Changes

### src/graph/Patch.ts
- Rename `AdapterAttachment` → `LensAttachment`
- Rename `InputPort.adapters` → `InputPort.lenses`
- Add `OutputPort.lenses` field
- Add `params` field to `LensAttachment`

### src/types/canonical-address.ts
- Rename `AdapterAddress` → `LensAddress`
- Update parsing/serialization
- Change path: `.adapters.` → `.lenses.`

### src/graph/passes/pass2-adapters.ts (Redesign)
- Create two functions:
  - `expandExplicitLenses()` - phase 1
  - `validateTypeCompatibility()` - phase 2
- No fallback logic between them
- Each is standalone and testable

### src/stores/PatchStore.ts
- Rename `addAdapter()` → `addLens()`
- Rename `removeAdapter()` → `removeLens()`
- Rename `getAdaptersForPort()` → `getLensesForPort()`

### All Tests
- Rename test cases (adapter → lens)
- Add tests for independent phases
- Add tests for output port lenses (parsing)

## Benefits of "Lenses" Naming

1. **Conceptual**: Signals flow *through* lenses, changing interpretation
2. **Extensible**: Scaling lens, quantization lens, color space lens, etc.
3. **Symmetric**: Same concept can apply to inputs and outputs
4. **Future-Proof**: Designed for expansion without breaking changes

## Independence Examples

### Scenario 1: Adapter auto-inserted (type mismatch)
```
User: "Connect degrees output to radians input"
↓
Pass 2, Phase 1: No lenses to expand
↓
Pass 2, Phase 2: Type mismatch found, adapter exists → auto-insert Adapter_DegreesToRadians
```

### Scenario 2: User adds a lens (explicit signal transformation)
```
User: Right-click port → "Add Lens: Scale 0.5x"
↓
Pass 2, Phase 1: Expands lens to block, rewires edges
↓
Pass 2, Phase 2: Types match ✓ (lens doesn't change types)
```

### Scenario 3: Future - scaling lens
```
User: "Apply 0.5x scale to this signal"
↓
Editor: Adds LensAttachment(Lens_Scale, params: {scale: 0.5})
↓
Pass 2, Phase 1: Expands to scale block with param
↓
Signal flows through scale, then to destination
```

## Approval Checkpoints

1. ✅ Architecture: Two independent systems?
2. ✅ Naming: "Lenses" appropriate?
3. ✅ Future-proofing: Output port lenses reserved?
4. ⚠️ User error messages: Should suggest "add a lens" explicitly?
5. ⚠️ Lens ID naming: Keep `generateAdapterId()` or rename to `generateLensId()`?

---

See **SPRINT2-REDESIGN-LENSES.md** for detailed implementation plan.
