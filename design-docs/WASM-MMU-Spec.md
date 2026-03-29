# WASM MMU Spec: The Rust Manifest Resolver

**Status:** Draft (from Gemini design session)
**Prerequisite:** `WASM-Boundary-Spec.md` (Phase 1 manifest & roster)

The Manifest Resolver is the Memory Management Unit (MMU) of Oscilla. JS is completely unaware of physical bytes, WebGPU alignments, or padding. The Rust MMU translates the semantic JSON request into strict WebGPU memory layouts, allocates physical `wgpu::Buffer`s, and generates a Symbol Resolution Map so the AST compiler knows where to inject memory addresses into WGSL shaders.

---

## 1. Core Rust Data Structures

All storage buffers are flat, tightly packed `array<u32>` memory blocks — not WGSL `struct`s. WGSL struct alignment rules (`std430`) enforce severe padding penalties. Rust uses `bitcast<f32>` and `bitcast<i32>` during AST lowering instead.

```rust
pub struct GpuMemoryArena {
    // Phase 2 Float Bus target (Uniforms, read-only from GPU)
    pub globals_buffer: wgpu::Buffer,

    // GPU-writable scalars (Storage)
    pub scalars_buffer: wgpu::Buffer,

    // Per Domain: standard SoA buffer + optional atomic buffer (bifurcated)
    // WGSL prohibits bitcast on atomics — can't mix f32 and atomic<u32> in one binding.
    pub domain_buffers: HashMap<String, DomainBuffers>,

    // Data stream buffers (Storage, COPY_DST for JS push)
    pub stream_buffers: HashMap<String, wgpu::Buffer>,

    // Allocated Textures, Views, and Samplers
    pub textures: HashMap<String, wgpu::Texture>,
    pub texture_views: HashMap<String, wgpu::TextureView>,
    pub samplers: HashMap<String, wgpu::Sampler>,

    // Static geometry (Vertex + Index buffers)
    pub shape_bank: HashMap<String, StaticGeometry>,

    // The Rosetta Stone: Maps JS SymbolIds to physical WGSL array indices
    pub symbol_map: HashMap<String, PhysicalSymbol>,

    // The exact byte length JS must send in Phase 2
    pub expected_frame_payload_size: usize,
}

pub struct StaticGeometry {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: Option<wgpu::Buffer>,
    pub vertex_count: u32,
    pub index_count: u32,
}

pub struct PhysicalSymbol {
    pub buffer_type: BufferType,
    pub domain_id: Option<String>,

    // Offset in 4-byte units (u32/f32 word indices), not bytes.
    // WGSL reads: domain_buffer[word_offset + instance_id]
    pub word_offset: u32,

    pub wgsl_type: WgslType,
}

pub struct DomainBuffers {
    pub standard: wgpu::Buffer,            // array<u32>, holds f32/u32/i32 via bitcast
    pub atomic: Option<wgpu::Buffer>,      // array<atomic<u32>>, only if manifest has atomic fields
}

pub enum BufferType {
    GlobalUniform,
    ArenaScalar,
    DomainStandard,  // Maps to array<u32> (bitcast to f32/i32)
    DomainAtomic,    // Maps to array<atomic<u32>> (separate buffer, no bitcast)
    DataStream,
}
```

---

## 2. Allocation Algorithm (The MMU Pass)

Rust iterates the `MemoryManifest` in six strict phases.

### Phase A: Globals (std140 Uniform Alignment)

Uniform buffers have brutal alignment rules. A `vec3` takes 16 bytes. A `f32` after a `vec3` may need padding. Because JS sends a flat `Float32Array` in Phase 2, Rust must calculate exact padding and tell JS where to put each value.

1. Iterate `manifest.globals`.
2. Track `current_byte_offset`.
3. For compound types (`mat4x4`, `vec4`, etc.), align `current_byte_offset` up to the nearest 16-byte boundary.
4. Record the **float index** (byte offset / 4) in the `globalOffsetMap` for the Install Receipt.
5. Allocate `globals_buffer` with `UNIFORM | COPY_DST`.

### Phase A.5: Arena Scalars (GPU-Writable Storage)

GPU-written singular values (LFOs, `active_lanes` counters, intermediate results). Packed tightly into a single storage buffer — no `std140` padding needed since this is `STORAGE`, not `UNIFORM`.

