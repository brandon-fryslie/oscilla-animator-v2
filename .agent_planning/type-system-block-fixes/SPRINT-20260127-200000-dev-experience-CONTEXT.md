# Implementation Context: dev-experience Sprint

**Sprint**: Fix localStorage Caching for HMR
**Generated**: 2026-01-27-200000

## Investigation Starting Points

### Likely Files Involved

1. **Stores**
   - `src/stores/PatchStore.ts` - May have localStorage initialization
   - `src/stores/LayoutStore.ts` - Layout persistence
   - `src/stores/index.ts` - Store setup

2. **App Initialization**
   - `src/ui/App.tsx` - Top-level state hydration
   - `src/main.tsx` - Entry point

3. **Demo System**
   - `src/demo/index.ts` - Demo registration
   - `src/demo/types.ts` - Demo patch builder types

### Search Patterns
```bash
# Find localStorage usage
grep -r "localStorage" src/

# Find store hydration
grep -r "hydrate\|rehydrate" src/

# Find HMR hooks
grep -r "import.meta.hot" src/
```

## Potential Fix Approaches

### Approach A: Skip localStorage in Dev Mode
```typescript
// In store initialization
if (import.meta.env.DEV) {
  // Don't load from localStorage, use demo directly
  return;
}
const saved = localStorage.getItem(PATCH_KEY);
```

**Pros**: Simple, no HMR complexity
**Cons**: Loses persistence entirely during dev

### Approach B: Version-Based Invalidation
```typescript
// Add file hash to key
const version = import.meta.env.VITE_DEMO_VERSION ?? 'dev';
const key = `patch-${version}`;
```

**Pros**: Automatic invalidation on file changes (with proper Vite config)
**Cons**: Requires build-time hash generation

### Approach C: HMR Accept Handler
```typescript
// In demo loader
if (import.meta.hot) {
  import.meta.hot.accept('./path-field-demo', (newModule) => {
    // Force store to reload from new module
    patchStore.loadDemo(newModule.patchPathFieldDemo);
  });
}
```

**Pros**: True HMR, preserves other state
**Cons**: Most complex, requires store integration

## Commands

### Investigation
```bash
# Search for localStorage patterns
grep -rn "localStorage" src/ --include="*.ts" --include="*.tsx"

# Check for existing HMR handlers
grep -rn "import.meta.hot" src/
```

### Testing
```bash
# Dev mode
npm run dev
# Make change to demo file, observe browser

# Prod mode
npm run build && npm run preview
# Verify persistence works
```
