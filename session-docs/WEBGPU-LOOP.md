Evaluator Note

active_ticket: RECOVER-04
evaluated_commit: 7dba3d8f2
repo_base_for_next_run: HEAD
verdict: revise
next_action: revise-active-ticket

do:
- Return to RECOVER-04. The visible Type 1 baseline is broken in current repo state, and RECOVER-04 is the earliest ticket that explicitly owns restoring visible rendering.
- Use the existing canonical geometry/ownership work as the base; diagnose why the selected Type 1 slice no longer renders visibly on canvas.
- Produce real runtime evidence of restored visible output before treating later tickets as complete again.
- Keep the canonical path constraints from RECOVER-07 and RECOVER-08 intact while restoring visuals.

avoid:
- Do NOT treat RECOVER-07, RECOVER-08, RECOVER-09, or RECOVER-10 being closed as authority to move on while visuals are broken.
- Do NOT advance to RECOVER-11 or any post-core work.
- Do NOT accept structural/ownership-only proofs without visible runtime evidence.
- Do NOT reintroduce worker CPU mesh realization as the active source for the selected slice.

gates_passed:
- backlog ownership restored: RECOVER-04 reopened as the earliest leaf ticket that owns the visible Type 1 baseline
- milestone ownership restored: RECOVER-M1 reopened because its visible-render exit criteria no longer hold in current repo state
- loop rule hardening already present: broken baseline may not be explained away as pre-existing

gates_failed:
- visible baseline: accepted Type 1 slice is not currently rendering visibly on canvas
- tracker continuity: all RECOVER-01 through RECOVER-10 leaves were closed, leaving no active owner for restoring broken visuals until RECOVER-04 was reopened
- advancement safety: post-core work must not proceed while the base visible slice is broken

evidence:
- open owner restored in tracker: `lit-b90e7a20-c67c0fdf` (RECOVER-04) and `lit-b90e7a20-62263ac6` (RECOVER-M1)
- prior note pointed to RECOVER-08 advance even though broken visuals remained unresolved
- current backlog otherwise exposed only post-core RECOVER-11 as open leaf work, which is incorrect while the visible baseline is broken
