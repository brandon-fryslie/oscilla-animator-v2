Evaluator Note

active_ticket: RECOVER-07
evaluated_commit: cf3011d3f
repo_base_for_next_run: cf3011d3f
verdict: accept-good-base
next_action: continue-active-ticket

do:
- Start RECOVER-07: move dynamic shape materialization to one GPU-visible stage.
- Preserve the accepted Type 1 Rigid visible render baseline from RECOVER-04/06 on every attempt.
- Re-run real runtime/readback/screenshot proof after any materialization, install, assembly, draw-prep, or render-path change.
- Split static topology/template data from live dynamic payload; keep CPU ownership only for truly immutable topology/template data.
- If the work requires broad first-frame/install-path surgery beyond RECOVER-07 scope, stop and steer that remainder to RECOVER-08 instead of widening this ticket.
- Note: assembly dispatch currently uses a total-instance-count path that is fragile for >64 instances. Fix it in RECOVER-07 only if it is required to keep the canonical live path correct; otherwise document it as follow-on steering without widening the ticket.

avoid:
- Do not accept ticket-local success if the restored visible baseline regresses.
- Do not leave CPU materialization in place and merely rename it.
- Do not move shape-word-offset or indirect-arg ownership back to CPU.
- Do not broaden into RECOVER-08 or RECOVER-09 work.
- Do not reopen shape-class taxonomy or draw-prep ownership already settled in RECOVER-01/02 and RECOVER-05/06.

gates_passed:
- source/ticket alignment: RECOVER-06 is accepted and RECOVER-07 is the next open leaf
- baseline liveness: recovered visible render slice must remain part of later-ticket verification
- ownership alignment: draw-prep ownership is already on the GPU and should stay there during RECOVER-07
- clean closeout: tree clean

gates_failed: none

evidence:
- accepted base commits: RECOVER-04 visible Type 1 cutover at 0b0ab40ae, RECOVER-06 GPU draw-prep ownership at 811f2eeb8, evaluator closeout at cf3011d3f
- next run must preserve the existing visible baseline while moving dynamic materialization ownership off the CPU install path