```rust
fn allocate_arena_scalars(
    device: &wgpu::Device,
    manifest: &MemoryManifest,
) -> (wgpu::Buffer, HashMap<String, PhysicalSymbol>) {
    let mut current_word_offset: u32 = 0;
    let mut local_map = HashMap::new();

    for (symbol_id, spec) in &manifest.arena_scalars {
        local_map.insert(symbol_id.clone(), PhysicalSymbol {
            buffer_type: BufferType::ArenaScalar,
            domain_id: None,
            word_offset: current_word_offset,
            wgsl_type: spec.wgsl_type.clone(),
        });
        current_word_offset += 1;  // 1 word per scalar
    }

    // WebGPU minimum binding size safety
    let buffer_words = current_word_offset.max(4);

    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("arena_scalars"),
        size: (buffer_words * 4) as u64,
        usage: wgpu::BufferUsages::STORAGE
            | wgpu::BufferUsages::COPY_SRC
            | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    (buffer, local_map)
}
```

### Phase B: Domain SoA (256-Byte Cache Line Alignment)

Every field array within a Domain begins on a 256-byte aligned boundary for maximum GPU memory bandwidth (SIMD coalescing).

Rust routes `f32`/`u32`/`i32` fields to the `standard` buffer, and `atomic<u32>`/`atomic<i32>` fields to the `atomic` buffer. Each is independently 256-byte cache aligned. During bind group generation, both physical buffers bind to separate slots — satisfying WGSL's strict typing and aliasing rules.

Before allocating, Rust checks `device.limits().max_storage_buffer_binding_size`. If a domain exceeds it, allocation aborts with a structured `CompilationDiagnostic` via the Install Receipt — the user sees a clear error on the graph node, not a browser crash.

```rust
fn allocate_domain(
    device: &wgpu::Device,
    domain_id: &str,
    spec: &InstanceDomainSpec,
) -> Result<(DomainBuffers, HashMap<String, PhysicalSymbol>), CompilationDiagnostic> {
    let capacity = spec.capacity as u32;
    let alignment_words: u32 = 64; // 256 bytes / 4
    let max_binding = device.limits().max_storage_buffer_binding_size as u64;

    let mut std_offset: u32 = 0;
    let mut atomic_offset: u32 = 0;
    let mut local_map = HashMap::new();

    for (field_id, field_spec) in &spec.fields {
        let symbol_id = format!("{}:{}", domain_id, field_id);
        let is_atomic = matches!(field_spec.wgsl_type, "atomic<u32>" | "atomic<i32>");

        let (buffer_type, word_offset) = if is_atomic {
            let offset = atomic_offset;
            atomic_offset += capacity;
            // Align next array
            if atomic_offset % alignment_words != 0 {
                atomic_offset += alignment_words - (atomic_offset % alignment_words);
            }
            (BufferType::DomainAtomic, offset)
        } else {
            let offset = std_offset;
            std_offset += capacity;
            if std_offset % alignment_words != 0 {
                std_offset += alignment_words - (std_offset % alignment_words);
            }
            (BufferType::DomainStandard, offset)
        };

        local_map.insert(symbol_id, PhysicalSymbol {
            buffer_type,
            domain_id: Some(domain_id.to_string()),
            word_offset,
            wgsl_type: field_spec.wgsl_type.clone(),
        });
    }

    // Hardware limit validation
    let std_bytes = (std_offset * 4) as u64;
    let atomic_bytes = (atomic_offset * 4) as u64;

    if std_bytes > max_binding || atomic_bytes > max_binding {
        return Err(CompilationDiagnostic {
            severity: "fatal".into(),
            phase: "manifest_allocation".into(),
            block_id: None,
            symbol_id: Some(domain_id.to_string()),
            message: format!(
                "Hardware Limit Exceeded: Domain '{}' requires {} MB (standard) + {} MB (atomic), \
                 but GPU limits single storage buffers to {} MB. Reduce capacity or field count.",
                domain_id,
                std_bytes / 1_048_576,
                atomic_bytes / 1_048_576,
                max_binding / 1_048_576,
            ),
        });
    }

    // Allocate standard buffer
    let standard = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(&format!("{}_std", domain_id)),
        size: std_bytes.max(16), // Minimum binding size
        usage: wgpu::BufferUsages::STORAGE
            | wgpu::BufferUsages::COPY_SRC
            | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Allocate atomic buffer only if needed
    let atomic = if atomic_offset > 0 {
        Some(device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("{}_atomic", domain_id)),
            size: atomic_bytes.max(16),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        }))
    } else {
        None
    };

    Ok((DomainBuffers { standard, atomic }, local_map))
}
```

