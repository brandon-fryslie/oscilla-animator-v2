# Core IDs
t2_first="lit-b90e7a20-72e0aba1"
t2_index="lit-b90e7a20-ab2433f5"
t2_routing="lit-b90e7a20-308cecf6"
t2_eval="lit-b90e7a20-417b34cc"
t2_harden="lit-b90e7a20-8ca46a2d"
t2_blob="lit-b90e7a20-e4049ab6"

# 1. Sequence Current Phase 1 (Type 2)
# t2_first is already ready
pnpm exec lnks dep add $t2_index $t2_first
pnpm exec lnks dep add $t2_routing $t2_index
pnpm exec lnks dep add $t2_eval $t2_routing
pnpm exec lnks dep add $t2_harden $t2_eval
pnpm exec lnks dep add $t2_blob $t2_harden

# 2. Phase 0 (Hardening) depends on Type 2 completion
p0_tasks="oscilla-phase-0-block-purge-6rj oscilla-phase-0-constantpatcher-dzg oscilla-phase-0-fluid-purge-9lz oscilla-phase-0-tests-0qe"
for p0 in $p0_tasks; do
    pnpm exec lnks dep add $p0 $t2_blob
done

# 3. Phase 1 (Memory) depends on Phase 0 completion
p1_tasks="oscilla-phase-1-manifest-2kk oscilla-phase-1-rust-mmu-0m3 oscilla-phase-1-update-classes-mqr oscilla-phase-1-fastpath-3uk"
for p1 in $p1_tasks; do
    for p0 in $p0_tasks; do
        pnpm exec lnks dep add $p1 $p0
    done
done

# 4. Phase 2 (Fluid) depends on Phase 1 completion
p2_tasks="oscilla-phase-2-dispatch-8yr oscilla-phase-2-fluid-port-045"
for p2 in $p2_tasks; do
    for p1 in $p1_tasks; do
        pnpm exec lnks dep add $p2 $p1
    done
done

# 5. Phase 3 (2.5D) depends on Phase 2 completion
p3_tasks="oscilla-phase-3-ortho-bgi oscilla-phase-3-sort-pbz oscilla-phase-3-matcap-of0"
for p3 in $p3_tasks; do
    for p2 in $p2_tasks; do
        pnpm exec lnks dep add $p3 $p2
    done
done

# 6. Phase 4 (Dynamics) depends on Phase 3 completion
p4_tasks="oscilla-phase-4-atomic-7vu oscilla-phase-4-pingpong-t6f oscilla-phase-4-spatial-pi3"
for p4 in $p4_tasks; do
    for p3 in $p3_tasks; do
        pnpm exec lnks dep add $p4 $p3
    done
done

# 7. Phase 5 (Text) depends on Phase 4 completion
p5_tasks="oscilla-phase-5-atlas-96i oscilla-phase-5-shaping-vck oscilla-phase-5-msdf-hti"
for p5 in $p5_tasks; do
    for p4 in $p4_tasks; do
        pnpm exec lnks dep add $p5 $p4
    done
done

echo "Done"
