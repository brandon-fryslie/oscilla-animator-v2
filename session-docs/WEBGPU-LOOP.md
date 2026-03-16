Evaluator Note

active_ticket: RECOVER-03
evaluated_commit: e9e2e67ee
repo_base_for_next_run: e9e2e67ee
verdict: revise
next_action: revise-active-ticket
do: create a live renderer integration seam for the selected Type1Rigid slice so the class can be routed through a canonical ShapeBank/topology-driven path without deleting the old CPU mesh path yet
avoid: classifier-only helpers, TS-only route metadata, test-only changes, or any design that leaves the active renderer integration boundary untouched
gates_passed: source/ticket alignment; selected class remains Type1Rigid; old path should remain for now
gates_failed: live-path alignment; proposed seam was only a TypeScript-side classifier and did not create a real render-time routing boundary in the active renderer integration
evidence: RECOVER-03 now explicitly requires a seam in the live renderer integration and says helper-only or classifier-only changes are insufficient; ticket comment added clarifying that classification may support the seam but cannot satisfy the ticket by itself