### Phase B.5: Data Streams (JS-Pushed Storage Buffers)

Medium-bandwidth arrays (audio FFT, sensor data, point clouds) that JS pushes every frame. One independent buffer per stream.

```rust
fn allocate_data_streams(
    device: &wgpu::Device,
    manifest: &MemoryManifest,
) -> HashMap<String, wgpu::Buffer> {
    let mut stream_buffers = HashMap::new();

    for (stream_id, spec) in &manifest.data_streams {
        let byte_length = (spec.length * 4) as u64;

        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(stream_id),
            size: byte_length,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        stream_buffers.insert(stream_id.clone(), buffer);
    }

    stream_buffers
}
```

In the Math IR, shaders read these via `LoadField` with the stream's `SymbolId` — the MMU resolves it to the correct buffer binding.

### Phase C: Textures (Dimension-Resolved Allocation)

Resolves `relativeTo: 'canvas'` dimensions, configures `TextureDescriptor`, generates `TextureView`. External-source textures (`video`/`canvas`) are allocated with `COPY_DST` so `queue.copyExternalImageToTexture()` has a target. Cubemaps set `view_dimension: Cube`.

```rust
fn allocate_textures(
    device: &wgpu::Device,
    manifest: &MemoryManifest,
    canvas_size: (u32, u32),
) -> HashMap<String, AllocatedTexture> {
    let mut textures = HashMap::new();

    for (texture_id, spec) in &manifest.textures {
        // 1. Resolve dimensions
        let width = resolve_dimension(&spec.width, canvas_size.0);
        let height = spec.height.as_ref()
            .map(|h| resolve_dimension(h, canvas_size.1))
            .unwrap_or(1);
        let depth_or_layers = spec.depth_or_array_layers.unwrap_or(1);

        // 2. Build usage flags
        let mut usage = build_wgpu_usage(&spec.usage);
        if spec.external_source.is_some() {
            usage |= wgpu::TextureUsages::COPY_DST
                   | wgpu::TextureUsages::TEXTURE_BINDING;
        }

        // 3. Allocate texture
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(texture_id),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: depth_or_layers },
            mip_level_count: 1,
            sample_count: 1,
            dimension: match spec.dimension.as_str() {
                "1d" => wgpu::TextureDimension::D1,
                "2d" | "cube" => wgpu::TextureDimension::D2,
                "3d" => wgpu::TextureDimension::D3,
                _ => wgpu::TextureDimension::D2,
            },
            format: parse_wgpu_format(&spec.format),
            usage,
            view_formats: &[],
        });

        // 4. Create TextureView (cubemaps need Cube view dimension)
        let view_dimension = match spec.dimension.as_str() {
            "1d" => wgpu::TextureViewDimension::D1,
            "2d" => wgpu::TextureViewDimension::D2,
            "3d" => wgpu::TextureViewDimension::D3,
            "cube" => wgpu::TextureViewDimension::Cube,
            _ => wgpu::TextureViewDimension::D2,
        };

        let view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some(&format!("{}_view", texture_id)),
            dimension: Some(view_dimension),
            ..Default::default()
        });

        textures.insert(texture_id.clone(), AllocatedTexture { texture, view });
    }

    textures
}

fn resolve_dimension(dim: &Dimension, canvas_pixels: u32) -> u32 {
    match dim {
        Dimension::Absolute(v) => *v,
        Dimension::RelativeToCanvas(scale) => ((canvas_pixels as f32 * scale).round() as u32).max(1),
    }
}
```

### Phase D: Shape Bank (Static Vertex/Index Buffers)

JS provides raw vertex and index data. Rust allocates `VERTEX` and `INDEX` buffers, writes data once via `queue.write_buffer`.

