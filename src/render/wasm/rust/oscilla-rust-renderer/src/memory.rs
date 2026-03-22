use bytemuck::{bytes_of, cast_slice, Pod, Zeroable};

pub const INDIRECT_WORDS_PER_RECORD: usize = 5;
pub const INSTANCE_FLOATS_PER_RECORD: usize = 12;
pub const SHAPE_BANK_HEADER_WORDS: usize = 16;
pub const SINK_TABLE_HEADER_WORDS: usize = 8;
pub const SINK_TABLE_RECORD_WORDS: usize = 8;
// [LAW:one-source-of-truth] Must match DrawPrepSinkTable.ts DRAW_PREP_SINK_DESCRIPTOR_WORDS.
pub const SINK_TABLE_DESCRIPTOR_WORDS: usize = 26;
pub const INDIRECT_INDEXED_STRIDE_WORDS: usize = 5;
pub const INDIRECT_NON_INDEXED_STRIDE_WORDS: usize = 4;
const CLEAR_BUFFER_CHUNK_BYTES: usize = 16 * 1024;

struct BufferClearPlan {
    total_bytes: u64,
    next_offset: u64,
}

impl BufferClearPlan {
    fn new(total_bytes: u64) -> Self {
        Self {
            total_bytes,
            next_offset: 0,
        }
    }
}

impl Iterator for BufferClearPlan {
    type Item = (u64, usize);

    fn next(&mut self) -> Option<Self::Item> {
        if self.next_offset >= self.total_bytes {
            return None;
        }
        // [LAW:dataflow-not-control-flow] Chunk segmentation is derived from
        // canonical buffer size; each clear executes the same write pipeline.
        let remaining = self.total_bytes - self.next_offset;
        let chunk_len_u64 = remaining.min(CLEAR_BUFFER_CHUNK_BYTES as u64);
        let chunk_len = chunk_len_u64 as usize;
        debug_assert!(
            chunk_len > 0,
            "BufferClearPlan produced a zero-length chunk"
        );
        let chunk_offset = self.next_offset;
        self.next_offset = self.next_offset.saturating_add(chunk_len_u64);
        Some((chunk_offset, chunk_len))
    }
}

// [LAW:one-source-of-truth] FrameHeader is the single canonical frame-state
// type. Arena header zone (offset 0..ARENA_HEADER_FLOATS) is the authoritative
// home; the uniform buffer is derived transport for GPU binding convenience.
pub const ARENA_HEADER_FLOATS: usize = 64;
pub const ARENA_HEADER_BYTES: usize = ARENA_HEADER_FLOATS * std::mem::size_of::<f32>();

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Zeroable, Pod)]
pub struct FrameHeader {
    pub view_proj: [[f32; 4]; 4],
    pub resolution: [f32; 2],
    pub time_seconds: f32,
    pub delta_time_seconds: f32,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub enum MemoryPacking {
    #[serde(rename = "soa")]
    Soa,
    #[serde(rename = "aos")]
    Aos,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct MemoryResource {
    pub id: String,
    pub cardinality: u32,
    pub packing: MemoryPacking,
    #[serde(rename = "type")]
    pub resource_type: String, // e.g. "f32", "vec2", "vec4"
    #[serde(default)]
    pub update_class: String,
    /// Resource kind: "buffer" (default) or "texture2d".
    #[serde(default = "default_resource_kind", rename = "resourceKind")]
    pub resource_kind: String,
    /// Texture width (required when resource_kind == "texture2d").
    #[serde(default, rename = "textureWidth")]
    pub texture_width: u32,
    /// Texture height (required when resource_kind == "texture2d").
    #[serde(default, rename = "textureHeight")]
    pub texture_height: u32,
    /// Texture format (required when resource_kind == "texture2d").
    /// One of: "rgba32float", "rg32float", "r32float", "rgba16float".
    #[serde(default, rename = "textureFormat")]
    pub texture_format: String,
}

fn default_resource_kind() -> String {
    "buffer".to_string()
}

// [LAW:one-source-of-truth] Storage location is the single authority for where
// a resource lives on the GPU. The emitter dispatches on this, never on ID prefixes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResourceStorageLocation {
    /// Resource lives in the compiler arena storage buffer (arena_in/arena_out).
    Arena,
    /// Resource lives in the state ping-pong storage buffer (state_in/state_out).
    State,
    /// Resource is packed into the global_controls uniform buffer (vec4 array).
    GlobalControlUbo,
    /// Resource is a GPU Texture2D (e.g., fluid velocity/pressure fields).
    /// FORBIDDEN: 1D array flattened simulations — Texture2D is required for
    /// 120fps hardware filtering.
    Texture2D,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct MemoryManifest {
    pub resources: Vec<MemoryResource>,
}

#[derive(Clone, Debug)]
pub struct ResolvedResource {
    pub base_offset_bytes: u32,
    pub lane_stride_bytes: u32,
    pub component_stride_bytes: u32,
    pub total_bytes: u32,
    pub storage_location: ResourceStorageLocation,
    /// For GlobalControlUbo: which vec4 index in global_controls[].
    pub ubo_vec4_index: u32,
    /// For GlobalControlUbo: which component (0=x, 1=y, 2=z, 3=w).
    pub ubo_component: u32,
    /// For Texture2D: texture dimensions and format.
    pub texture_desc: Option<Texture2DDescriptor>,
}

/// Descriptor for a resolved Texture2D resource.
#[derive(Clone, Debug)]
pub struct Texture2DDescriptor {
    pub width: u32,
    pub height: u32,
    pub format: wgpu::TextureFormat,
}

impl ResolvedResource {
    /// WGSL component accessor (x, y, z, w) for UBO resources.
    pub fn ubo_component_name(&self) -> &'static str {
        match self.ubo_component {
            0 => "x",
            1 => "y",
            2 => "z",
            3 => "w",
            _ => unreachable!("UBO component must be 0..3"),
        }
    }

    /// Buffer name for read access (load side).
    pub fn read_buffer_name(&self) -> &'static str {
        match self.storage_location {
            ResourceStorageLocation::Arena => "arena_in",
            ResourceStorageLocation::State => "state_in",
            ResourceStorageLocation::GlobalControlUbo => "global_controls",
            // [LAW:no-silent-fallbacks] Texture2D resources are not accessed
            // via named buffer bindings — they use texture/sampler bind groups.
            ResourceStorageLocation::Texture2D => {
                panic!("Texture2D resources use texture bindings, not buffer names")
            }
        }
    }

