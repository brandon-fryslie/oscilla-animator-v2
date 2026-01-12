# Deduplication & Deferred Work Audit Report

**Date:** 2026-01-12
**Status:** Critical findings require immediate attention

---

## Summary

This codebase is approximately **70% presentable**. The other 30% is held together with commented-out code blocks, duplicate files that do the same job, and a healthy dose of "I'll fix this later" that apparently meant "I'll never look at this again."

---

## CRITICAL FINDINGS

### [1] Duplicate Bridge Files: Two Files Doing the Same Job

**Files:**
- `/src/compiler/ir/bridge.ts`
- `/src/compiler/ir/bridges.ts`

**Evidence:**

Both files export `payloadTypeToShapeDescIR`:

```typescript
// bridge.ts:46
export function payloadTypeToShapeDescIR(payload: PayloadType): ShapeDescIR {
  switch (payload) {
    case 'float':
      return { kind: 'number' };
    // ...

// bridges.ts:200
export function payloadTypeToShapeDescIR(payload: PayloadType): ShapeDescIR {
  switch (payload) {
    case 'float':
    case 'int':
    case 'phase':
    case 'unit':
      return { kind: 'number' };
    // ...
```

**Assessment:** Someone started a new implementation and forgot to delete the old one. Or started refactoring, got distracted by something shinier, and left both files alive. The comment in `bridges.ts` line 13-14 says "Production code should use bridge.ts which wraps these" - but neither file is exported from `src/compiler/ir/index.ts`. Tests only use `bridges.ts`. This is a classic case of "Migration Graveyard" - two implementations coexisting with no clear winner.

**Completion:** Pick one. Delete the other. Export the winner from index.ts. Update all imports.

---

### [2] Commented-Out Validation Block (Mass TODO Block)

**File:** `/src/compiler/passes-v2/pass6-block-lowering.ts:112-129`

**Evidence:**

```typescript
    // TODO: Fix validation for new SignalType structure
    //       if (!modeValidation.valid) {
    // TODO: Fix validation for new SignalType structure
    //         errors.push({
    // TODO: Fix validation for new SignalType structure
    //           code: 'PortTypeMismatch',
    // TODO: Fix validation for new SignalType structure
    //           message: `${modeValidation.reason} for port ${endpoint.blockId}.${endpoint.slotId}`,
    // ...
```

Nine lines of commented-out code, each starting with `// TODO: Fix validation for new SignalType structure`. Someone refactored the type system and disabled validation rather than updating it.

**Assessment:** This is the "Temporary Permanent" pattern. The developer commented out validation to make something else work, wrote the same TODO 9 times (perhaps hoping the repetition would summon future motivation), and moved on. Now there's no validation for combine mode compatibility.

**Completion:** Either restore the validation with updated SignalType handling, or delete the commented code and add a single TODO with a ticket number.

---

## MAJOR FINDINGS

### [3] Stub Interface Methods in IRBuilderImpl

**File:** `/src/compiler/ir/IRBuilderImpl.ts:598-610`

**Evidence:**

```typescript
  declareState(_id: StateId, _type: SignalType, _initialValue?: unknown): void {
    // TODO: Implement state declaration
  }

  readState(_id: StateId, type: SignalType): SigExprId {
    // TODO: Implement state reading
    // For now, return a dummy const
    return this.sigConst(0, type);
  }

  writeState(_id: StateId, _value: SigExprId): void {
    // TODO: Implement state writing
  }
```

**Assessment:** These are interface methods that exist in `IRBuilder.ts` (the interface) but have stub implementations that do nothing useful. The `readState` method returns a hardcoded zero - which means any code that calls it is getting wrong data silently. This is the "Fake Implementation" pattern.

**Completion:** Either implement these properly or remove them from the interface if they're not needed yet.

---

### [4] Viewer Module is Empty Shell

**File:** `/src/viewer/index.ts`

**Evidence:**

```typescript
/**
 * Patch Viewer
 *
 * Exports utilities for visualizing Patch graphs.
 * TODO: Implement new patch viewer based on reference implementation
 */

// Placeholder - will be reimplemented with new UI features
export {};
```

**Assessment:** An entire module that exists to export nothing. The TODO says "implement based on reference implementation" but doesn't tell us where that reference implementation lives. This is a skeleton file that provides nothing but the illusion of architecture.

**Completion:** Implement it or delete the directory. Empty modules are lies.

---

### [5] Compile Pipeline Has Placeholder Functions

**File:** `/src/compiler/compile.ts:151-155, 241`

**Evidence:**

```typescript
    // TODO: Implement pass8LinkResolution
    // ...
    // TODO: Implement convertLinkedIRToProgram
```

And:

```typescript
 * TODO: Replace with real convertLinkedIRToProgram implementation.
```

**Assessment:** The compilation pipeline has placeholders for later passes. Pass 8 link resolution and the final conversion step are referenced but not implemented. The pipeline works around them somehow, but this is incomplete work.

**Completion:** Implement the missing passes or document why they're not needed.

---

### [6] Extensive console.log/warn Statements in Production Code

**Files with debug logging:**
- `/src/diagnostics/DiagnosticHub.ts:172, 177, 186`
- `/src/compiler/passes-v2/pass7-schedule.ts:127, 139, 143`
- `/src/compiler/passes-v2/pass6-block-lowering.ts:286`
- `/src/main.ts:36, 180, 187, 189`

**Evidence:**

```typescript
// DiagnosticHub.ts:172
console.log('[DiagnosticHub] CompileEnd event:', event);

// pass7-schedule.ts:127
console.warn('[pass7-schedule] No domains found, cannot create render steps');

// pass6-block-lowering.ts:286
console.debug(`[IR] Using IR lowering for ${block.type} (${block.id})`);
```

