# Oscilla Animator v2 Documentation

This directory contains technical documentation for maintainers and contributors working on the Oscilla Animator v2 codebase.

## Purpose

These documents provide deep technical explanations of core architectural patterns, design decisions, and implementation details. They complement the canonical specification in `design-docs/CANONICAL-oscilla-v2.5-20260109/` by:

- Explaining **why** specific patterns were chosen (design rationale)
- Documenting **how** invariants are enforced mechanically (implementation details)
- Providing **examples** of correct and incorrect usage patterns
- Offering **guidance** for maintainers making changes or additions

## Target Audience

This documentation assumes:
- Familiarity with the Oscilla domain (blocks, graphs, signals, fields)
- Understanding of the type system (domains, payloads, cardinality)
- Experience reading and modifying runtime or compiler code
- Working knowledge of TypeScript and modern JavaScript

**New contributors** should start with:
1. `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (conceptual foundation)
2. `CLAUDE.md` (architecture overview and navigation)
3. Then dive into specific topics here as needed

## Organization

Documentation is organized by subsystem:

### `runtime/`
Deep technical documentation of the runtime execution model:
- `execution-model.md` - Frame execution lifecycle and two-phase pattern

### Naming Conventions

- Use **kebab-case** for filenames (e.g., `execution-model.md`, not `ExecutionModel.md`)
- Avoid numbered prefixes (e.g., `01-execution.md`) - use descriptive names instead
- One document per major concept/pattern
- Keep documents focused (5-10k tokens each)

## Relationship to Other Documentation

| Location | Purpose | Audience |
|----------|---------|----------|
| `design-docs/CANONICAL-oscilla-v2.5-20260109/` | Canonical specification | All contributors |
| `docs/` (this directory) | Technical deep dives | Maintainers |
| `CLAUDE.md` | Architecture overview | All contributors |
| `.claude/rules/` | Hard constraints and patterns | Claude Code agent |
| Code comments | Implementation details | Developers |

## Contributing

When adding new documentation:
1. Ensure it doesn't duplicate existing spec content (link to spec instead)
2. Focus on **why** and **how**, not just **what** (code already shows what)
3. Include concrete examples (correct and incorrect patterns)
4. Link to relevant implementation files
5. Keep documents evergreen (prefer function names over line numbers)

## Static Site Generation

Currently, these are raw Markdown files. A static site generator (Hugo, Docusaurus, etc.) may be added in the future to improve navigation and cross-referencing.
