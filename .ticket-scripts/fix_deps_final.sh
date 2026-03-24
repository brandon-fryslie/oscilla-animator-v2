# Sequential IDs
id1="lit-b90e7a20-72e0aba1"
id2="lit-b90e7a20-ab2433f5"
id3="lit-b90e7a20-308cecf6"
id4="lit-b90e7a20-417b34cc"
id5="lit-b90e7a20-8ca46a2d"
id6="lit-b90e7a20-e4049ab6"

p0_1="oscilla-phase-0-tests-0qe"
p0_2="oscilla-phase-0-fluid-purge-9lz"
p0_3="oscilla-phase-0-constantpatcher-dzg"
p0_4="oscilla-phase-0-block-purge-6rj"

p1_1="oscilla-phase-1-manifest-2kk"
p1_2="oscilla-phase-1-rust-mmu-0m3"
p1_3="oscilla-phase-1-update-classes-mqr"
p1_4="oscilla-phase-1-fastpath-3uk"

p2_1="oscilla-phase-2-dispatch-8yr"
p2_2="oscilla-phase-2-fluid-port-045"

# 1. Clear all possible deps between these specific IDs to ensure a clean slate
ids="$id1 $id2 $id3 $id4 $id5 $id6 $p0_1 $p0_2 $p0_3 $p0_4 $p1_1 $p1_2 $p1_3 $p1_4 $p2_1 $p2_2"
for d in $ids; do
    for b in $ids; do
        if [ "$d" != "$b" ]; then
            pnpm exec lnks dep rm $d $b || true
        fi
    done
done

# 2. Add dependencies: dep add <dependent> <blocker>
# [LAW:one-way-deps] Establish the single linear execution track.

# Current Phase 1 (Type 2)
pnpm exec lnks dep add $id2 $id1
pnpm exec lnks dep add $id3 $id2
pnpm exec lnks dep add $id4 $id3
pnpm exec lnks dep add $id5 $id4
pnpm exec lnks dep add $id6 $id5

# Phase 0
pnpm exec lnks dep add $p0_1 $id6
pnpm exec lnks dep add $p0_2 $p0_1
pnpm exec lnks dep add $p0_3 $p0_2
pnpm exec lnks dep add $p0_4 $p0_3

# Phase 1 (Memory)
pnpm exec lnks dep add $p1_1 $p0_4
pnpm exec lnks dep add $p1_2 $p1_1
pnpm exec lnks dep add $p1_3 $p1_2
pnpm exec lnks dep add $p1_4 $p1_3

# Phase 2 (Fluid)
pnpm exec lnks dep add $p2_1 $p1_4
pnpm exec lnks dep add $p2_2 $p2_1

echo "Done"
