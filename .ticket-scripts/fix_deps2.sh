# Type 2 Parametric End
t2_end="lit-b90e7a20-e4049ab6"

# Phase 0 Tasks
p0_tasks="oscilla-phase-0-block-purge-6rj oscilla-phase-0-constantpatcher-dzg oscilla-phase-0-fluid-purge-9lz oscilla-phase-0-tests-0qe"

# Phase 1 Tasks
p1_tasks="oscilla-phase-1-manifest-2kk oscilla-phase-1-rust-mmu-0m3 oscilla-phase-1-update-classes-mqr oscilla-phase-1-fastpath-3uk"

# Phase 2 Tasks
p2_tasks="oscilla-phase-2-dispatch-8yr oscilla-phase-2-fluid-port-045"

# Remove bad dependencies (using rm)
for p0 in $p0_tasks; do
    pnpm exec lnks dep rm $t2_end $p0 || true
done

for p0 in $p0_tasks; do
    for p1 in $p1_tasks; do
        pnpm exec lnks dep rm $p0 $p1 || true
    done
done

for p1 in $p1_tasks; do
    for p2 in $p2_tasks; do
        pnpm exec lnks dep rm $p1 $p2 || true
    done
done

# Also remove epic bad dependencies
pnpm exec lnks dep rm oscilla-phase-0-q5n oscilla-phase-1-vnw || true
pnpm exec lnks dep rm oscilla-phase-1-vnw oscilla-phase-2-7o6 || true

# Add correct dependencies: <dependent> <blocker>
# 1. Type 2 End blocks all Phase 0 tasks
for p0 in $p0_tasks; do
    pnpm exec lnks dep add $p0 $t2_end
done
pnpm exec lnks dep add oscilla-phase-0-q5n $t2_end

# 2. Phase 1 tasks blocked by Phase 0 epic
for p1 in $p1_tasks; do
    pnpm exec lnks dep add $p1 oscilla-phase-0-q5n
done
pnpm exec lnks dep add oscilla-phase-1-vnw oscilla-phase-0-q5n

# 3. Phase 2 tasks blocked by Phase 1 epic
for p2 in $p2_tasks; do
    pnpm exec lnks dep add $p2 oscilla-phase-1-vnw
done
pnpm exec lnks dep add oscilla-phase-2-7o6 oscilla-phase-1-vnw

echo "Done"
