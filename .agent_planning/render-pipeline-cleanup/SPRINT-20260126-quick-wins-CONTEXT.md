# Implementation Context: quick-wins Sprint

## File Locations

### ContinuityApply.ts Debug Logging

File: `src/runtime/ContinuityApply.ts`

Lines to remove (all `console.log` with `[Continuity]` prefix):
- 346-348: Buffer size change logging
- 401: Domain change logging
- 413, 416: Old effective/gauge snapshot logging
- 418: newBase sample logging
- 434: gauge after init logging
- 437: effective position logging
- 453: slew after init logging
- 488: Test pulse logging
- 533, 543: gauge decay logging

### RenderAssembler Warning

File: `src/runtime/RenderAssembler.ts`
Line: 1117

Current code:
```typescript
console.warn(`RenderAssembler: Instance ${step.instanceId} not found`);
```

Replace with:
```typescript
throw new Error(`RenderAssembler: Instance ${step.instanceId} not found in state.instances. This indicates a compilation error where StepRender references an undeclared instance.`);
```

Also remove the subsequent `return [];` since we're throwing.

## Test Files (OK to keep logging)

These are in `__tests__/` and can keep console.log for debugging:
- `src/runtime/__tests__/project-policy-domain-change.test.ts` (lines 551-579)

## Related Beads

- ms5.9: "Remove .bak files and debug logging from runtime"
  - .bak files: Already confirmed none exist
  - Debug logging: This sprint handles it

- ms5.18: "Update future-types.ts migration comments"
  - File doesn't exist, close with appropriate reason
