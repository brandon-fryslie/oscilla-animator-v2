# Implementation Context: New Lenses Sprint
Generated: 2026-02-01

## Files to Create

| File | Block | Type |
|------|-------|------|
| `src/blocks/adapter/clamp01.ts` | Adapter_Clamp01 | Auto-insert adapter |
| `src/blocks/adapter/wrap01.ts` | Adapter_Wrap01 | Auto-insert adapter |
| `src/blocks/adapter/clamp11.ts` | Adapter_Clamp11 | Auto-insert adapter |
| `src/blocks/adapter/bipolar-to-unipolar.ts` | Adapter_BipolarToUnipolar | Auto-insert adapter |
| `src/blocks/adapter/unipolar-to-bipolar.ts` | Adapter_UnipolarToBipolar | Auto-insert adapter |
| `src/blocks/lens/normalize-range.ts` | Lens_NormalizeRange | User-placed lens |
| `src/blocks/lens/denormalize-range.ts` | Lens_DenormalizeRange | User-placed lens |

## Files to Modify

| File | Change |
|------|--------|
| `src/blocks/adapter/index.ts` | Export new adapter blocks |

## Adapter-Spec Patterns

```typescript
// Adapter_Clamp01
adapterSpec: {
  from: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'none' } },
  to:   { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp01' } },
}

// Adapter_Wrap01
adapterSpec: {
  from: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'none' } },
  to:   { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'wrap01' } },
}

// Adapter_BipolarToUnipolar
adapterSpec: {
  from: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp11' } },
  to:   { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp01' } },
}
```

## Note on existing adapter renaming

After Sprint 2, `scalar-to-norm01-clamp.ts` will have been migrated to use contract patterns. Sprint 3's `Adapter_Clamp01` may overlap with it. Check if they're the same block — if so, just ensure it has the right adapter-spec pattern. Don't create a duplicate.
