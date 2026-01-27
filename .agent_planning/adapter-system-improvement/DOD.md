# Definition of Done: Adapter System Improvement

**Topic**: adapter-system-improvement
**Date**: 2026-01-27

## Sprint 1: Data Model & Addressing

### Acceptance Criteria

- [ ] `AdapterAttachment` type defined with: `id`, `adapterType`, `sourceAddress`, `sortKey`
- [ ] `InputPort.adapters` optional field added to `Patch.ts`
- [ ] `AdapterAddress` type added to canonical address system
- [ ] `addressToString()` handles adapter addresses: `v1:blocks.{name}.inputs.{port}.adapters.{id}`
- [ ] `parseAddress()` correctly parses adapter address strings
- [ ] `generateAdapterId()` helper produces deterministic IDs
- [ ] Unit tests verify address round-trip for all address types including adapters
- [ ] TypeScript compiles with no errors

### Verification Commands

```bash
npm run typecheck
npx vitest run src/types/__tests__/canonical-address.test.ts
```

---

## Sprint 2: Normalization Pass Updates

### Acceptance Criteria

- [ ] Pass 2 reads `InputPort.adapters` and expands to blocks
- [ ] Generated adapter blocks have canonical names: `{block}.{port}.adapters.{id}`
- [ ] Backwards compatibility: patches without explicit adapters still work via type inference
- [ ] Multiple adapters on same port (from different sources) expand correctly
- [ ] Adapter block IDs are deterministic given same input patch
- [ ] Normalization tests pass

### Verification Commands

```bash
npm run typecheck
npx vitest run src/graph/passes/__tests__/pass2-adapters.test.ts
npm run test  # Full test suite
```

---

## Sprint 3: Editor Integration

### Acceptance Criteria

- [ ] Creating a connection with type mismatch auto-inserts adapter attachment
- [ ] `PatchStore.addAdapter()` method works correctly
- [ ] `PatchStore.removeAdapter()` method works correctly
- [ ] `validateConnection()` returns suggested adapter type when incompatible
- [ ] Patch recompiles successfully after adapter insertion
- [ ] UI state stays in sync with patch state

### Verification Commands

```bash
npm run typecheck
npx vitest run src/ui/reactFlowEditor/__tests__/connection-validation.test.ts
npm run dev  # Manual verification of auto-insertion
```

### Manual Verification

1. Open dev server
2. Create a block with `phase01` output
3. Create a block with `radians` input
4. Connect them
5. Verify adapter attachment appears in patch
6. Verify compilation succeeds

---

## Sprint 4: UI Visualization

### Acceptance Criteria

- [ ] `AdapterIndicator` component renders on edges with adapters
- [ ] Indicator positioned near target port (75% along edge)
- [ ] Hover shows adapter type and description
- [ ] Adapter color distinguishes unit adapters from cardinality adapters
- [ ] Edge data includes adapter information from `InputPort.adapters`
- [ ] Performance acceptable with many connections (no jank)

### Verification Commands

```bash
npm run typecheck
npm run dev  # Visual verification
```

### Manual Verification

1. Create patch with multiple adapter connections
2. Verify indicators visible on all adapted edges
3. Verify hover shows correct information
4. Verify scrolling/zooming is smooth

---

## Sprint 5: Context Menu & Editing

### Acceptance Criteria

- [ ] Edge context menu shows "Insert Adapter" when compatible adapters exist
- [ ] Edge context menu shows "Remove Adapter" when adapter present
- [ ] Clicking "Insert Adapter" opens submenu with options
- [ ] Selecting adapter type updates patch and recompiles
- [ ] Removing adapter updates patch and recompiles
- [ ] Double-click on adapter indicator opens edit UI
- [ ] Keyboard delete on selected adapter removes it

### Verification Commands

```bash
npm run typecheck
npm run dev  # Manual verification of all interactions
```

### Manual Verification

1. Right-click edge with no adapter → "Insert Adapter" available
2. Right-click edge with adapter → "Remove Adapter" available
3. Insert adapter → indicator appears
4. Remove adapter → indicator disappears
5. Double-click indicator → edit options shown

---

## Overall Definition of Done

All sprints complete when:

1. ✅ All sprint acceptance criteria met
2. ✅ All tests pass: `npm run test`
3. ✅ TypeScript compiles: `npm run typecheck`
4. ✅ No console errors in browser
5. ✅ Existing functionality unchanged (regression free)
6. ✅ Documentation updated (if any API changes)

## Evidence Required

For final sign-off, provide:

1. Test run output (all green)
2. Screenshot of adapter indicator on edge
3. Screenshot of edge context menu with adapter options
4. Console output showing no errors during adapter operations
