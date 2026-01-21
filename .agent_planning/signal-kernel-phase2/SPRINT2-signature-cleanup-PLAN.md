# Sprint Plan: Signature Registry Cleanup

**Sprint ID:** signal-kernel-phase2-sprint2
**Created:** 2026-01-21
**Confidence:** HIGH

## Goal

Update kernel signature registry to reflect renamed oscillators and add proper type documentation.

## Tasks

### 1. Update Deprecated Kernel Signatures

In `src/runtime/kernel-signatures.ts`:

**Replace:**
```typescript
sin: {
  inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1) - converts to radians internally' }],
  output: { unit: 'scalar', description: 'Sine value [-1,1]' },
},
```

**With:**
```typescript
oscSin: {
  inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1) - wraps internally' }],
  output: { unit: 'scalar', description: 'Sine value [-1,1]' },
},

// DEPRECATED - kept for backward compatibility
sin: {
  inputs: [{ expectedUnit: 'phase', description: 'DEPRECATED: Use oscSin instead' }],
  output: { unit: 'scalar', description: 'Sine value [-1,1]' },
},
```

Same pattern for cos→oscCos, tan→oscTan.

### 2. Add Domain/Range Comments

Update header comment in kernel-signatures.ts to document:
- Oscillators: phase [0,1) wrapped → [-1,1]
- Easing: normalized [0,1] clamped → [0,1]
- Noise: any real → [0,1)

### 3. Consider Deprecation Plan

Document when to remove deprecated sin/cos/tan aliases:
- v1.0: Add deprecation warnings (DONE)
- v1.1: Keep aliases, no changes
- v2.0: Consider removal

## Files to Modify

1. `src/runtime/kernel-signatures.ts` - Update registry

## Testing

- Verify type checking still works
- Run existing tests

## Definition of Done

- [ ] oscSin/oscCos/oscTan added to KERNEL_SIGNATURES
- [ ] sin/cos/tan marked as deprecated in signatures
- [ ] Domain/range comments updated
- [ ] Deprecation timeline documented