    /// Buffer name for write access (store side).
    pub fn write_buffer_name(&self) -> &'static str {
        match self.storage_location {
            ResourceStorageLocation::Arena => "arena_out",
            ResourceStorageLocation::State => "state_out",
            ResourceStorageLocation::GlobalControlUbo => {
                // [LAW:no-silent-fallbacks] UBO is read-only from compute shaders.
                panic!("Cannot write to GlobalControlUbo from compute shader")
            }
            ResourceStorageLocation::Texture2D => {
                panic!("Texture2D resources use storage texture bindings, not buffer names")
            }
        }
    }
}

/// Parse a texture format string into a wgpu::TextureFormat.
/// [LAW:no-silent-fallbacks] Unknown formats are hard errors.
fn parse_texture_format(format: &str) -> wgpu::TextureFormat {
    match format {
        "rgba32float" => wgpu::TextureFormat::Rgba32Float,
        "rg32float" => wgpu::TextureFormat::Rg32Float,
        "r32float" => wgpu::TextureFormat::R32Float,
        "rgba16float" => wgpu::TextureFormat::Rgba16Float,
        _ => panic!("Unknown Texture2D format: '{}'. Supported: rgba32float, rg32float, r32float, rgba16float", format),
    }
}

pub struct SymbolResolver {
    pub map: std::collections::HashMap<String, ResolvedResource>,
    pub total_arena_bytes: u32,
}

impl SymbolResolver {
    pub fn new() -> Self {
        Self {
            map: std::collections::HashMap::new(),
            total_arena_bytes: 0,
        }
    }

    pub fn resolve(&self, id: &str) -> Option<&ResolvedResource> {
        self.map.get(id)
    }

    // [LAW:single-enforcer] UBO offset mapping is computed here in the MMU,
    // never in the emitter. The emitter receives opaque (vec4_index, component).
    fn compute_ubo_address(offset_floats: u32) -> (u32, u32) {
        let vec4_index = offset_floats / 4;
        let component = offset_floats % 4;
        (vec4_index, component)
    }

    /// Map a FrameHeader field name to its float offset within the uniform buffer.
    /// Returns None for unknown fields (caller falls back to Arena).
    fn frame_header_field_offset(resource_id: &str) -> Option<u32> {
        // [LAW:one-source-of-truth] These offsets mirror FrameHeader's repr(C) layout.
        // view_proj: 16 floats (0..16), resolution: 2 floats (16..18),
        // time_seconds: 1 float (18), delta_time_seconds: 1 float (19).
        match resource_id {
            "time_seconds" => Some(18),
            "delta_time_seconds" => Some(19),
            "resolution_x" => Some(16),
            "resolution_y" => Some(17),
            _ => None,
        }
    }

