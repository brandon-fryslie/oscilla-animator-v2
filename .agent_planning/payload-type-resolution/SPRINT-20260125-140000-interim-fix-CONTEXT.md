# Implementation Context: Interim Fix - Run Pass 0 Twice

## Key Files

| File | Purpose | Lines to Modify |
|------|---------|-----------------|
| `src/graph/passes/index.ts` | Pass orchestration | 54-74 |
| `src/graph/passes/pass0-payload-resolution.ts` | Already has skip logic | Line 35 |

## Code Change

### src/graph/passes/index.ts

Current (lines 54-74):
```typescript
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 0: Payload type resolution (for payload-generic blocks)
  const p0 = pass0PayloadResolution(patch);

  // Pass 1: Default source materialization
  const p1 = pass1DefaultSources(p0);

  // Pass 2: Adapter insertion
  const p2Result = pass2Adapters(p1);
  ...
}
```

New:
```typescript
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 0a: Payload type resolution for user-created blocks
  const p0a = pass0PayloadResolution(patch);

  // Pass 1: Default source materialization (may create payload-generic blocks)
  const p1 = pass1DefaultSources(p0a);

  // Pass 0b: Payload type resolution for derived blocks
  // INTERIM FIX: Running Pass 0 twice handles blocks created by Pass 1.
  // Pass 0 is idempotent (skips already-resolved blocks).
  // TODO: Replace with architectural fix (Pass 0b with edge context)
  // See: .agent_planning/payload-type-resolution/SPRINT-*-architectural-fix-*
  const p0b = pass0PayloadResolution(p1);

  // Pass 2: Adapter insertion
  const p2Result = pass2Adapters(p0b);
  ...
}
```

## How Pass 0 Skip Logic Works

From `pass0-payload-resolution.ts` line 34-35:
```typescript
// Already resolved?
if (block.params.payloadType !== undefined) continue;
```

This means:
- First pass: Resolves user-created Const blocks (if any have edges)
- Second pass: Resolves derived Const blocks created by Pass 1
- User blocks from first pass are skipped (they already have payloadType)

## Test File Location

Add test to `src/graph/passes/__tests__/pass0-payload-resolution.test.ts` or create new integration test.

## Verification Commands

```bash
# Run all pass tests
npm test -- --testPathPattern="passes"

# Run specific payload resolution tests
npm test -- --testPathPattern="pass0"

# Run full compilation test suite
npm test -- --testPathPattern="compiler"

# Run the app and verify demo patches compile
npm run dev
```

## Related Files for Reference

- `src/types/index.ts:260-261` - defaultSourceConst definition
- `src/blocks/color-blocks.ts:119-150` - HsvToRgb with defaults
- `src/blocks/signal-blocks.ts:74-82` - Const block payloadType check
