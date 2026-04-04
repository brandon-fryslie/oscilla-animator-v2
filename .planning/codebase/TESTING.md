# Testing Patterns

**Analysis Date:** 2026-04-05

## Test Framework

**Runner:**
- Vitest (v2.1.8)
- Config: `vitest.config.ts`
- Environment: jsdom (for React testing)
- Pool: forks (separate processes per worker)

**Assertion Library:**
- `expect()` from Vitest (same API as Jest)
- `vitest` is imported as: `import { describe, it, expect } from 'vitest'`

**Run Commands:**
```bash
npm run test              # Run all tests in single run (non-watch)
npm run test:watch       # Watch mode (re-run on file changes)
npm run test:coverage    # Generate v8 coverage report (80% threshold enforced)
npm run bench            # Run benchmarks (**/__benchmarks__/*.bench.ts)
npx vitest run src/compiler/__tests__/compile.test.ts    # Single test file
npx vitest run --include "**/cardinality*.test.ts"       # Pattern match
npx vitest run --coverage src/compiler/               # Coverage for directory
```

## Test File Organization

**Location:**
- Co-located with code as `__tests__/` subdirectories (preferred)
- Alternative: `*.test.ts` next to source file
- Example: `src/compiler/__tests__/compile.test.ts` tests `src/compiler/compile.ts`
- Alternative: `src/blocks/shape/__tests__/sample-path.test.ts` tests `src/blocks/shape/`

**Naming:**
- Test files: `something.test.ts` (lowercase, with `.test` infix)
- Playwright E2E tests: `something.spec.ts` (excluded from Vitest via config)
- Benchmarks: `**/__benchmarks__/*.bench.ts` (matched by `bench` command)

**Structure:**
```
src/compiler/
├── frontend/
│   ├── analyze-type-graph.ts
│   ├── __tests__/
│   │   ├── cardinality.test.ts
│   │   ├── payload-unit.test.ts
│   │   └── default-source-policy.test.ts
│   └── ...other modules...
└── backend-v2/
    ├── index.ts
    ├── topo-sort.ts
    ├── __tests__/
    │   └── lowering.test.ts
    └── ...other modules...
```

## Test Structure

**Suite Organization:**
```typescript
/**
 * Module Tests
 *
 * Test what the module DOES, not how it does it.
 * Behavior-driven: test contracts, not implementation.
 */

import { describe, it, expect } from 'vitest';
import { functionUnderTest } from '../function-under-test';

describe('functionUnderTest', () => {
  describe('when input is valid', () => {
    it('returns expected output', () => {
      const input = ...;
      const result = functionUnderTest(input);
      expect(result).toEqual(expectedValue);
    });

    it('validates output shape', () => {
      const result = functionUnderTest(...);
      expect(result).toHaveProperty('kind');
      expect(result).toHaveProperty('payload');
    });
  });

  describe('when input is invalid', () => {
    it('throws with clear message', () => {
      expect(() => functionUnderTest(invalidInput))
        .toThrow(/expected phrase from error message/);
    });
  });
});
```

**Patterns:**
- Describe blocks organize by scenario or capability: `describe('findAdapter', () => { ... })`
- Tests name what they verify, not how: `it('returns Adapter_PhaseToScalar01', () => { ... })`
- Setup/teardown: `beforeEach()` / `afterEach()` for test isolation (though most tests avoid these in favor of isolated fixtures)
- Example from `src/blocks/__tests__/adapter-spec.test.ts`:
  ```typescript
  describe('Adapter Registry', () => {
    describe('findAdapter - unit conversion adapters', () => {
      it('Phase → Scalar: returns Adapter_PhaseToScalar01', () => {
        const from = canonicalType(FLOAT, unitTurns(), undefined, contractWrap01());
        const to = canonicalType(FLOAT, unitNone());
        const adapter = findAdapter(from, to);
        expect(adapter).not.toBeNull();
        expect(adapter!.blockType).toBe('Adapter_PhaseToScalar01');
      });
    });
  });
  ```

## Mocking

**Framework:** `vi` from Vitest (same as Jest)

**Patterns:**
- `vi.fn()`: Create mock function with call tracking
- `vi.spyOn()`: Wrap real function with spy
- `vi.mock()`: Module mocking (less common, prefer dependency injection)

**React Component Mocking Setup** (`src/ui/components/__tests__/setup.ts`):
```typescript
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}
```

**What to Mock:**
- DOM APIs in component tests (matchMedia, scrollIntoView)
- External service calls (if testing in isolation)
- Hard-to-control dependencies (Date, Math.random)