    pub fn build_from_manifest(manifest: &MemoryManifest) -> Self {
        let mut map = std::collections::HashMap::new();
        let mut current_offset_bytes: u32 = 0;

        for resource in &manifest.resources {
            // [LAW:single-enforcer] Texture2D resources are routed to dedicated
            // GPU textures, not buffer memory. Handle them before buffer routing.
            if resource.resource_kind == "texture2d" {
                let format = parse_texture_format(&resource.texture_format);
                map.insert(
                    resource.id.clone(),
                    ResolvedResource {
                        base_offset_bytes: 0,
                        lane_stride_bytes: 0,
                        component_stride_bytes: 0,
                        total_bytes: 0,
                        storage_location: ResourceStorageLocation::Texture2D,
                        ubo_vec4_index: 0,
                        ubo_component: 0,
                        texture_desc: Some(Texture2DDescriptor {
                            width: resource.texture_width,
                            height: resource.texture_height,
                            format,
                        }),
                    },
                );
                continue;
            }

            // [LAW:single-enforcer] Storage location routing is determined here
            // in the MMU based on update_class + cardinality. The emitter never
            // inspects resource IDs to choose buffers.
            let is_ubo = resource.update_class == "FrameTime" && resource.cardinality == 1;

            if is_ubo {
                // [LAW:one-source-of-truth] UBO resources are mapped to their
                // canonical FrameHeader offset; they do not consume arena space.
                let offset_floats = Self::frame_header_field_offset(&resource.id).unwrap_or(0);
                let (vec4_index, component) = Self::compute_ubo_address(offset_floats);

                map.insert(
                    resource.id.clone(),
                    ResolvedResource {
                        base_offset_bytes: 0,
                        lane_stride_bytes: 0,
                        component_stride_bytes: 0,
                        total_bytes: 0,
                        storage_location: ResourceStorageLocation::GlobalControlUbo,
                        ubo_vec4_index: vec4_index,
                        ubo_component: component,
                        texture_desc: None,
                    },
                );
                continue;
            }

            // [LAW:single-enforcer] All std430/std140 alignment rules are
            // enforced here in the Rust MMU.
            let component_size_bytes = 4; // Assuming f32/u32 for now
            let component_count = match resource.resource_type.as_str() {
                "f32" | "u32" | "i32" | "bool" => 1,
                "vec2" => 2,
                "vec3" => 3,
                "vec4" => 4,
                "mat4" => 16,
                _ => 1,
            };

            // std430 alignment: align to size of the first element (max 16)
            let alignment = (component_count * component_size_bytes).min(16).max(4);
            current_offset_bytes = (current_offset_bytes + alignment - 1) / alignment * alignment;

            let (lane_stride_bytes, component_stride_bytes) = match resource.packing {
                MemoryPacking::Soa => (
                    component_size_bytes,
                    resource.cardinality * component_size_bytes,
                ),
                MemoryPacking::Aos => (component_count * component_size_bytes, component_size_bytes),
            };

            let total_bytes = resource.cardinality * component_count * component_size_bytes;

            // [LAW:single-enforcer] State vs Arena routing is determined by
            // the resource's ID prefix. This is the single place that makes
            // this decision — the emitter reads the resolved storage_location.
            let storage_location = if resource.id.starts_with("state:") {
                ResourceStorageLocation::State
            } else {
                ResourceStorageLocation::Arena
            };

            map.insert(
                resource.id.clone(),
                ResolvedResource {
                    base_offset_bytes: current_offset_bytes,
                    lane_stride_bytes,
                    component_stride_bytes,
                    total_bytes,
                    storage_location,
                    ubo_vec4_index: 0,
                    ubo_component: 0,
                    texture_desc: None,
                },
            );

            current_offset_bytes += total_bytes;
        }

        Self {
            map,
            total_arena_bytes: current_offset_bytes,
        }
    }
}

/// A created GPU Texture2D resource with its view.
pub struct GpuTexture2DResource {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub desc: Texture2DDescriptor,
}

pub struct GpuMemoryArena {
    pub frame_header: FrameHeader,
    pub symbol_resolver: SymbolResolver,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_bind_group: wgpu::BindGroup,
    pub instance_buffer: wgpu::Buffer,
    pub topology_buffer: wgpu::Buffer,
    pub sink_table_buffer: wgpu::Buffer,
    pub indirect_buffer: wgpu::Buffer,
    // [RECOVER-11] Atlas data storage buffer for Type5 MSDF text rendering.
    pub atlas_buffer: wgpu::Buffer,
    pub assembly_write_bind_group: wgpu::BindGroup,
    pub draw_prep_bind_group: wgpu::BindGroup,
    pub instance_bind_group: wgpu::BindGroup,
    pub topology_bind_group: wgpu::BindGroup,
    /// Texture2D resources keyed by symbolic resource ID.
    /// [LAW:one-source-of-truth] The texture map is the single owner of GPU
    /// texture objects for fluid sim / compute resources.
    texture_resources: std::collections::HashMap<String, GpuTexture2DResource>,
    assembly_layout: wgpu::BindGroupLayout,
    draw_prep_layout: wgpu::BindGroupLayout,
    instance_layout: wgpu::BindGroupLayout,
    topology_layout: wgpu::BindGroupLayout,
    state_layout: wgpu::BindGroupLayout,
    compiler_simulation_layout: wgpu::BindGroupLayout,
    arena_render_layout: wgpu::BindGroupLayout,
    instance_capacity_bytes: u64,
    topology_capacity_words: usize,
    sink_table_capacity_words: usize,
    indirect_capacity_words: usize,
    state_buffers: [wgpu::Buffer; 2],
    compiler_arena_buffers: [wgpu::Buffer; 2],
    state_bind_groups: [wgpu::BindGroup; 2],
    compiler_arena_bind_groups: [wgpu::BindGroup; 2],
    compiler_simulation_bind_groups: [wgpu::BindGroup; 2],
    // [RECOVER-07] Bind groups for vertex-stage arena reads (one per ping-pong buffer).
    arena_render_bind_groups: [wgpu::BindGroup; 2],
    staging_buffers: [wgpu::Buffer; 2],
    // [RECOVER-10] Dedicated staging buffer for indirect-args readback so
    // instance staging and indirect-args staging can be in-flight independently.
    indirect_staging_buffer: wgpu::Buffer,
    ping_pong_index: usize,
}

