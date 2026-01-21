# Sprint: rename-oscillators - Rename Signal Oscillator Kernels

**Generated:** 2026-01-21T03:55:17Z
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Rename phase-based trig kernels from generic names (sin, cos, tan) to explicit oscillator names (oscSin, oscCos, oscTan) to prevent confusion with radian-based opcode trig functions.

## Scope

**Deliverables:**
1. Rename `sin` → `oscSin` in SignalEvaluator.ts
2. Rename `cos` → `oscCos` in SignalEvaluator.ts
3. Rename `tan` → `oscTan` in SignalEvaluator.ts
4. Update all IR builder references
5. Update any block definitions using old names
6. Add backward compatibility shims (optional, for graceful deprecation)

## Work Items

### P0: Rename kernel cases in SignalEvaluator.ts

**File:** `src/runtime/SignalEvaluator.ts`

**Acceptance Criteria:**
- [ ] Line 207: Change `case 'sin':` to `case 'oscSin':`
- [ ] Line 215: Change `case 'cos':` to `case 'oscCos':`
- [ ] Line 223: Change `case 'tan':` to `case 'oscTan':`
- [ ] Update error messages to use new names

**Technical Notes - Line-by-Line Instructions:**

```typescript
// File: src/runtime/SignalEvaluator.ts

// Line 207: Change from:
    case 'sin':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sin' expects 1 input, got ${values.length}`);
      }
// To:
    case 'oscSin':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'oscSin' expects 1 input, got ${values.length}`);
      }

// Line 215: Change from:
    case 'cos':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'cos' expects 1 input, got ${values.length}`);
      }
// To:
    case 'oscCos':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'oscCos' expects 1 input, got ${values.length}`);
      }

// Line 223: Change from:
    case 'tan':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'tan' expects 1 input, got ${values.length}`);
      }
// To:
    case 'oscTan':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'oscTan' expects 1 input, got ${values.length}`);
      }
```

### P1: Update comment documentation

**File:** `src/runtime/SignalEvaluator.ts`

**Acceptance Criteria:**
- [ ] Update lines 210-213 comments to reference `oscSin`
- [ ] Update lines 218-219 comments to reference `oscCos`
- [ ] Update line 227 comment to reference `oscTan`

**Technical Notes:**

```typescript
// Line 210-213: Update comments
      // Kernel oscSin expects PHASE [0,1), converts to radians (0-2π) for full cycle
      // Used by Oscillator block and other signal-level waveform generators
      return Math.sin(values[0] * 2 * Math.PI);

// Line 218-219: Update comments
      // Kernel oscCos expects PHASE [0,1), converts to radians (0-2π) for full cycle
      // Used by Oscillator block and other signal-level waveform generators
      return Math.cos(values[0] * 2 * Math.PI);

// Line 227: Update comment
      // Kernel oscTan expects PHASE [0,1), converts to radians (0-2π) for full cycle
      return Math.tan(values[0] * 2 * Math.PI);
```

### P2: Find and update IR builder references

**Search pattern:** `grep -rn "'sin'" src/compiler/` and similar

**Acceptance Criteria:**
- [ ] Search for all occurrences of kernel name `'sin'` (with quotes) in compiler/
- [ ] Update to `'oscSin'`
- [ ] Same for `'cos'` → `'oscCos'`
- [ ] Same for `'tan'` → `'oscTan'`

**Technical Notes:**

```bash
# Find all references
grep -rn "kind: 'kernel'" --include="*.ts" src/
grep -rn "'sin'" --include="*.ts" src/compiler/
grep -rn "'cos'" --include="*.ts" src/compiler/
grep -rn "'tan'" --include="*.ts" src/compiler/
```

### P3: Update block definitions

**Search for oscillator blocks that emit these kernels**

**Acceptance Criteria:**
- [ ] Search `src/blocks/` for files emitting `sin`/`cos`/`tan` kernels
- [ ] Update to new `oscSin`/`oscCos`/`oscTan` names

**Technical Notes:**

```bash
# Find block files using trig kernels
grep -rn "name: 'sin'\|name: 'cos'\|name: 'tan'" --include="*.ts" src/blocks/
```

### P4: Add backward compatibility shims (optional)

**File:** `src/runtime/SignalEvaluator.ts`

**Acceptance Criteria:**
- [ ] Add deprecated aliases that call new versions with console.warn

**Technical Notes:**

```typescript
// After the oscTan case (around line 230), add:

    // DEPRECATED: Legacy aliases - will be removed in future version
    case 'sin':
      console.warn(`Signal kernel 'sin' is deprecated. Use 'oscSin' for phase-based oscillation.`);
      return applySignalKernel('oscSin', values);
    case 'cos':
      console.warn(`Signal kernel 'cos' is deprecated. Use 'oscCos' for phase-based oscillation.`);
      return applySignalKernel('oscCos', values);
    case 'tan':
      console.warn(`Signal kernel 'tan' is deprecated. Use 'oscTan' for phase-based oscillation.`);
      return applySignalKernel('oscTan', values);
```

## Dependencies

- Sprint 1 (add-opcodes) should complete first so opcode sin/cos/tan are clearly distinct

## Risks

| Risk | Mitigation |
|------|------------|
| Existing patches reference old kernel names | P4 backward compat shims provide graceful migration |
| IR serialization format changes | Shims handle old IR; new IR uses new names |