**What NOT to Mock:**
- Internal functions (test through public interface)
- Block registry (it's the single source of truth)
- Diagnostic/event systems (they're part of observable behavior)
- Type solving/validation (core contracts must not mock)

**Example: Store Testing** (from `src/stores/__tests__/integration.test.ts`):
- No mocks: test actual store composition and reactions
- Uses real block registry: `registerAllBlocks()` via setupFiles
- Tests observable state changes via reactions

## Fixtures and Factories

**Test Data:**
- Block registry provides all block definitions: `getBlockDef('BlockType')`
- Graph builder factory: `buildPatch((b) => { ... })`
  ```typescript
  const patch = buildPatch((b) => {
    const c = b.addBlock('Const');
    b.setConfig(c, 'value', 42);
  });
  ```
- Type constructors: `canonicalType(FLOAT, unitNone())`
- IR builders for compilation tests: `new IRBuilderImpl()`

**Location:**
- Fixtures are inline in test files (small, focused)
- Larger fixtures may live in `src/*/fixtures/` (e.g., `src/compiler-tester/fixtures/`)
- No separate factory modules unless fixtures are shared across 5+ test files

**Example from `src/compiler/__tests__/compile.test.ts`**:
```typescript
it('fails if no TimeRoot block', () => {
  const patch = buildPatch((b) => {
    const c = b.addBlock('Const');
    b.setConfig(c, 'value', 42);
  });

  const result = compile(patch);
  expect(result.kind).toBe('error');
});
```

## Coverage

**Requirements:** 80% threshold enforced (statements, branches, functions, lines)

**Excluded from Coverage:**
- Test files themselves: `src/**/*.test.ts`, `src/**/__tests__/**`
- Type definitions: `src/types/index.ts`
- Generated code

**View Coverage:**
```bash
npm run test:coverage          # Generate HTML report
# Open coverage/index.html in browser
```

**Coverage Strategy:**
- Aim for 80% as a baseline (20% of code is error paths, rare cases, UI edge cases)
- Focus on critical paths: compiler passes, type solving, block lowering
- Don't mock to artificially inflate coverage
- If coverage < 80% in a module, add tests (not mocks)

## Test Types

**Unit Tests:**
- Scope: Single function or small module
- Approach: Direct function calls with test data
- Setup: Inline fixtures via builders/factories
- Example: `src/compiler/__tests__/cardinality.test.ts` tests cardinality solver in isolation
- Location: `src/*/`

**Integration Tests:**
- Scope: Multiple modules working together (e.g., frontend → backend)
- Approach: Full compilation pipeline with test graphs
- Setup: Build full patch, call compile(), inspect output
- Example: `src/compiler/__tests__/compile.test.ts` tests compile() with full frontend
- Location: `src/*/`

**E2E Tests:**
- Framework: Playwright (not Vitest)
- Scope: Full app via browser automation
- Command: `npm run test:rust-worker-gates` (E2E testing renderer)
- Location: `tests/e2e/`
- Files: `*.spec.ts`

**Special Test Suites:**
- Architectural tests: `src/__tests__/forbidden-patterns.test.ts` enforces no circular imports, no parallel type systems
- Performance tests: `src/*/memory-profile.test.ts` with `--expose-gc` flag
- Visual regression: Screenshot tests via `./scripts/get-screenshot-of-compiler-tester.sh`

## Common Patterns

**Async Testing:**
```typescript
it('loads data asynchronously', async () => {
  const result = await someAsyncFunction();
  expect(result.status).toBe('ok');
});
```

**Error Testing:**
```typescript
it('throws on invalid input', () => {
  expect(() => functionThatThrows(badInput))
    .toThrow(/expected error message/);
});

// Or with discriminated union results:
it('returns error result', () => {
  const result = parseInput(badInput);
  expect(result.kind).toBe('error');
  expect(result.errors).toContain('...');
});
```

**Spy + Assertion Example** (from `src/ui/components/__tests__/setup.ts`):
```typescript
const spy = vi.spyOn(window, 'matchMedia');
someFunction();
expect(spy).toHaveBeenCalledWith('(min-width: 768px)');
```

**Testing Discriminated Union Results:**
```typescript
const result = compileC1(frontend);
if (result.kind === 'ok') {
  expect(result.payload).toHaveProperty('roster');
} else {
  expect(result.errors).toEqual([...]);
}
```

**Testing Type Behavior** (from `src/core/__tests__/canonical-types.test.ts`):
```typescript
it('derives signal from zero cardinality', () => {
  const t = canonicalConst(FLOAT);
  const kind = deriveKind(t);
  expect(kind).toBe('signal');
});
```

## Test Discipline

**Behavior, Not Implementation:**
- Test what the module promises, not how it works
- If you refactor the implementation but behavior stays, tests pass
- If you change the API (breaking change), tests fail correctly

**No Redundant Mocks:**
- Don't mock a function then test the mock
- If a dependency is critical, test with the real dependency (integration test)
- If a dependency is expensive (network, file I/O), mock at the boundary only

**Invariant Testing:**
- Add tests for architectural constraints: `no-circular-imports`, `no-parallel-type-systems`
- Example: `src/__tests__/forbidden-patterns.test.ts` ensures no `SignalType` enum exists

**Test Isolation:**
- Each test runs independently; no shared state between tests
- Block registry is global but read-only; tests don't pollute it
- If a test modifies global state, restore it in `afterEach()`

## Setup Files

**Global Setup** (`src/__tests__/setup-blocks.ts`):
```typescript
/**
 * Vitest setup: register all block definitions.
 *
 * Imported via vitest.config.ts setupFiles so every test file
 * has access to the full block registry without side-effect imports.
 */
import { registerAllBlocks } from '../blocks/all';
registerAllBlocks();
```

**React Setup** (`src/ui/components/__tests__/setup.ts`):
```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia and Element.scrollIntoView
// Conditionally applied if running in jsdom environment
```

**Vitest Config Integration:**
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [
      './src/__tests__/setup-blocks.ts',
      './src/ui/components/__tests__/setup.ts',
    ],
    // ...
  },
});
```

## Running Tests in Development

**Watch Mode:**
```bash
npm run test:watch
# Watches all *.test.ts files, re-runs on change
```

**Single File:**
```bash
npx vitest run src/compiler/__tests__/compile.test.ts
```

**Pattern Matching:**
```bash
npx vitest run --include "**/cardinality*.test.ts"
```

**With Coverage:**
```bash
npm run test:coverage
# Generates HTML coverage report at coverage/index.html
```

**Memory Profiling** (with gc exposure):
```bash
npm run test:memory
# Runs src/__tests__/memory-profile.test.ts with --expose-gc flag
```

---

*Testing analysis: 2026-04-05*
