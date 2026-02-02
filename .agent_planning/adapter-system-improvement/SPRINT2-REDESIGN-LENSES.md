# Sprint 2 Redesign: Lenses System (Independent & Extensible)

**Date**: 2026-01-27
**Redesign Goal**: Separate user-controlled lenses from compiler type-checking. Establish "lenses" as the extensible foundation for signal interpretation and transformation.

## Philosophy: Lenses vs Type Checking

### Two Independent Systems

**System A: Lenses (User/Editor Controlled)**
- User explicitly specifies: "interpret this signal *through* a lens"
- Lenses are first-class port-attached metadata
- Examples: Deg→Radians adapter, scaling factor, quantization scheme
- Future: scaling, bit-depth conversion, color space transformations
- Available on: Input ports (Sprint 2), Output ports (future)

**System B: Adapter Auto-Insertion (Compiler Automatic)**
- Compiler checks all edges for type mismatches after lens expansion
- When a mismatch has a matching adapter (via AdapterSpec), auto-inserts the adapter block
- When no adapter exists, reports an error
- Clean separation: lenses are user-controlled transformations, adapters are automatic type bridging

### Key Difference
- **Lenses**: Structural transformation layer
- **Type System**: Semantic validation layer
- No overlap, no fallback logic

---

## Lens System Design

### 1. Lens Concept

A **lens** is a declarative transformation applied to a port connection:
```
signal → [lens: interpretation/transformation] → value consumed by port
```

Examples:
- **Deg→Radians adapter**: float:degrees → [lens: deg_to_rad] → float:radians
- **Scaling lens** (future): float:scalar → [lens: scale(0.5)] → float:scalar
- **Quantization lens** (future): float:scalar → [lens: quantize(8bit)] → int:count

### 2. Lens Attachment Point

Lenses attach to **ports** (not edges), supporting multiple incoming connections:
```typescript
// Port with three incoming edges, each with its own lens
interface InputPort {
  readonly id: string;
  readonly lenses?: readonly LensAttachment[];  // RENAME from adapters
  // ... other fields
}

interface LensAttachment {
  readonly id: string;                    // Unique within port (lens_0, lens_1, ...)
  readonly lensType: string;              // 'Adapter_DegreesToRadians', 'Scale', etc.
  readonly sourceAddress: string;         // Which connection this lens applies to
  readonly params?: Record<string, unknown>; // For future: scaling factor, quantization bits
  readonly sortKey: number;               // Ordering
}
```

### 3. Lens Address Format

```
v1:blocks.{block}.inputs.{port}.lenses.{lens_id}
v1:blocks.{block}.outputs.{port}.lenses.{lens_id}  [future]
```

Similar addressing to adapters but clarifies the semantic: these are interpretive lenses, not just adapters.

### 4. Lens Normalization (Pass 2 - REDESIGNED)

**Old behavior** (single mixed pass):
- Auto-insert adapters and expand explicit lenses in one interleaved pass

**New behavior** (two sequential phases):
1. **Phase 1: Expand explicit lenses** (expandExplicitLenses)
   - For each lens in `InputPort.lenses`, create a lens block
   - Insert between source and target port
   - Create deterministic block IDs: `_lens_{portId}_{lensId}`

2. **Phase 2: Auto-insert adapters** (autoInsertAdapters)
   - Check ALL remaining edges after lens expansion
   - If type mismatch and adapter exists → auto-insert adapter block
   - If type mismatch and no adapter → report error

**Key separation**: Lens expansion (user-controlled) and adapter insertion (automatic) are sequential, independent phases.

---

## Sprint 2 Implementation Plan

### Goal
Rename "adapters" to "lenses" in the data model and redesign Pass 2 to be independent of type checking.

### Phase 1: Data Model Refactoring

**1.1 Rename Types**
- [ ] Rename `AdapterAttachment` → `LensAttachment` in `src/graph/Patch.ts`
- [ ] Rename `InputPort.adapters` → `InputPort.lenses`
- [ ] Rename `AdapterAddress` → `LensAddress` in `src/types/canonical-address.ts`
- [ ] Update exports in `src/types/index.ts`
- [ ] Update all type guards and parsing logic

**1.2 Add Future-Proofing**
- [ ] Add `OutputPort.lenses` field (initialized as `undefined` for now)
- [ ] Refactor to use common `PortWithLenses` interface (internal)
- [ ] Document that lenses can be added to outputs in future

**1.3 Update Tests**
- [ ] Rename all test cases (adapter → lens)
- [ ] Add tests for output port lenses (verify they parse correctly even if unused)
- [ ] Verify roundtrip: `addressToString` ↔ `parseAddress`

### Phase 2: Pass 2 Refactoring (Independent Phases)

**2.1 Create Separate Functions**
```typescript
// src/graph/passes/pass2-lenses.ts (renamed from pass2-adapters.ts)

function expandExplicitLenses(patch: NormalizedPatch): NormalizedPatch
// Expand all lenses to real lens blocks (deterministic naming)

function validateTypeCompatibility(patch: NormalizedPatch): CompileError[]
// Check remaining edges for type mismatches (SEPARATE from lens expansion)
```

**2.2 Implement `expandExplicitLenses`**
- [ ] Iterate over all blocks and input ports
- [ ] For each lens in `InputPort.lenses`:
  1. Create lens block with ID `_lens_{portId}_{lensId}`
  2. Insert between source and target
  3. Generate canonical display name: `{blockName}.{portId}.lenses.{lensId}`
