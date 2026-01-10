# Eval Cache Index

This directory contains reusable evaluation findings to speed up future evaluations.

## Runtime Findings

### Component-Specific
- **runtime-patch-viewer.md**: Patch viewer component behavior, Mermaid integration, layout
- **runtime-offset-buses/** (directory): Offset bus implementation findings
- **runtime-ui-store-wiring.md**: React components with MobX observer pattern (NEW)

### API/State Management
- **runtime-ui-store-wiring.md**: Selection state flow, store integration patterns, React/vanilla boundary

## General Patterns
(none yet - add as patterns emerge across multiple evaluations)

## Usage Notes
- Check confidence level before reusing (FRESH > RECENT > RISKY > STALE)
- Verify no code changes in scope since cache was written
- Update cache files when new runtime behavior is discovered
- Keep findings factual - no opinions or verdicts
