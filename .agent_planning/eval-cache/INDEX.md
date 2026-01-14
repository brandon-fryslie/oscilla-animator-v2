# Evaluation Cache Index

This directory contains reusable evaluation findings to speed up future work-evaluator runs.

## Cache Files

### Runtime Knowledge
(No active cache files - cache invalidated due to editor architecture refactor)

## Usage Guidelines

**When to use cache:**
- Starting evaluation of Rete plugin integration
- Debugging plugin-related issues
- Planning new Rete features

**When to update cache:**
- Discovered new plugin behavior
- Found additional edge cases
- Identified new integration patterns

**Confidence decay:**
- FRESH: Just added (trust fully)
- RECENT: <1 week old (light verification)
- STALE: >1 week or after major plugin updates (verify before use)

## Coverage

### Editor Architecture
- ⏳ EditorHandle abstraction (P0 complete, needs evaluation)
- ⏳ ReteEditor adapter (P0 complete, needs evaluation)
- ⏳ ReactFlow integration (pending P1)

### Rete.js Plugins
- ⏳ AutoArrangePlugin (needs re-evaluation after P0 refactor)
- ⏳ MinimapPlugin (needs re-evaluation after P0 refactor)
- ⏳ Custom rendering (pending Phase 3)
- ⏳ Parameter controls (pending Phase 4)

### Testing Patterns
- ⏳ E2E testing setup (pending Phase 5)
- ⏳ Performance benchmarks (pending Phase 5)

---

**Last updated:** 2026-01-13
**Last invalidation:** 2026-01-13 (P0: Editor architecture refactor - created editorCommon, renamed editor → reteEditor)
