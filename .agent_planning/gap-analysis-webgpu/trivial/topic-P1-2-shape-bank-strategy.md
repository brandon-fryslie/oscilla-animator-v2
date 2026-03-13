# P1-2: Unified GPU Shape Bank Strategy - TRIVIAL Items

## Item 1: Topology Buffer Naming
**Spec says**: Buffer is called "Shape Bank" or "Bank" throughout.
**Implementation**: The GPU buffer is called `topology_buffer` in Rust (`memory.rs:70`) and `topologyBank` in WGSL (`engine.rs:319`). The JS manager class is `WebGPUShapeBankManager`. The bind group name uses `topologyBankBindGroup`.
**Gap**: Mixed naming: "topology" in Rust/WGSL, "shapeBank" in JS. Functionally identical.
**Classification**: TRIVIAL

## Item 2: Bounds Fields (boundsMinPacked, boundsMaxPacked)
**Spec says**: Words 12-13 are `boundsMinPacked` and `boundsMaxPacked` for culling.
**Implementation**: These words exist as reserved space (words 11-15 are unused in the implementation). The shape header is 16 words wide so these slots are physically present but always zeroed.
**Gap**: Bounds fields are not populated. Culling is not implemented yet, so these fields have no consumer. Physically present, logically unused.
**Classification**: TRIVIAL (no consumer yet)
