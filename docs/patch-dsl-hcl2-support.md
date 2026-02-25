# Patch DSL HCL2 Support Matrix

This document defines the **actual** HCL2 syntax support in the Patch DSL parser/serializer.

Scope:
- Applies to `src/patch-dsl/*` (`tokenize` -> `parse` -> `deserializePatchFromHCL` / `deserializeCompositeFromHCL`).
- This is a constrained HCL2-compatible subset for graph serialization, not a general HCL2 evaluator.

## Supported

### Lexical
- UTF-8 input.
- Whitespace: space (`U+0020`) and CR (`\r`) with newline tokens (`\n`) preserved.
- Comments:
  - `# ...` line comments
  - `// ...` line comments
  - `/* ... */` inline comments
- Identifiers: ASCII subset `[a-zA-Z_][a-zA-Z0-9_-]*`.
- String forms:
  - Quoted strings with escapes: `\\`, `\"`, `\n`, `\r`, `\t`, `\uNNNN`, `\UNNNNNNNN`
  - Heredoc: `<<EOF ... EOF`
  - Indented heredoc: `<<-EOF ... EOF` (space-based indentation trim)
- Numbers:
  - Integer: `42`, `-1`
  - Decimal: `0.5`, `-1.25`
  - Exponent: `1e3`, `-2.5E-4`
- Keywords: `true`, `false`, `null`.

### Structural/Value
- Blocks with identifier or quoted-string labels.
- Attributes: `key = value`.
- Values:
  - number, string, bool, null
  - lists (`[a, b, c]`)
  - objects (`{ a = 1, b = 2 }`)
  - references (`foo.bar.baz`)

### Top-Level Locals (Literal Substitution)
- `locals { ... }` blocks are supported as a preprocessing affordance.
- `locals` blocks must appear at the top of the file (before `patch` / `composite` headers).
- Definitions are literal-only:
  - number, string, bool, null
  - object/list of literal values
- Use sites: `local.<name>` (exactly two segments).
- Expansion is one-pass literal substitution before AST -> domain conversion.

### Serialization
- Strings are emitted as valid quoted HCL strings with escaping for:
  - backslash, quote, newline, carriage return, tab.
- Output is deterministic (sorted keys/blocks/ports where applicable).

## Intentionally Not Supported

- Horizontal tab (`U+0009`) outside strings/comments.
- Template interpolation/directives in strings:
  - `${ ... }`
  - `%{ ... }`
- Local definitions containing references (including `local.*`) are rejected.
- Nested local paths like `local.foo.bar` are rejected (only `local.<name>` is supported).
- Full HCL expression language features in attribute values, including:
  - arithmetic/logical/comparison operators
  - conditional expressions
  - function calls
  - `for` expressions
  - splats/index operators beyond plain reference path use in this DSL
- Full Unicode identifier classes (`ID_Start`/`ID_Continue`) are not yet implemented.

## Why Interpolation Is Disabled

Current patches do not use template interpolation.

Interpolation would introduce a second expression mechanism in HCL text, separate from the graph/expression-block runtime path. That creates hidden dependencies and makes behavior less inspectable than explicit graph wiring.

Current policy:
- Keep Patch DSL strings as data literals.
- Keep dynamic behavior in explicit graph/expression blocks.

## Canonical HCL2 Reference

Primary references used for alignment:
- https://github.com/hashicorp/hcl
- https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md

We align where features are implemented and fail fast for unsupported constructs.

## Verification

Coverage lives in:
- `src/patch-dsl/__tests__/lexer.test.ts`
- `src/patch-dsl/__tests__/parser.test.ts`
- `src/patch-dsl/__tests__/tripwire.test.ts`
- `src/demo/hcl/__tests__/hcl-demos.test.ts`

Full suite status after this matrix update:
- `pnpm test` -> passing