- [ ] Deterministic ID generation
- [ ] Maintain block order

**2.3 Implement `validateTypeCompatibility`**
- [ ] After lenses expanded, check remaining edges
- [ ] If type mismatch: `CompileError` (not auto-fix)
- [ ] Error message: "Type mismatch on edge X→Y. Use a lens or fix the connection."

**2.4 Update Pass 2 Orchestration**
- [ ] Phase 1: Expand explicit lenses (standalone function)
- [ ] Phase 2: Validate type compatibility (standalone function)
- [ ] No fallback between them
- [ ] Both are optional (could skip type checking in future if lenses cover all cases)

### Phase 3: Block Registry Updates

**3.1 Preserve Adapter Blocks**
- [ ] Keep all existing adapter blocks unchanged
- [ ] They still work as lens implementations
- [ ] Update comments to say "used as lens blocks"

**3.2 Future: Lens Block Convention**
- [ ] Document pattern for new lens blocks
- [ ] Examples: `Lens_Scale`, `Lens_Quantize`, `Lens_ColorSpace`
- [ ] Clarify that adapters are one category of lens

### Phase 4: UI & Addressing Updates

**4.1 Update Address System**
- [ ] Parse/serialize `v1:blocks.{block}.inputs.{port}.lenses.{id}`
- [ ] Type guards: `isLensAddress()`
- [ ] Keep `generateAdapterId()` as-is (it's still used for lens IDs)

**4.2 Update PatchStore**
- [ ] Rename `addAdapter()` → `addLens()`
- [ ] Rename `removeAdapter()` → `removeLens()`
- [ ] Rename `getAdaptersForPort()` → `getLensesForPort()`

---

## Data Model Changes

### Before (Sprint 1)
```typescript
interface InputPort {
  readonly id: string;
  readonly adapters?: readonly AdapterAttachment[];  // ← Rename
}

interface AdapterAttachment {  // ← Rename
  readonly id: string;
  readonly adapterType: string;
  readonly sourceAddress: string;
  readonly sortKey: number;
}

type CanonicalAddress = ... | AdapterAddress;  // ← Rename
```

### After (Sprint 2)
```typescript
interface InputPort {
  readonly id: string;
  readonly lenses?: readonly LensAttachment[];  // Renamed
}

interface OutputPort {
  readonly id: string;
  readonly lenses?: readonly LensAttachment[];  // NEW (future-proofing)
}

interface LensAttachment {  // Renamed
  readonly id: string;
  readonly lensType: string;
  readonly sourceAddress: string;
  readonly params?: Record<string, unknown>;  // NEW: for scaling, quantization, etc.
  readonly sortKey: number;
}

type CanonicalAddress = ... | LensAddress;  // Renamed
```

---

## Invariants

1. **One Lens Per (Port, Source) Pair**: A port cannot have multiple lenses for the same source.

2. **Deterministic Expansion**: Same input lenses always expand to the same blocks.

3. **Independent Phases**: Lens expansion and type validation are completely separate.

4. **No Fallback Logic**: Type errors are reported, never auto-fixed by lenses.

5. **Future Extensibility**: Output port lenses reserved but not implemented yet.

---

## Benefits of This Redesign

1. **Clear Semantics**: "Lenses" clarifies the concept as signal interpretation, not just type adapters.

2. **Independent Systems**: No confusing fallback logic. User controls lenses, compiler validates types.

3. **Extensibility Foundation**: Lens system can grow to include scaling, quantization, color space, etc.

4. **Future-Proof**: Output port lenses designed in (even if unused now) - no breaking changes later.

5. **Cleaner Code**: Pass 2 is two independent phases, each with clear responsibility.

---

## Acceptance Criteria

- [ ] All "adapter" references renamed to "lens"
- [ ] Type names updated: `AdapterAttachment` → `LensAttachment`, etc.
- [ ] Canonical addresses use `.lenses.` path
- [ ] Pass 2 has two independent phases (expand, validate)
- [ ] Output port lenses field exists (for future use)
- [ ] All existing tests pass (updated for naming)
- [ ] New tests verify independent phase execution
- [ ] Documentation updated
- [ ] No breaking changes to public API
- [ ] Type system remains unchanged (only lens system changes)

---

## Files to Modify

| File | Change |
|------|--------|
| `src/graph/Patch.ts` | Rename adapters → lenses, add output port lenses |
| `src/types/canonical-address.ts` | Rename AdapterAddress → LensAddress |
| `src/types/index.ts` | Update exports |
| `src/core/canonical-name.ts` | Rename `generateAdapterId` → `generateLensId` (optional, for clarity) |
| `src/graph/passes/pass2-adapters.ts` | Refactor into two independent phases |
| `src/graph/passes/index.ts` | Update orchestration |
| `src/blocks/adapter-blocks.ts` | Update comments |
| `src/stores/PatchStore.ts` | Rename methods |
| All test files | Update naming |

---

## Open Questions for User Approval

1. **Lens ID Naming**: Keep `generateAdapterId()` or rename to `generateLensId()` for clarity?
2. **Params Field**: Should `LensAttachment.params` be added now or deferred to future sprint?
3. **Output Port Lenses**: Add now (unused) or wait until needed?
4. **Error Messages**: Should type mismatch errors suggest "use a lens" explicitly?