```rust
pub struct AllocatedShape {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: Option<wgpu::Buffer>,
    pub index_count: u32,
}

fn allocate_shape_bank(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    manifest: &MemoryManifest,
) -> HashMap<String, AllocatedShape> {
    let mut shapes = HashMap::new();

    for (shape_id, spec) in &manifest.shape_bank {
        // Vertex buffer
        let v_bytes: &[u8] = bytemuck::cast_slice(&spec.vertex_data);
        let vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("{}_vbo", shape_id)),
            size: v_bytes.len() as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        queue.write_buffer(&vertex_buffer, 0, v_bytes);

        // Index buffer (optional)
        let mut index_buffer = None;
        let mut index_count = 0;

        if let Some(i_data) = &spec.index_data {
            let i_bytes: &[u8] = bytemuck::cast_slice(i_data);
            let ibo = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(&format!("{}_ibo", shape_id)),
                size: i_bytes.len() as u64,
                usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            queue.write_buffer(&ibo, 0, i_bytes);
            index_buffer = Some(ibo);
            index_count = i_data.len() as u32;
        }

        shapes.insert(shape_id.clone(), AllocatedShape { vertex_buffer, index_buffer, index_count });
    }

    shapes
}
```

### Phase E: Samplers

One `device.create_sampler` per `SamplerSpec`.

```rust
fn allocate_samplers(
    device: &wgpu::Device,
    manifest: &MemoryManifest,
) -> HashMap<String, wgpu::Sampler> {
    let mut samplers = HashMap::new();

    for (sampler_id, spec) in &manifest.samplers {
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some(sampler_id),
            address_mode_u: parse_address_mode(&spec.address_mode_u),
            address_mode_v: parse_address_mode(&spec.address_mode_v),
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: parse_filter_mode(&spec.mag_filter),
            min_filter: parse_filter_mode(&spec.min_filter),
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        samplers.insert(sampler_id.clone(), sampler);
    }

    samplers
}
```

### Phase F: Bind Group Generation

Maps the `dependencies` declarations in each roster pass to exact WebGPU binding slots. The AST translator injects `@group` and `@binding` decorators based on these same slot assignments.

**Deterministic Slotting Convention:**

- **Group 0: Global Context** (identical for every pass)
  - Binding 0: `globals_buffer` (Uniform)
  - Binding 1: `scalars_buffer` (Storage)

- **Group 1: Pass-Specific Dependencies** (sorted alphabetically for determinism)
  - Bindings 0..N: Domains (sorted by `DomainId`)
  - Bindings N+1..M: Textures (sorted by `TextureId`)
  - Bindings M+1..Z: Samplers (sorted by `SamplerId`)

```rust
fn build_pass_bindings(
    device: &wgpu::Device,
    deps: &ExplicitDependencies,
    arena: &GpuMemoryArena,
    layout_cache: &mut HashMap<u64, wgpu::BindGroupLayout>,
) -> (wgpu::BindGroupLayout, wgpu::BindGroup) {
    let mut layout_entries = Vec::new();
    let mut bind_group_entries = Vec::new();
    let mut current_binding = 0;

    // 1. Domains (Storage Buffers, sorted alphabetically)
    let mut domain_keys: Vec<_> = deps.domains.keys().collect();
    domain_keys.sort();

    for domain_id in domain_keys {
        let access = &deps.domains[domain_id];
        let buffer = &arena.domain_buffers[domain_id];
        let read_only = access == "read";

        layout_entries.push(wgpu::BindGroupLayoutEntry {
            binding: current_binding,
            visibility: wgpu::ShaderStages::COMPUTE
                | wgpu::ShaderStages::VERTEX
                | wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        });

        bind_group_entries.push(wgpu::BindGroupEntry {
            binding: current_binding,
            resource: buffer.as_entire_binding(),
        });

        current_binding += 1;
    }

    // 2. Textures (sorted alphabetically)
    let mut tex_keys: Vec<_> = deps.textures.keys().collect();
    tex_keys.sort();

    for tex_id in tex_keys {
        let access = &deps.textures[tex_id];
        let tex_alloc = &arena.textures[tex_id];

        let ty = match access.as_str() {
            "sampled" => wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: tex_alloc.view_dimension,
                multisampled: false,
            },
            _ => wgpu::BindingType::StorageTexture {
                access: if access == "read" {
                    wgpu::StorageTextureAccess::ReadOnly
                } else {
                    wgpu::StorageTextureAccess::WriteOnly
                },
                format: tex_alloc.texture.format(),
                view_dimension: tex_alloc.view_dimension,
            },
        };

        layout_entries.push(wgpu::BindGroupLayoutEntry {
            binding: current_binding,
            visibility: wgpu::ShaderStages::COMPUTE | wgpu::ShaderStages::FRAGMENT,
            ty,
            count: None,
        });

        bind_group_entries.push(wgpu::BindGroupEntry {
            binding: current_binding,
            resource: wgpu::BindingResource::TextureView(&tex_alloc.view),
        });

        current_binding += 1;
    }

    // 3. Samplers (sorted alphabetically)
    // Similar pattern — sort keys, create SamplerBindingType entries

    // Layout caching: hash the layout_entries, reuse if identical
    let layout_hash = hash_layout_entries(&layout_entries);
    let layout = layout_cache.entry(layout_hash).or_insert_with(|| {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &layout_entries,
        })
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries: &bind_group_entries,
    });

    (layout.clone(), bind_group)
}
```

