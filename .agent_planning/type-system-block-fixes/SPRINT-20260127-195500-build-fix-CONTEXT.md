# Implementation Context: build-fix Sprint

**Sprint**: Fix TypeScript Build Errors
**Generated**: 2026-01-27-195500

## File Locations

### Files to Modify

1. **`src/diagnostics/DiagnosticHub.ts`**
   - Line 440: Change `{ severity }` to `{ severity: [severity] }`
   - Line 450: Change `{ domain }` to `{ domain: [domain] }`

2. **`src/stores/DiagnosticsStore.ts`**
   - Line 288: Change `{ severity: 'warn' }` to `{ severity: ['warn'] }`

3. **`src/diagnostics/types.ts`**
   - Add `createDiagnostic` helper function (near other helper exports)

4. **`src/runtime/HealthMonitor.ts`**
   - Line 21: Uncomment the import

### Files to Verify (No Modification Expected)

- `src/demo/path-field-demo.ts` - Run in browser to verify
- `src/blocks/path-operators-blocks.ts` - Reference for PathField outputs
- `src/blocks/field-operations-blocks.ts` - Reference for SetZ block

## Type Definitions

### DiagnosticFilter (src/diagnostics/types.ts:254-261)
```typescript
export interface DiagnosticFilter {
  readonly severity?: readonly Severity[];  // ARRAY expected
  readonly domain?: readonly Domain[];      // ARRAY expected
  readonly active?: boolean;
  readonly dismissed?: boolean;
  readonly minPriority?: number;
  readonly maxPriority?: number;
}
```

### createDiagnostic Helper (to add)
```typescript
export function createDiagnostic(params: {
  code: DiagnosticCode;
  severity: Severity;
  domain: Domain;
  primaryTarget: DiagnosticTarget;
  title: string;
  message: string;
  scope?: DiagnosticScope;
  secondaryTargets?: DiagnosticTarget[];
  hint?: string;
  relatedInfo?: string;
}): Diagnostic {
  return {
    id: generateDiagnosticId(params.code, params.primaryTarget, Date.now()),
    ...params,
    timestamp: Date.now(),
    scope: params.scope ?? {},
    secondaryTargets: params.secondaryTargets ?? [],
    hint: params.hint,
    relatedInfo: params.relatedInfo,
  };
}
```

## Commands

### Verification Commands
```bash
# Type check
npm run typecheck

# Full build
npm run build

# Run tests
npm run test

# Start dev server for demo verification
npm run dev
```

### Browser Verification
1. Open http://localhost:5174 (or configured port)
2. Open browser DevTools Console
3. Select "PathField Demo" from demo dropdown
4. Check for errors
5. Clear localStorage if stale: `localStorage.clear()` then refresh

## Related Tickets

### To Close (Invalid)
- oscilla-animator-v2-13ku - Expression block wiring (NOT A BUG)
- oscilla-animator-v2-b8qn - PathField tangent/arcLength (ALREADY IMPLEMENTED)
- oscilla-animator-v2-87k8 - Cardinality error messages (EXISTS)

### To Update
- oscilla-animator-v2-0t1n - Mark completed after this sprint
- oscilla-animator-v2-ouo - Update based on demo verification results

## Notes

The original analysis was based on an incorrect recap file. Investigation revealed:
- PathField has full tangent and arcLength implementation with 13 tests
- SetZ is cardinality-generic and handles mixed inputs via broadcasting
- E_CARDINALITY_MISMATCH diagnostic code exists and is properly wired
- Expression block has unified varargs system, no context issues
- All 43 canonical-address tests pass
