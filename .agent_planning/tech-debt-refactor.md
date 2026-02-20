# Tech Debt for Major Refactor

## Found during continuity pipeline extraction (2026-02-19)

### 1. renderFrameSlot is a fake value slot
- `compile.ts` allocates a "slot" for `RenderFrameIR` and jams it into slotMeta with `type: canonicalType(FLOAT)` — a lie
- It's not a value slot at all; it's an output descriptor that stores an object reference
- The runtime's `outputs` array references it, but it doesn't participate in the value execution model
- **Fix**: Make `OutputSpecIR` self-contained (carry its own storage), don't model it as a value slot

### 2. ValueSlot branded type leaks through multiple type aliases
- `ValueSlot` is exported from both `ir/Indices.ts` and `ir/program.ts` (re-export) and `ir/types.ts` (re-export)
- This causes confusion: `import type { ValueSlot } from './ir/types'` vs `from './ir/program'` vs `from './ir/Indices'`
- compile.ts had to import `ValueSlot as ValueSlotType` to avoid name collision
- **Fix**: Single canonical export location, all others import from there

### 3. `inferFieldInstanceFromValueExprs` has `any` return type
- `compile.ts:668` — returns `any` instead of `InstanceId | undefined`
- Easy fix, just needs the return type annotation

### 4. `fieldSlotRegistry` construction uses `ref.slot!` (non-null assertion)
- `compile.ts:296-297` — `ref.slot!` and `ref.slot! as number`
- Slots are optional on ValueRefExpr (pure blocks), but by the time compile.ts runs, binding pass has allocated all slots
- **Fix**: Add a post-binding-pass assertion/transformation that produces a type where `slot` is non-optional

### 5. Debug index built with `any[]` and untyped Maps
- `compile.ts:397-400` — `ports: any[]`, `stepToBlock = new Map()`, etc.
- No type safety on the debug index structure
- **Fix**: Define a `DebugIndex` interface and type all the maps

### 6. `getSlotCount` called with optional chaining (`builder.getSlotCount?.()`)
- `compile.ts:319` — `getSlotCount` is not optional on the interface, but called with `?.`
- Defensive coding that masks potential bugs
- **Fix**: Remove `?.` since `getSlotCount()` is always present on `OrchestratorIRBuilder`

### 7. `as unknown as` chains throughout compile.ts
- `ref.id as unknown as ValueExprId` (line 293), `fieldId as unknown as number` (line 672)
- Symptom of type mismatch between ValueExprId (branded) and the index type used in arrays
- **Fix**: Provide a proper `toIndex(id: ValueExprId): number` utility, or make the array generic over the ID type