**Layout Caching:** If 25 Jacobi pressure passes have identical dependency signatures (read texture A, write texture B), Rust hashes the `layout_entries` and reuses the `BindGroupLayout`. Only the per-pass `BindGroup` (pointing to the specific A/B textures for that iteration) is freshly created.

### Phase G: Clear & Blit Protocol

Once all buffers are physically created, Rust initializes data:

- **`preserveStateOnRecompile: false`** — Rust queues a compute pass that fills every field with its requested `clearValue` (e.g., `-1.0` for particle ages).
- **`preserveStateOnRecompile: true`** (Hot-Swap) — Rust compares old and new `symbol_map`. For every `SymbolId` in both maps, executes `command_encoder.copy_buffer_to_buffer()` with exact physical offsets. A 50,000-particle array copies seamlessly even if the user added new fields.

---

## 3. AST Translator (Symbol Resolution)

Once the `GpuMemoryArena` is built, the MMU acts as a dictionary for the WGSL compiler. When compiling a `ComputePassSpec`, Rust reads the JS Math IR. On every symbolic read/write, it consults the `symbol_map` for the physical translation.

### Example: LoadField

JS IR:
```json
{ "type": "LoadField", "symbolId": "pool_boids:vel_x",
  "index": { "type": "Intrinsic", "name": "global_invocation_id.x" } }
```

Rust lookup: `"pool_boids:vel_x"` → `DomainStorage("pool_boids")`, `word_offset: 150000`, `wgsl_type: f32`

Generated WGSL:
```wgsl
bitcast<f32>( buffer_pool_boids[ 150000u + global_invocation_id.x ] )
```

### Example: AtomicOpScalar

JS IR:
```json
{ "type": "AtomicOpScalar", "op": "Add", "symbolId": "sys:active_lanes",
  "value": { "type": "LiteralU32", "value": 1 } }
```

Rust lookup: `"sys:active_lanes"` → `ArenaScalar`, `word_offset: 4`, `wgsl_type: atomic<u32>`

Generated WGSL:
```wgsl
atomicAdd( &buffer_scalars[ 4u ], 1u )
```

### Example: LoadGlobal (mat4x4)

JS IR:
```json
{ "type": "LoadGlobal", "symbolId": "sys:main_cam_vp" }
```

Rust lookup: `"sys:main_cam_vp"` → `GlobalUniform`, `word_offset: 32`, `wgsl_type: mat4x4<f32>`

Generated WGSL (reads 16 contiguous floats from uniform as a matrix):
```wgsl
globals.data[ 32u ]  // Rust generates proper mat4x4 accessor based on wgsl_type
```

---

## 4. Receipt Generation

After allocation completes, Rust formats the Install Receipt:

1. Walk the `symbol_map` for all `GlobalUniform` entries.
2. Convert `word_offset` to the float-array index JS needs.
3. Emit `globalOffsetMap: { "sys:time": 0, "ui:viscosity": 1, "sys:main_cam_vp": 32, ... }`.
4. Set `framePayloadLength` to the total float count of the globals buffer.
5. Emit `dataStreamOffsets` for any `DataStream` entries.
6. Collect any allocation/validation errors into `diagnostics`.
