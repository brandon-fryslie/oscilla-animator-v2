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

p6="oscilla-phase-6-8qv"

ids="$p1_1 $p1_2 $p1_3 $p1_4 $p2_1 $p2_2 $p3_1 $p3_2 $p3_3 $p4_1 $p4_2 $p4_3 $p5_1 $p5_2 $p5_3 $p6"

# Clear all
for d in $ids; do
    pnpm exec lnks dep ls $d | grep "\-\-blocks\-\->" > dep_temp.txt
    while read -r line; do
        left=$(echo "$line" | awk '{print $1}')
        right=$(echo "$line" | awk '{print $3}')
        if [ ! -z "$left" ] && [ ! -z "$right" ]; then
            pnpm exec lnks dep rm "$left" "$right" || true
        fi
    done < dep_temp.txt
done

# Sequential: dep add <dependent> <blocker>
# p1_1 is the start of Phase 1.
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

pnpm exec lnks dep add $p6 $p5_3

# Block epics
pnpm exec lnks dep add oscilla-phase-1-vnw $p1_1
pnpm exec lnks dep add oscilla-phase-2-7o6 $p2_1
pnpm exec lnks dep add oscilla-phase-3-0fa $p3_1
pnpm exec lnks dep add oscilla-phase-4-49h $p4_1
pnpm exec lnks dep add oscilla-phase-5-atu $p5_1

echo "Done"
