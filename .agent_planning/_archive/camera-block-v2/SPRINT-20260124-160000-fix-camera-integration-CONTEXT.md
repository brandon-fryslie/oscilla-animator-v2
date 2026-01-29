# Implementation Context: fix-camera-integration

## Key Files

| File | Role |
|------|------|
| `src/compiler/passes-v2/pass2-types.ts` | Type graph pass - has the null pointer bug at line 282 |
| `src/projection/__tests__/level10-golden-tests.test.ts` | Golden tests - missing imports |
| `src/blocks/registry.ts` | Already modified: added cameraProjection to ALL_CONCRETE_PAYLOADS |
| `src/blocks/signal-blocks.ts` | Already modified: Const handles cameraProjection |
| `src/graph/passes/pass0-polymorphic-types.ts` | Already modified: unit inference |

## Bug Details

### pass2-types.ts line 282

```typescript
const payloadType = block.params.payloadType as PayloadType | undefined;
```

`block.params` can be undefined for blocks that don't use params (e.g., Oscillator with no overrides, or blocks created in tests without explicit params). The fix is:

```typescript
const payloadType = block.params?.payloadType as PayloadType | undefined;
```

### level10-golden-tests.test.ts

The `setCameraParams` helper uses types without importing them:
- `CompiledProgramIR` - from `../../compiler/ir/program`
- `RuntimeState` - from `../../runtime/RuntimeState`
- `ValueSlot` - from `../../compiler/ir/program`

These need to be added to the import section.

## Verification

After fixes:
```bash
npm run typecheck
npm run test -- --run
```

Both must exit 0.
