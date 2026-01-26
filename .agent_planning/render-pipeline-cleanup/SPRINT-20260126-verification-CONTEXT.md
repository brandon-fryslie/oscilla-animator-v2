# Implementation Context: verification Sprint

## ms5.8: V1→V2 Migration Audit

### Search Patterns

```bash
# V1 references
grep -rn "v1" src/render src/runtime/RenderAssembler.ts src/runtime/Materializer.ts

# Legacy shape encoding
grep -rn "shape.*=.*0\|shape.*=.*1" src/

# Deprecated render
grep -rn "deprecated.*render\|legacy.*render" src/

# Dual paths
grep -rn "if.*v1\|if.*legacy" src/render src/runtime
```

### Expected Results

Based on exploration:
- **RenderAssembler.ts**: Clean, v2 only
- **Canvas2DRenderer.ts**: Clean, v2 only
- **render/types.ts**: Clean, v2 format
- **No dual paths found**

### Documentation

If audit confirms clean state, close bead with:
```bash
bd close oscilla-animator-v2-ms5.8 --reason "Audit confirmed: no v1 render code paths remain. All rendering uses v2 topology-based shape system."
```

## ms5.11: Intrinsics Documentation

### Current Documentation

File: `.claude/rules/compiler/intrinsics.md`

Documents 5 intrinsics:
- `index` - Element index (0, 1, 2, ..., N-1)
- `normalizedIndex` - Normalized index (0.0 to 1.0)
- `randomId` - Deterministic per-element random
- `position` - Layout-derived position
- `radius` - Layout-derived radius

### Implementation to Verify

File: `src/runtime/Materializer.ts`
Function: `fillBufferIntrinsic`

Check each case matches documentation:

```typescript
switch (intrinsic) {
  case 'index': { ... }
  case 'normalizedIndex': { ... }
  case 'randomId': { ... }
  case 'position': { ... }
  case 'radius': { ... }
}
```

### Specific Concerns

The bead title mentions "position, radius" specifically:
1. Check if position behavior for each layout type is documented
2. Check if radius behavior for each layout type is documented
3. Verify default values match

### Blocked Status Resolution

The bead shows as blocked on parent ms5. This is a tracking artifact (circular parent-child). To unblock:

```bash
# Option 1: Remove block (if bd supports)
bd update oscilla-animator-v2-ms5.11 --status open

# Option 2: Proceed anyway - work is independent
```

## File Index

| Purpose | File |
|---------|------|
| Intrinsics docs | `.claude/rules/compiler/intrinsics.md` |
| Intrinsics impl | `src/runtime/Materializer.ts` |
| Render assembler | `src/runtime/RenderAssembler.ts` |
| Canvas renderer | `src/render/canvas/Canvas2DRenderer.ts` |
| Render types | `src/render/types.ts` |