impl GpuMemoryArena {
    fn clear_buffer_words(queue: &wgpu::Queue, buffer: &wgpu::Buffer) {
        // [LAW:no-silent-fallbacks] Simulation/state planes are explicitly
        // zero-initialized before use; never rely on undefined GPU memory.
        // [LAW:single-enforcer] This helper is the canonical boundary for
        // simulation-plane zeroing on reset.
        const ZERO_CHUNK: [u8; CLEAR_BUFFER_CHUNK_BYTES] = [0u8; CLEAR_BUFFER_CHUNK_BYTES];
        for (offset_bytes, chunk_len) in BufferClearPlan::new(buffer.size()) {
            queue.write_buffer(buffer, offset_bytes, &ZERO_CHUNK[..chunk_len]);
        }
    }

    pub fn clear_simulation_planes(&self, queue: &wgpu::Queue) {
        // [LAW:no-silent-fallbacks] Simulation state must start from a
        // deterministic finite baseline; uninitialized GPU memory is invalid.
        Self::clear_buffer_words(queue, &self.state_buffers[0]);
        Self::clear_buffer_words(queue, &self.state_buffers[1]);
        Self::clear_buffer_words(queue, &self.compiler_arena_buffers[0]);
        Self::clear_buffer_words(queue, &self.compiler_arena_buffers[1]);
    }