**Assessment:** Debugging code left in production. The DiagnosticHub literally logs events to console instead of using its own diagnostic system (ironic). The passes log warnings instead of returning proper errors.

**Completion:** Remove console.logs or replace with proper logging/diagnostic infrastructure.

---

### [7] Block Definition Duplication Pattern

**Files:**
- `/src/blocks/math-blocks.ts`
- `/src/blocks/field-operations-blocks.ts`

**Evidence:**

The math blocks (Add, Subtract, Multiply, Divide, Modulo) all have near-identical lower functions:

```typescript
// Add
lower: ({ ctx, inputsById }) => {
  const a = inputsById.a;
  const b = inputsById.b;
  if (!a || a.k !== 'sig' || !b || b.k !== 'sig') {
    throw new Error('Add inputs must be signals');
  }
  const addFn = ctx.b.opcode(OpCode.Add);
  const sigId = ctx.b.sigZip([a.id, b.id], addFn, signalType('float'));
  const slot = ctx.b.allocSlot();
  return { outputsById: { out: { k: 'sig', id: sigId, slot } } };
}

// Subtract - IDENTICAL structure, different opcode
// Multiply - IDENTICAL structure, different opcode
// Divide - IDENTICAL structure, different opcode
// Modulo - IDENTICAL structure, different opcode
```

Same pattern in field-operations-blocks: FieldAdd, FieldMultiply, FieldSin, FieldCos, FieldMod all follow the same validation-then-zip pattern.

**Assessment:** This is classic "Copy-Paste Drift" waiting to happen. Every binary math op is a copy-paste with one opcode changed. A factory function could generate these.

**Completion:** Create a `makeBinarySignalBlock(opcode, name)` and `makeBinaryFieldBlock(opcode, name)` factory. The 10+ duplicate functions become 10+ single-line calls.

---

## MINOR FINDINGS

### [8] Seed Management TODO

**File:** `/src/compiler/passes-v2/pass6-block-lowering.ts:326`

**Evidence:**

```typescript
seedConstId: 0, // TODO: Proper seed management
```

**Assessment:** Every block gets seed 0. Deterministic randomness is impossible until this is fixed.

**Completion:** Implement proper seed management based on block identity.

---

### [9] Unused Validation Functions (Commented Out)

**File:** `/src/diagnostics/validators/authoringValidators.ts:143-153`

**Evidence:**

```typescript
//   // TODO: Implement disconnected block detection
//   return [];

//   // TODO: Implement unused output detection
//   return [];
```

**Assessment:** Validation functions exist as comments. The system was designed to have these validators, someone wrote the TODO, and then... nothing.

**Completion:** Implement or delete.

---

### [10] DiagnosticsStore Early Returns for Uninitialized Hub

**File:** `/src/stores/DiagnosticsStore.ts:142, 152, 160, 168, 176, 184`

**Evidence:**

```typescript
if (!this.hub) return [];
// ... repeated 6 times
```

**Assessment:** Every query method checks if hub is null and returns empty. This suggests the store can exist without being properly initialized, which is a design smell.

**Completion:** Make initialization mandatory or use a builder pattern that prevents uninitialized access.

---

### [11] RootStore TODO

**File:** `/src/stores/RootStore.ts:88`

**Evidence:**

```typescript
blocksAdded: 0, // TODO: Track actual changes in Sprint 2
```

**Assessment:** The "Sprint 2" never came.

**Completion:** Track actual changes or remove the field.

---

### [12] Config Migration TODO

**File:** `/src/diagnostics/config.ts:5`

**Evidence:**

```typescript
 * TODO: Migrate to app-wide settings panel when available.
```

**Assessment:** Configuration hardcoded, waiting for a settings panel that may or may not exist.

**Completion:** Either create the settings panel or accept hardcoded config and remove the TODO.

---

## Patterns Identified

| Pattern | Count | Files |
|---------|-------|-------|
| Temporary Permanent (Old TODOs) | 15+ | Multiple |
| Fake Implementation (Stub/dummy returns) | 4 | IRBuilderImpl, viewer/index |
| Migration Graveyard (Dual implementations) | 1 | bridge.ts vs bridges.ts |
| Copy-Paste (Nearly identical blocks) | 10+ | math-blocks, field-operations-blocks |
| Silent Killer (console.log instead of errors) | 20+ | Multiple |
| Commented Code Blocks | 2 | pass6, authoringValidators |

---

## Priority Hit List

### Priority 1: Critical Blocking Issues
1. **DELETE** one of bridge.ts/bridges.ts, export the winner from index.ts
2. **FIX** pass6 commented-out validation or delete it permanently
3. **REMOVE** debug console statements from production code (20+ instances)

### Priority 2: Major Issues
4. **IMPLEMENT** IRBuilderImpl state methods or remove from interface
5. **EXTRACT** common block patterns into factory functions (math-blocks, field-operations-blocks)
6. **IMPLEMENT** viewer module or delete the directory

### Priority 3: Important
7. **COMPLETE** pass8LinkResolution and convertLinkedIRToProgram
8. **IMPLEMENT** proper seed management

### Priority 4: Nice to Have
9. **DECIDE** on validation functions - implement or delete
10. **FIX** uninitialized store pattern
11. **CLEAN** Sprint 2 TODOs and unused tracking

---

## Recommendation

The bones are good. The architecture shows thoughtful design. But someone started three different cleanups and finished none of them. The debt is accruing interest.

**Suggested Next Steps:**
1. Pick one priority area and complete it fully (don't start something new)
2. Review the duplicate bridge files and decide ownership
3. Remove all debug console logging
4. Extract block factory functions to eliminate copy-paste patterns
5. Document which features are intentionally deferred vs. accidentally forgotten
