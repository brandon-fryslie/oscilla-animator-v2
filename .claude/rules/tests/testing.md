---
paths: "**/*.test.ts, **/*.spec.ts, **/__tests__/**/*.ts"
---

# Testing Conventions

## Guidelines

- Tests assert behavior, not structure
- Tests define *what* (contracts), never *how* (implementation)
- A test that can only pass by preserving deprecated code is wrong
- Contract tests are stable; implementation tests are local and cheap

## Test Organization

- Unit tests live next to the code they test
- Integration tests in dedicated `test/` or `tests/` directory
- Test files mirror source structure

## Spec Compliance

- Critical invariants from spec should have dedicated tests
- Spec examples should be reproducible as test cases
- Ambiguities in spec should be noted when writing tests
