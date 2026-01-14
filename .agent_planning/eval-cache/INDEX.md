# Eval Cache Index

**Purpose:** Reusable evaluation findings to speed up future work evaluations.

**Last Updated:** 2026-01-13 23:15:00

---

## Available Cache Files

### Runtime Findings

**runtime-dual-editor-reactflow-p0.md**
- Scope: P0 directory restructure + EditorHandle abstraction
- Status: Structurally complete, runtime verification pending
- Confidence: FRESH
- Reusable: Structural verification approach, risk assessment
- Next evaluation: Check if files changed before re-verifying

---

## Cache Maintenance

**Add new cache files when:**
- Discovering reusable runtime behavior patterns
- Finding break-it test patterns that revealed bugs
- Completing data flow verification for a scope

**Update existing files when:**
- Previous findings change (new runtime behavior discovered)
- Confidence level changes (files modified, re-verified)

**Don't cache:**
- Specific verdicts (COMPLETE/INCOMPLETE) - point-in-time only
- Test pass/fail counts - re-run to verify
- Bug details - keep in WORK-EVALUATION files