    pub fn rebuild_buffers_from_resolver(&mut self, device: &wgpu::Device, resolver: &SymbolResolver) {
        let required_bytes = (resolver.total_arena_bytes as u64).max(16);
        let current_bytes = self.compiler_arena_buffers[0].size();

        if required_bytes > current_bytes {
            // Re-allocate arena buffers
            self.compiler_arena_buffers = [
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("CompilerArenaBuffer.A"),
                    size: required_bytes,
                    usage: wgpu::BufferUsages::STORAGE
                        | wgpu::BufferUsages::COPY_DST
                        | wgpu::BufferUsages::COPY_SRC,
                    mapped_at_creation: false,
                }),
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("CompilerArenaBuffer.B"),
                    size: required_bytes,
                    usage: wgpu::BufferUsages::STORAGE
                        | wgpu::BufferUsages::COPY_DST
                        | wgpu::BufferUsages::COPY_SRC,
                    mapped_at_creation: false,
                }),
            ];
            // [LAW:one-source-of-truth] Bind groups MUST be rebuilt after buffer re-allocation.
            self.rebuild_arena_bind_groups(device);
        }

        // Create Texture2D resources for entries with Texture2D storage location.
        // [LAW:single-enforcer] This is the single boundary where Texture2D
        // manifest entries are fulfilled by creating wgpu::Texture objects.
        self.texture_resources.clear();
        for (resource_id, resolved) in &resolver.map {
            if resolved.storage_location != ResourceStorageLocation::Texture2D {
                continue;
            }
            let desc = resolved.texture_desc.as_ref().unwrap_or_else(|| {
                panic!("Texture2D resource '{}' missing texture descriptor", resource_id)
            });
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some(resource_id),
                size: wgpu::Extent3d {
                    width: desc.width,
                    height: desc.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: desc.format,
                usage: wgpu::TextureUsages::STORAGE_BINDING
                    | wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            self.texture_resources.insert(resource_id.clone(), GpuTexture2DResource {
                texture,
                view,
                desc: desc.clone(),
            });
        }
    }

    /// Look up a Texture2D resource by its symbolic ID.
    pub fn get_texture(&self, resource_id: &str) -> Option<&GpuTexture2DResource> {
        self.texture_resources.get(resource_id)
    }

    fn rebuild_arena_bind_groups(&mut self, device: &wgpu::Device) {
        self.compiler_arena_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("CompilerArena.BindGroup.A"),
                layout: &self.state_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.compiler_arena_buffers[0].as_entire_binding(),
                }],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("CompilerArena.BindGroup.B"),
                layout: &self.state_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.compiler_arena_buffers[1].as_entire_binding(),
                }],
            }),
        ];

        self.compiler_simulation_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute.CompilerSimulation.BindGroup.A"),
                layout: &self.compiler_simulation_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.compiler_arena_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.compiler_arena_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: self.state_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: self.state_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: self.uniform_buffer.as_entire_binding(),
                    },
                ],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute.CompilerSimulation.BindGroup.B"),
                layout: &self.compiler_simulation_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.compiler_arena_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.compiler_arena_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: self.state_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: self.state_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: self.uniform_buffer.as_entire_binding(),
                    },
                ],
            }),
        ];

        self.arena_render_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Render.Arena.BindGroup.A"),
                layout: &self.arena_render_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.compiler_arena_buffers[0].as_entire_binding(),
                }],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Render.Arena.BindGroup.B"),
                layout: &self.arena_render_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.compiler_arena_buffers[1].as_entire_binding(),
                }],
            }),
        ];
    }

    pub fn new(
        device: &wgpu::Device,
        uniform_layout: &wgpu::BindGroupLayout,
        state_layout: &wgpu::BindGroupLayout,
        compiler_simulation_layout: &wgpu::BindGroupLayout,
        assembly_layout: &wgpu::BindGroupLayout,
        draw_prep_layout: &wgpu::BindGroupLayout,
        instance_layout: &wgpu::BindGroupLayout,
        topology_layout: &wgpu::BindGroupLayout,
        arena_render_layout: &wgpu::BindGroupLayout,
        max_particles: usize,
        max_shapes: usize,
    ) -> Self {
        // [LAW:one-source-of-truth] Uniform buffer is derived transport that
        // mirrors the canonical arena header. See publish_frame_header().
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("FrameHeader.UniformTransport"),
            size: std::mem::size_of::<FrameHeader>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("FrameHeader.UniformTransport.BindGroup"),
            layout: uniform_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let state_buffer_bytes = (max_particles
            .saturating_mul(4)
            .saturating_mul(std::mem::size_of::<f32>())) as u64;
        let state_buffers = [
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("StateBuffer.A"),
                size: state_buffer_bytes.max(16),
                usage: wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_DST
                    | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            }),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("StateBuffer.B"),
                size: state_buffer_bytes.max(16),
                usage: wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_DST
                    | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            }),
        ];
        let state_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("State.BindGroup.A"),
                layout: state_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: state_buffers[0].as_entire_binding(),
                }],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("State.BindGroup.B"),
                layout: state_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: state_buffers[1].as_entire_binding(),
                }],
            }),
        ];
        let compiler_arena_buffers = [
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("CompilerArenaBuffer.A"),
                size: state_buffer_bytes.max(16),
                usage: wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_DST
                    | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            }),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("CompilerArenaBuffer.B"),
                size: state_buffer_bytes.max(16),
                usage: wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_DST
                    | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            }),
        ];
        let compiler_arena_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("CompilerArena.BindGroup.A"),
                layout: state_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: compiler_arena_buffers[0].as_entire_binding(),
                }],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("CompilerArena.BindGroup.B"),
                layout: state_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: compiler_arena_buffers[1].as_entire_binding(),
                }],
            }),
        ];

        let initial_instance_bytes = (max_shapes
            .saturating_mul(INSTANCE_FLOATS_PER_RECORD)
            .saturating_mul(std::mem::size_of::<f32>()))
            as u64;
        let initial_topology_words = max_shapes.saturating_mul(SHAPE_BANK_HEADER_WORDS);
        let initial_sink_table_words = SINK_TABLE_HEADER_WORDS
            + max_shapes.saturating_mul(SINK_TABLE_RECORD_WORDS)
            + max_shapes.saturating_mul(SINK_TABLE_DESCRIPTOR_WORDS);
        let initial_indirect_words = max_shapes
            .saturating_mul(INDIRECT_INDEXED_STRIDE_WORDS + INDIRECT_NON_INDEXED_STRIDE_WORDS);

        let instance_capacity_bytes = initial_instance_bytes
            .max((INSTANCE_FLOATS_PER_RECORD * std::mem::size_of::<f32>()) as u64);
        let topology_capacity_words = initial_topology_words.max(SHAPE_BANK_HEADER_WORDS);
        let sink_table_capacity_words = initial_sink_table_words.max(SINK_TABLE_HEADER_WORDS);
        let indirect_capacity_words = initial_indirect_words.max(INDIRECT_WORDS_PER_RECORD);

        let instance_buffer = Self::create_instance_buffer(device, instance_capacity_bytes);
        let topology_buffer = Self::create_topology_buffer(device, topology_capacity_words);
        let sink_table_buffer = Self::create_sink_table_buffer(device, sink_table_capacity_words);
        let indirect_buffer = Self::create_indirect_buffer(device, indirect_capacity_words);
        // [RECOVER-11] Placeholder atlas buffer (empty until text is rendered).
        let atlas_buffer = Self::create_atlas_buffer(device, 4);

        let assembly_write_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ShapeBank.AssemblyWrite.BindGroup"),
            layout: assembly_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: instance_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: sink_table_buffer.as_entire_binding(),
                },
            ],
        });
        let draw_prep_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("DrawPrep.BindGroup"),
            layout: draw_prep_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: sink_table_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: topology_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: indirect_buffer.as_entire_binding(),
                },
            ],
        });
        let instance_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Render.Instance.BindGroup"),
            layout: instance_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: instance_buffer.as_entire_binding(),
            }],
        });
        // [RECOVER-11] Topology bind group includes atlas data buffer.
        let topology_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Render.Topology.BindGroup"),
            layout: topology_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: topology_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: atlas_buffer.as_entire_binding(),
                },
            ],
        });

        let staging_size = state_buffer_bytes.max(16);
        let staging_buffers = [
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Debug.Staging.A"),
                size: staging_size,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Debug.Staging.B"),
                size: staging_size,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
        ];
        // [RECOVER-10] [LAW:single-enforcer] Dedicated indirect-args readback
        // staging buffer so instance and indirect readback are independent.
        let indirect_staging_bytes = (indirect_capacity_words.max(INDIRECT_WORDS_PER_RECORD)
            * std::mem::size_of::<u32>()) as u64;
        let indirect_staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Debug.IndirectStaging"),
            size: indirect_staging_bytes.max(16),
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        // [LAW:single-enforcer] Compiler simulation bind groups are constructed
        // once at arena creation from the canonical compiler layout.
        let compiler_simulation_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute.CompilerSimulation.BindGroup.A"),
                layout: compiler_simulation_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: compiler_arena_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: compiler_arena_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: state_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: state_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: uniform_buffer.as_entire_binding(),
                    },
                ],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute.CompilerSimulation.BindGroup.B"),
                layout: compiler_simulation_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: compiler_arena_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: compiler_arena_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: state_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: state_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: uniform_buffer.as_entire_binding(),
                    },
                ],
            }),
        ];

        // [RECOVER-07] Bind groups for vertex-stage arena reads (one per
        // ping-pong buffer). The render pass binds the final simulation output.
        let arena_render_bind_groups = [
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Render.Arena.BindGroup.A"),
                layout: arena_render_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: compiler_arena_buffers[0].as_entire_binding(),
                }],
            }),
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Render.Arena.BindGroup.B"),
                layout: arena_render_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: compiler_arena_buffers[1].as_entire_binding(),
                }],
            }),
        ];

        Self {
            frame_header: FrameHeader::default(),
            symbol_resolver: SymbolResolver::new(),
            uniform_buffer,
            uniform_bind_group,
            instance_buffer,
            topology_buffer,
            sink_table_buffer,
            indirect_buffer,
            atlas_buffer,
            assembly_write_bind_group,
            draw_prep_bind_group,
            instance_bind_group,
            topology_bind_group,
            texture_resources: std::collections::HashMap::new(),
            assembly_layout: assembly_layout.clone(),
            draw_prep_layout: draw_prep_layout.clone(),
            instance_layout: instance_layout.clone(),
            topology_layout: topology_layout.clone(),
            state_layout: state_layout.clone(),
            compiler_simulation_layout: compiler_simulation_layout.clone(),
            arena_render_layout: arena_render_layout.clone(),
            instance_capacity_bytes,
            topology_capacity_words,
            sink_table_capacity_words,
            indirect_capacity_words,
            state_buffers,
            compiler_arena_buffers,
            state_bind_groups,
            compiler_arena_bind_groups,
            compiler_simulation_bind_groups,
            arena_render_bind_groups,
            staging_buffers,
            indirect_staging_buffer,
            ping_pong_index: 0,
        }
    }

    // [LAW:one-source-of-truth] Frame header is written to the arena's read
    // buffer at offset 0 (canonical Zone 1 home) and mirrored to the uniform
    // buffer (derived transport for GPU binding convenience).
    // [LAW:single-enforcer] This method is the single write boundary for
    // per-frame state publication to GPU memory.
    pub fn publish_frame_header(&mut self, queue: &wgpu::Queue, header: FrameHeader) {
        self.frame_header = header;
        // Canonical write: arena header zone (offset 0) of the read buffer.
        // The compiler reserves ARENA_HEADER_FLOATS at the start of every
        // arena buffer (storage-class.ts DEFAULT_ARENA_ALIGNMENT_POLICY).
        queue.write_buffer(
            &self.compiler_arena_buffers[self.ping_pong_index],
            0,
            bytes_of(&self.frame_header),
        );
        // Derived transport: uniform buffer mirrors the arena header so
        // existing shader bindings (var<uniform>) continue to work.
        queue.write_buffer(&self.uniform_buffer, 0, bytes_of(&self.frame_header));
    }

    pub fn get_compute_read_bind_group(&self) -> &wgpu::BindGroup {
        &self.state_bind_groups[self.ping_pong_index]
    }

    pub fn get_compute_write_bind_group(&self) -> &wgpu::BindGroup {
        let write_index = (self.ping_pong_index + 1) & 1;
        &self.state_bind_groups[write_index]
    }

    pub fn get_compiler_arena_write_bind_group(&self) -> &wgpu::BindGroup {
        let write_index = (self.ping_pong_index + 1) & 1;
        &self.compiler_arena_bind_groups[write_index]
    }

    pub fn get_compiler_arena_bind_group_for_index(&self, read_index: usize) -> &wgpu::BindGroup {
        &self.compiler_arena_bind_groups[read_index & 1]
    }

    pub fn get_compiler_simulation_bind_group(&self) -> &wgpu::BindGroup {
        // [LAW:one-source-of-truth] Compiler simulation dispatch always reads
        // from the canonical arena-owned ping/pong bind-group pair.
        &self.compiler_simulation_bind_groups[self.ping_pong_index]
    }

    pub fn get_compiler_simulation_bind_group_for_index(
        &self,
        read_index: usize,
    ) -> &wgpu::BindGroup {
        // [LAW:dataflow-not-control-flow] Multi-pass simulation chaining is
        // expressed by deterministic ping/pong index progression per pass.
        &self.compiler_simulation_bind_groups[read_index & 1]
    }

    // [RECOVER-07] Returns the arena bind group for the current ping-pong read
    // buffer. After simulation completes, ping_pong_index points to the buffer
    // containing the final computed arena data.
    pub fn get_arena_render_bind_group(&self) -> &wgpu::BindGroup {
        &self.arena_render_bind_groups[self.ping_pong_index]
    }

    pub fn read_state_buffer(&self) -> &wgpu::Buffer {
        &self.state_buffers[self.ping_pong_index]
    }

    pub fn debug_staging_buffer(&self) -> &wgpu::Buffer {
        &self.staging_buffers[self.ping_pong_index & 1]
    }

    // [RECOVER-10] [LAW:single-enforcer] One canonical staging buffer for
    // indirect-args readback, independent of instance-payload staging.
    pub fn indirect_staging_buffer(&self) -> &wgpu::Buffer {
        &self.indirect_staging_buffer
    }

    pub fn swap_ping_pong(&mut self) {
        self.ping_pong_index = (self.ping_pong_index + 1) & 1;
    }

    pub fn set_ping_pong_index(&mut self, index: usize) {
        self.ping_pong_index = index & 1;
    }

    pub fn ping_pong_index(&self) -> usize {
        self.ping_pong_index
    }

    pub fn write_shape_bank_words(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        words: &[u32],
    ) {
        let resized = self.ensure_topology_capacity(device, words.len());
        if resized {
            self.rebuild_topology_bind_group(device);
            self.rebuild_draw_prep_bind_group(device);
        }
        if !words.is_empty() {
            queue.write_buffer(&self.topology_buffer, 0, cast_slice(words));
        }
    }

    pub fn write_sink_table_words(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        words: &[u32],
    ) {
        let resized = self.ensure_sink_table_capacity(device, words.len());
        if resized {
            self.rebuild_assembly_write_bind_group(device);
            self.rebuild_draw_prep_bind_group(device);
        }
        if !words.is_empty() {
            queue.write_buffer(&self.sink_table_buffer, 0, cast_slice(words));
        }
    }

    pub fn write_indirect_words(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        words: &[u32],
    ) {
        let resized = self.ensure_indirect_capacity(device, words.len());
        if resized {
            self.rebuild_draw_prep_bind_group(device);
        }
        if !words.is_empty() {
            queue.write_buffer(&self.indirect_buffer, 0, cast_slice(words));
        }
    }

    fn create_instance_buffer(device: &wgpu::Device, size_bytes: u64) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.InstanceBuffer"),
            size: size_bytes.max(16),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        })
    }

    fn create_topology_buffer(device: &wgpu::Device, words: usize) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.TopologyBuffer"),
            size: ((words.max(1) * std::mem::size_of::<u32>()) as u64).max(16),
            // [LAW:one-source-of-truth] TopologyBank is both the storage buffer for
            // vertex-pulling (bind group 2) AND the index buffer for indexed draws.
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::INDEX,
            mapped_at_creation: false,
        })
    }

    fn create_sink_table_buffer(device: &wgpu::Device, words: usize) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.DrawPrepSinkTableBuffer"),
            size: ((words.max(1) * std::mem::size_of::<u32>()) as u64).max(16),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    }

    fn create_indirect_buffer(device: &wgpu::Device, words: usize) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.IndirectArgsBuffer"),
            size: ((words.max(INDIRECT_WORDS_PER_RECORD) * std::mem::size_of::<u32>()) as u64)
                .max((INDIRECT_WORDS_PER_RECORD * std::mem::size_of::<u32>()) as u64),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::INDIRECT
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        })
    }

    fn ensure_instance_capacity(&mut self, device: &wgpu::Device, required_floats: usize) -> bool {
        let required_bytes = (required_floats.saturating_mul(std::mem::size_of::<f32>())) as u64;
        if required_bytes <= self.instance_capacity_bytes {
            return false;
        }
        let mut next_capacity = self.instance_capacity_bytes.max(16);
        while next_capacity < required_bytes {
            next_capacity = next_capacity.saturating_mul(2);
        }
        self.instance_buffer = Self::create_instance_buffer(device, next_capacity);
        self.instance_capacity_bytes = next_capacity;
        true
    }

    fn ensure_topology_capacity(&mut self, device: &wgpu::Device, required_words: usize) -> bool {
        if required_words <= self.topology_capacity_words {
            return false;
        }
        let mut next_capacity = self.topology_capacity_words.max(SHAPE_BANK_HEADER_WORDS);
        while next_capacity < required_words {
            next_capacity = next_capacity.saturating_mul(2);
        }
        self.topology_buffer = Self::create_topology_buffer(device, next_capacity);
        self.topology_capacity_words = next_capacity;
        true
    }

    fn ensure_sink_table_capacity(&mut self, device: &wgpu::Device, required_words: usize) -> bool {
        if required_words <= self.sink_table_capacity_words {
            return false;
        }
        let mut next_capacity = self.sink_table_capacity_words.max(SINK_TABLE_HEADER_WORDS);
        while next_capacity < required_words {
            next_capacity = next_capacity.saturating_mul(2);
        }
        self.sink_table_buffer = Self::create_sink_table_buffer(device, next_capacity);
        self.sink_table_capacity_words = next_capacity;
        true
    }

    fn ensure_indirect_capacity(&mut self, device: &wgpu::Device, required_words: usize) -> bool {
        if required_words <= self.indirect_capacity_words {
            return false;
        }
        let mut next_capacity = self.indirect_capacity_words.max(INDIRECT_WORDS_PER_RECORD);
        while next_capacity < required_words {
            next_capacity = next_capacity.saturating_mul(2);
        }
        self.indirect_buffer = Self::create_indirect_buffer(device, next_capacity);
        // [RECOVER-10] Resize indirect staging buffer to match new capacity.
        let staging_bytes = (next_capacity * std::mem::size_of::<u32>()) as u64;
        self.indirect_staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Debug.IndirectStaging"),
            size: staging_bytes.max(16),
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        self.indirect_capacity_words = next_capacity;
        true
    }

    fn rebuild_assembly_write_bind_group(&mut self, device: &wgpu::Device) {
        self.assembly_write_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ShapeBank.AssemblyWrite.BindGroup"),
            layout: &self.assembly_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.instance_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.sink_table_buffer.as_entire_binding(),
                },
            ],
        });
    }

    fn rebuild_draw_prep_bind_group(&mut self, device: &wgpu::Device) {
        self.draw_prep_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("DrawPrep.BindGroup"),
            layout: &self.draw_prep_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.sink_table_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.topology_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.indirect_buffer.as_entire_binding(),
                },
            ],
        });
    }

    fn rebuild_instance_bind_group(&mut self, device: &wgpu::Device) {
        self.instance_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Render.Instance.BindGroup"),
            layout: &self.instance_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: self.instance_buffer.as_entire_binding(),
            }],
        });
    }

    // [RECOVER-11] Topology bind group includes atlas data buffer.
    fn rebuild_topology_bind_group(&mut self, device: &wgpu::Device) {
        self.topology_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Render.Topology.BindGroup"),
            layout: &self.topology_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.topology_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.atlas_buffer.as_entire_binding(),
                },
            ],
        });
    }

    // [RECOVER-11] Create atlas storage buffer for Type5 MSDF text rendering.
    fn create_atlas_buffer(device: &wgpu::Device, words: usize) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.AtlasBuffer"),
            size: ((words.max(4) * std::mem::size_of::<u32>()) as u64).max(16),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    }

    // [RECOVER-11] Upload MSDF atlas texture data to the atlas storage buffer.
    // Layout: [0]=width (u32), [1]=height (u32), [2..]=packed RGBA pixels (u32 each).
    pub fn write_atlas_data(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, words: &[u32]) {
        let required_words = words.len();
        let current_words = (self.atlas_buffer.size() as usize) / std::mem::size_of::<u32>();
        if required_words > current_words {
            self.atlas_buffer = Self::create_atlas_buffer(device, required_words);
            self.rebuild_topology_bind_group(device);
        }
        if !words.is_empty() {
            queue.write_buffer(&self.atlas_buffer, 0, cast_slice(words));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{BufferClearPlan, CLEAR_BUFFER_CHUNK_BYTES};

    #[test]
    fn clear_plan_empty_buffer_has_no_chunks() {
        let chunks: Vec<(u64, usize)> = BufferClearPlan::new(0).collect();
        assert!(chunks.is_empty());
    }

    #[test]
    fn clear_plan_exact_chunk_uses_single_write() {
        let chunks: Vec<(u64, usize)> =
            BufferClearPlan::new(CLEAR_BUFFER_CHUNK_BYTES as u64).collect();
        assert_eq!(chunks, vec![(0, CLEAR_BUFFER_CHUNK_BYTES)]);
    }

    #[test]
    fn clear_plan_large_buffer_splits_into_bounded_chunks() {
        let total_bytes = (CLEAR_BUFFER_CHUNK_BYTES as u64 * 10) + 123;
        let chunks: Vec<(u64, usize)> = BufferClearPlan::new(total_bytes).collect();
        assert_eq!(chunks.len(), 11);
        assert_eq!(chunks[0], (0, CLEAR_BUFFER_CHUNK_BYTES));
        assert_eq!(
            chunks[9],
            (
                (CLEAR_BUFFER_CHUNK_BYTES as u64) * 9,
                CLEAR_BUFFER_CHUNK_BYTES
            )
        );
        assert_eq!(chunks[10], ((CLEAR_BUFFER_CHUNK_BYTES as u64) * 10, 123));
        assert!(chunks
            .iter()
            .all(|(_, chunk_len)| *chunk_len <= CLEAR_BUFFER_CHUNK_BYTES));
    }
}
