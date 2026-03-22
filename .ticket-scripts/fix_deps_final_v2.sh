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

p3_1="oscilla-phase-3-ortho-bgi"
p3_2="oscilla-phase-3-sort-pbz"
p3_3="oscilla-phase-3-matcap-of0"

p4_1="oscilla-phase-4-atomic-7vu"
p4_2="oscilla-phase-4-pingpong-t6f"
p4_3="oscilla-phase-4-spatial-pi3"

p5_1="oscilla-phase-5-atlas-96i"
p5_2="oscilla-phase-5-shaping-vck"
p5_3="oscilla-phase-5-msdf-hti"

all_ids="$id1 $id2 $id3 $id4 $id5 $id6 $p0_1 $p0_2 $p0_3 $p0_4 $p1_1 $p1_2 $p1_3 $p1_4 $p2_1 $p2_2 $p3_1 $p3_2 $p3_3 $p4_1 $p4_2 $p4_3 $p5_1 $p5_2 $p5_3"

# 1. Brutally clear all deps for all these IDs
for d in $all_ids; do
    # Get all current blockers for d and remove them
    for b in $(pnpm exec lnks dep ls $d | grep "\-\-blocks\-\->" | awk '{print $3}'); do
        pnpm exec lnks dep rm $d $b || true
    done
    # Also remove if d is blocking something else incorrectly
    for dependent in $(pnpm exec lnks dep ls $d | grep "\-\-blocks\-\->" | awk '{print $1}'); do
        pnpm exec lnks dep rm $dependent $d || true
    done
done

# 2. Add linear dependencies in EXACT order: dep add <dependent> <blocker>
pnpm exec lnks dep add $id2 $id1
pnpm exec lnks dep add $id3 $id2
pnpm exec lnks dep add $id4 $id3
pnpm exec lnks dep add $id5 $id4
pnpm exec lnks dep add $id6 $id5

pnpm exec lnks dep add $p0_1 $id6
pnpm exec lnks dep add $p0_2 $p0_1
pnpm exec lnks dep add $p0_3 $p0_2
pnpm exec lnks dep add $p0_4 $p0_3

pnpm exec lnks dep add $p1_1 $p0_4
pnpm exec lnks dep add $p1_2 $p1_1
pnpm exec lnks dep add $p1_3 $p1_2
pnpm exec lnks dep add $p1_4 $p1_3

pnpm exec lnks dep add $p2_1 $p1_4
pnpm exec lnks dep add $p2_2 $p2_1

pnpm exec lnks dep add $p3_1 $p2_2
pnpm exec lnks dep add $p3_2 $p3_1
pnpm exec lnks dep add $p3_3 $p3_2

pnpm exec lnks dep add $p4_1 $p3_3
pnpm exec lnks dep add $p4_2 $p4_1
pnpm exec lnks dep add $p4_3 $p4_2

pnpm exec lnks dep add $p5_1 $p4_3
pnpm exec lnks dep add $p5_2 $p5_1
pnpm exec lnks dep add $p5_3 $p5_2

echo "Done"
