# Epics
e0="oscilla-phase-0-q5n"
e1="oscilla-phase-1-vnw"
e2="oscilla-phase-2-7o6"
e3="oscilla-phase-3-0fa"
e4="oscilla-phase-4-49h"
e5="oscilla-phase-5-atu"
e6="oscilla-phase-6-8qv"

# First tasks of each phase
p0_1="oscilla-phase-0-tests-0qe"
p1_1="oscilla-phase-1-manifest-2kk"
p2_1="oscilla-phase-2-dispatch-8yr"
p3_1="oscilla-phase-3-ortho-bgi"
p4_1="oscilla-phase-4-atomic-7vu"
p5_1="oscilla-phase-5-atlas-96i"

# [LAW:one-way-deps] Epics should be blocked by their first child
# Syntax: lnks dep add <dependent> <blocker>

pnpm exec lnks dep add $e0 $p0_1
pnpm exec lnks dep add $e1 $p1_1
pnpm exec lnks dep add $e2 $p2_1
pnpm exec lnks dep add $e3 $p3_1
pnpm exec lnks dep add $e4 $p4_1
pnpm exec lnks dep add $e5 $p5_1
# Phase 6 epic has no children yet, keep it as is.

echo "Done"
