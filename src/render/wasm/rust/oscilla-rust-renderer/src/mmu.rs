//! MMU — Memory Management Unit for the WASM renderer.
//!
//! Translates the semantic `MemoryManifest` JSON into physical WebGPU buffers
//! and a symbol resolution map the AST translator uses to patch memory addresses.
//!
//! Spec authority: design-docs/WASM-MMU-Spec.md

use std::collections::HashMap;

use wgpu::util::DeviceExt;

use crate::contract::{
    CompilationDiagnostic, DepthCompare, MemoryDataType, MemoryManifest, SamplerAddressMode,
    SamplerFilterMode, TextureDimension, WgslType,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Physical layout of a symbol in GPU memory.
#[derive(Debug, Clone)]
pub struct PhysicalSymbol {
    pub buffer_kind: BufferKind,
    pub domain_id: Option<String>,
    /// Offset in 4-byte words (u32/f32 index), not bytes.
    pub word_offset: u32,
    pub data_type: MemoryDataType,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BufferKind {
    GlobalUniform,
    ArenaScalar,
    DomainStandard,
    DomainAtomic,
}

/// Static geometry allocated from the shape bank.
pub struct AllocatedShape {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: Option<wgpu::Buffer>,
    pub vertex_count: u32,
    pub index_count: u32,
    pub topology: wgpu::PrimitiveTopology,
    pub vertex_stride: u32,
    pub vertex_attributes: Vec<wgpu::VertexAttribute>,
    pub position_type: WgslType,
}

/// Allocated texture with its view.
pub struct AllocatedTexture {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub _resolve_texture: Option<wgpu::Texture>,
    pub resolve_view: Option<wgpu::TextureView>,
    pub format: wgpu::TextureFormat,
    pub dimension: wgpu::TextureViewDimension,
}

/// The complete GPU memory arena allocated from a manifest.
pub struct GpuMemoryArena {
    pub globals_buffer: wgpu::Buffer,
    pub scalars_buffer: wgpu::Buffer,
    pub domain_buffers: HashMap<String, wgpu::Buffer>,
    /// Separate atomic buffers for domains with atomic fields (bifurcation).
    /// Only present for domains that have at least one atomic<u32>/atomic<i32> field.
    pub domain_atomic_buffers: HashMap<String, wgpu::Buffer>,
    pub shape_bank: HashMap<String, AllocatedShape>,
    pub indirect_buffer: wgpu::Buffer,
    pub indirect_offsets: HashMap<String, u64>,
    pub textures: HashMap<String, AllocatedTexture>,
    pub samplers: HashMap<String, wgpu::Sampler>,
    pub symbol_map: HashMap<String, PhysicalSymbol>,
    pub global_offset_map: HashMap<String, u32>,
    pub frame_payload_length: u32,
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/// Alignment for domain field arrays in words (256 bytes / 4 bytes per word).
const DOMAIN_ALIGNMENT_WORDS: u32 = 64;

/// Minimum buffer size in bytes (WebGPU requires non-zero binding sizes).
const MIN_BUFFER_BYTES: u64 = 16;
const INDIRECT_PACKET_BYTES: u64 = 16;
const INDIRECT_BIND_ALIGNMENT_BYTES: u64 = 256;

pub fn allocate_arena(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    manifest: &MemoryManifest,
) -> Result<GpuMemoryArena, Vec<CompilationDiagnostic>> {
    let mut symbol_map = HashMap::new();
    let mut global_offset_map = HashMap::new();

    // Phase A: Globals (Uniform buffer, std140)
    let mut globals_word_count: u32 = 0;
    let mut global_keys: Vec<_> = manifest.globals.keys().collect();
    global_keys.sort(); // deterministic ordering
    for key in &global_keys {
        let spec = &manifest.globals[*key];
        let words = spec.data_type.word_count();

        // std140: vec4/mat4x4 must be 16-byte aligned (4 words)
        if words >= 4 && globals_word_count % 4 != 0 {
            globals_word_count = align_up(globals_word_count, 4);
        }

        symbol_map.insert(
            (*key).clone(),
            PhysicalSymbol {
                buffer_kind: BufferKind::GlobalUniform,
                domain_id: None,
                word_offset: globals_word_count,
                data_type: spec.data_type,
            },
        );
        global_offset_map.insert((*key).clone(), globals_word_count);
        globals_word_count += words;
    }

    // std140: total size must be multiple of 16 bytes (4 words)
    let globals_padded = align_up(globals_word_count.max(1), 4);
    // Globals use STORAGE (not UNIFORM) because runtime-sized arrays
    // are only valid in the Storage address space in WGSL/naga.
    let globals_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("globals"),
        size: ((globals_padded * 4) as u64).max(MIN_BUFFER_BYTES),
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Phase A.1: Write global initial values from manifest
    if globals_word_count > 0 {
        let mut init_data = vec![0u32; globals_padded as usize];
        for key in &global_keys {
            let spec = &manifest.globals[*key];
            let sym = &symbol_map[*key];
            let offset = sym.word_offset as usize;
            match &spec.default_value {
                serde_json::Value::Number(n) => {
                    let f = n.as_f64().unwrap_or(0.0) as f32;
                    init_data[offset] = f.to_bits();
                }
                serde_json::Value::Array(arr) => {
                    for (i, v) in arr.iter().enumerate() {
                        let f = v.as_f64().unwrap_or(0.0) as f32;
                        init_data[offset + i] = f.to_bits();
                    }
                }
                _ => {}
            }
        }
        queue.write_buffer(&globals_buffer, 0, bytemuck::cast_slice(&init_data));
    }

    // Phase A.5: Arena scalars (Storage buffer, packed)
    let mut scalars_word_count: u32 = 0;
    let mut scalar_keys: Vec<_> = manifest.arena_scalars.keys().collect();
    scalar_keys.sort();
    for key in &scalar_keys {
        let spec = &manifest.arena_scalars[*key];
        let words = spec.data_type.word_count();
        // Align multi-word types to 4-word boundary (std430)
        if words >= 4 && scalars_word_count % 4 != 0 {
            scalars_word_count = align_up(scalars_word_count, 4);
        }
        symbol_map.insert(
            (*key).clone(),
            PhysicalSymbol {
                buffer_kind: BufferKind::ArenaScalar,
                domain_id: None,
                word_offset: scalars_word_count,
                data_type: spec.data_type,
            },
        );
        scalars_word_count += words;
    }
    let scalars_buffer_size = ((scalars_word_count.max(4) * 4) as u64).max(MIN_BUFFER_BYTES);
    let scalars_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("arena_scalars"),
        size: scalars_buffer_size,
        usage: wgpu::BufferUsages::STORAGE
            | wgpu::BufferUsages::COPY_SRC
            | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Phase B: Domains (Storage buffers, SoA with 256-byte alignment per field)
    // Bifurcation: atomic fields go to a separate buffer because WGSL prohibits
    // bitcast on atomic types — they cannot coexist with f32-as-u32 in one binding.
    let mut domain_buffers = HashMap::new();
    let mut domain_atomic_buffers = HashMap::new();
    let mut domain_keys: Vec<_> = manifest.domains.keys().collect();
    domain_keys.sort();
    for domain_id in &domain_keys {
        let spec = &manifest.domains[*domain_id];
        let capacity = spec.capacity;
        let mut std_offset: u32 = 0;
        let mut atomic_offset: u32 = 0;

        let mut field_keys: Vec<_> = spec.fields.keys().collect();
        field_keys.sort();
        for field_key in &field_keys {
            let field = &spec.fields[*field_key];
            let is_atomic = field.data_type.is_atomic();
            let symbol_id = format!("{}:{}", domain_id, field_key);

            let (buffer_kind, word_offset) = if is_atomic {
                let offset = atomic_offset;
                atomic_offset += capacity;
                atomic_offset = align_up(atomic_offset, DOMAIN_ALIGNMENT_WORDS);
                (BufferKind::DomainAtomic, offset)
            } else {
                let offset = std_offset;
                std_offset += capacity;
                std_offset = align_up(std_offset, DOMAIN_ALIGNMENT_WORDS);
                (BufferKind::DomainStandard, offset)
            };

            symbol_map.insert(
                symbol_id,
                PhysicalSymbol {
                    buffer_kind,
                    domain_id: Some((*domain_id).clone()),
                    word_offset,
                    data_type: field.data_type,
                },
            );
        }

        // Standard buffer (f32/u32/i32 fields via bitcast)
        let std_bytes = ((std_offset * 4) as u64).max(MIN_BUFFER_BYTES);
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("domain_{}_std", domain_id)),
            size: std_bytes,
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        domain_buffers.insert((*domain_id).clone(), buffer);

        // Atomic buffer (only if domain has atomic fields)
        if atomic_offset > 0 {
            let atomic_bytes = ((atomic_offset * 4) as u64).max(MIN_BUFFER_BYTES);
            let atomic_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(&format!("domain_{}_atomic", domain_id)),
                size: atomic_bytes,
                usage: wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_SRC
                    | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            domain_atomic_buffers.insert((*domain_id).clone(), atomic_buffer);
        }
    }

    // Phase D: Shape bank (Vertex + Index buffers)
    let mut shape_bank = HashMap::new();
    let mut shape_keys: Vec<_> = manifest.shape_bank.keys().collect();
    shape_keys.sort();
    for shape_id in &shape_keys {
        let spec = &manifest.shape_bank[*shape_id];
        let v_bytes: Vec<u8> = spec
            .vertex_data
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();

        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some(&format!("{}_vbo", shape_id)),
            contents: &v_bytes,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        });

        let vertex_count = spec.vertex_data.len() as u32 * 4 / spec.vertex_layout.stride;

        let mut index_buffer = None;
        let mut index_count = 0u32;
        if let Some(ref i_data) = spec.index_data {
            let i_bytes: Vec<u8> = i_data.iter().flat_map(|i| i.to_le_bytes()).collect();
            index_buffer = Some(
                device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some(&format!("{}_ibo", shape_id)),
                    contents: &i_bytes,
                    usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                }),
            );
            index_count = i_data.len() as u32;
        }

        let topology = match spec.topology.as_str() {
            "point-list" => wgpu::PrimitiveTopology::PointList,
            "line-list" => wgpu::PrimitiveTopology::LineList,
            "line-strip" => wgpu::PrimitiveTopology::LineStrip,
            "triangle-strip" => wgpu::PrimitiveTopology::TriangleStrip,
            _ => wgpu::PrimitiveTopology::TriangleList,
        };
        let mut attribute_specs: Vec<_> = spec.vertex_layout.attributes.values().collect();
        attribute_specs.sort_by_key(|attr| attr.shader_location);
        let mut next_offset = 0u64;
        let mut position_type = None;
        let vertex_attributes: Vec<wgpu::VertexAttribute> = attribute_specs
            .into_iter()
            .map(|attr| {
                let (format, data_type, byte_width) = parse_vertex_format(&attr.format).map_err(|message| {
                    vec![CompilationDiagnostic {
                        severity: "fatal".into(),
                        phase: "mmu_allocation".into(),
                        block_id: None,
                        symbol_id: Some((*shape_id).clone()),
                        message,
                    }]
                })?;
                let resolved = wgpu::VertexAttribute {
                    format,
                    offset: next_offset,
                    shader_location: attr.shader_location,
                };
                next_offset += byte_width;
                if attr.shader_location == 0 {
                    position_type = Some(data_type);
                }
                Ok(resolved)
            })
            .collect::<Result<Vec<_>, Vec<CompilationDiagnostic>>>()?;
        if next_offset > spec.vertex_layout.stride as u64 {
            return Err(vec![CompilationDiagnostic {
                severity: "fatal".into(),
                phase: "mmu_allocation".into(),
                block_id: None,
                symbol_id: Some((*shape_id).clone()),
                message: format!(
                    "Shape '{}' vertexLayout.stride={} is smaller than packed attribute bytes={}",
                    shape_id, spec.vertex_layout.stride, next_offset
                ),
            }]);
        }
        let position_type = match position_type {
            Some(position_type) => position_type,
            None => {
                return Err(vec![CompilationDiagnostic {
                    severity: "fatal".into(),
                    phase: "mmu_allocation".into(),
                    block_id: None,
                    symbol_id: Some((*shape_id).clone()),
                    message: format!(
                        "Shape '{}' is missing a shaderLocation=0 position attribute",
                        shape_id
                    ),
                }]);
            }
        };

        shape_bank.insert(
            (*shape_id).clone(),
            AllocatedShape {
                vertex_buffer,
                index_buffer,
                vertex_count,
                index_count,
                topology,
                vertex_stride: spec.vertex_layout.stride,
                vertex_attributes,
                position_type,
            },
        );
    }

    // [LAW:one-source-of-truth] Domain ordering here owns the indirect packet
    // layout for the whole renderer. Install and execute consume this map.
    let indirect_offsets: HashMap<String, u64> = domain_keys
        .iter()
        .enumerate()
        .map(|(idx, domain_id)| {
            (
                (*domain_id).clone(),
                (idx as u64) * INDIRECT_BIND_ALIGNMENT_BYTES,
            )
        })
        .collect();

    // Indirect buffer: 4 × u32 = 16 bytes per domain packet, padded to WebGPU's
    // 256-byte storage-binding alignment between domains.
    let indirect_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("indirect"),
        size: ((domain_keys.len().max(1) as u64) * INDIRECT_BIND_ALIGNMENT_BYTES)
            .max(INDIRECT_PACKET_BYTES)
            .max(MIN_BUFFER_BYTES),
        usage: wgpu::BufferUsages::INDIRECT
            | wgpu::BufferUsages::STORAGE
            | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Phase C: Textures
    let mut textures = HashMap::new();
    let mut texture_keys: Vec<_> = manifest.textures.keys().collect();
    texture_keys.sort();
    for texture_id in &texture_keys {
        let spec = &manifest.textures[*texture_id];
        let width = resolve_dimension(&spec.width, 800); // default canvas width
        let height = spec
            .height
            .as_ref()
            .map(|h| resolve_dimension(h, 600))
            .unwrap_or(1);
        let depth = spec.depth_or_array_layers.unwrap_or(1);
        let mip_level_count = spec.mip_level_count.unwrap_or(1);
        let sample_count = spec.sample_count.unwrap_or(1);

        let format = parse_texture_format(&spec.format).map_err(|message| {
            vec![CompilationDiagnostic {
                severity: "fatal".into(),
                phase: "mmu_allocation".into(),
                block_id: None,
                symbol_id: Some((*texture_id).clone()),
                message,
            }]
        })?;
        let mut usage = wgpu::TextureUsages::empty();
        for u in &spec.usage {
            match u.as_str() {
                "storage" => usage |= wgpu::TextureUsages::STORAGE_BINDING,
                "sampled" => usage |= wgpu::TextureUsages::TEXTURE_BINDING,
                "render_attachment" => usage |= wgpu::TextureUsages::RENDER_ATTACHMENT,
                _ => {}
            }
        }
        // External sources need COPY_DST
        if spec.external_source.is_some() {
            usage |= wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING;
        }
        let needs_color_resolve = sample_count > 1
            && usage.contains(wgpu::TextureUsages::RENDER_ATTACHMENT)
            && !is_depth_or_stencil_format(format);

        let dim = match spec.dimension {
            TextureDimension::D1 => wgpu::TextureDimension::D1,
            TextureDimension::D2 | TextureDimension::D2Array => wgpu::TextureDimension::D2,
            TextureDimension::D3 => wgpu::TextureDimension::D3,
            // Cube textures present as D2 with 6 layers at the wgpu Texture level;
            // the view dimension below carries the cube semantics.
            TextureDimension::Cube | TextureDimension::CubeArray => wgpu::TextureDimension::D2,
        };

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(texture_id),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: depth,
            },
            mip_level_count,
            sample_count,
            dimension: dim,
            format,
            usage: if needs_color_resolve {
                wgpu::TextureUsages::RENDER_ATTACHMENT
            } else {
                usage
            },
            view_formats: &[],
        });

        let view_dim = match spec.dimension {
            TextureDimension::D1 => wgpu::TextureViewDimension::D1,
            TextureDimension::D2 => wgpu::TextureViewDimension::D2,
            TextureDimension::D2Array => wgpu::TextureViewDimension::D2Array,
            TextureDimension::D3 => wgpu::TextureViewDimension::D3,
            TextureDimension::Cube => wgpu::TextureViewDimension::Cube,
            TextureDimension::CubeArray => wgpu::TextureViewDimension::CubeArray,
        };

        let view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some(&format!("{}_view", texture_id)),
            dimension: Some(view_dim),
            ..Default::default()
        });

        // [LAW:one-source-of-truth] The manifest texture spec owns the sample
        // count. The MMU derives a single-sample resolve target only so bind
        // groups keep one canonical sampled view for offscreen MSAA textures.
        let (_resolve_texture, resolve_view) = if needs_color_resolve {
            let resolve_texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some(&format!("{}_resolve", texture_id)),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: depth,
                },
                mip_level_count,
                sample_count: 1,
                dimension: dim,
                format,
                usage: usage | wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            let resolve_view = resolve_texture.create_view(&wgpu::TextureViewDescriptor {
                label: Some(&format!("{}_resolve_view", texture_id)),
                dimension: Some(view_dim),
                ..Default::default()
            });
            (Some(resolve_texture), Some(resolve_view))
        } else {
            (None, None)
        };

        textures.insert(
            (*texture_id).clone(),
            AllocatedTexture {
                texture,
                view,
                _resolve_texture,
                resolve_view,
                format,
                dimension: view_dim,
            },
        );
    }

    // Phase E: Samplers
    let mut samplers = HashMap::new();
    let mut sampler_keys: Vec<_> = manifest.samplers.keys().collect();
    sampler_keys.sort();
    for sampler_id in &sampler_keys {
        let spec = &manifest.samplers[*sampler_id];
        // [LAW:single-enforcer] Sampler defaults are normalized once at MMU
        // allocation so every caller gets the same WebGPU descriptor.
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some(sampler_id),
            address_mode_u: parse_address_mode(spec.address_mode_u),
            address_mode_v: parse_address_mode(spec.address_mode_v),
            address_mode_w: spec
                .address_mode_w
                .map(parse_address_mode)
                .unwrap_or(wgpu::AddressMode::ClampToEdge),
            mag_filter: parse_filter_mode(spec.mag_filter),
            min_filter: parse_filter_mode(spec.min_filter),
            mipmap_filter: parse_mipmap_filter_mode(
                spec.mipmap_filter.unwrap_or(SamplerFilterMode::Nearest),
            ),
            lod_min_clamp: spec.lod_min_clamp.unwrap_or(0.0),
            lod_max_clamp: spec.lod_max_clamp.unwrap_or(32.0),
            compare: spec.compare.map(compare_function_for),
            anisotropy_clamp: spec.max_anisotropy.unwrap_or(1),
            ..Default::default()
        });
        samplers.insert((*sampler_id).clone(), sampler);
    }

    // Phase G: Clear — write clearValues to scalars and domain buffers
    // Scalars: write clear/initial values (supports multi-word types)
    if scalars_word_count > 0 {
        let mut clear_data = vec![0u32; scalars_word_count as usize];
        for key in &scalar_keys {
            let spec = &manifest.arena_scalars[*key];
            let sym = &symbol_map[*key];
            let offset = sym.word_offset as usize;
            match &spec.clear_value {
                serde_json::Value::Number(n) => {
                    let v = n.as_f64().unwrap_or(0.0);
                    clear_data[offset] = if spec.data_type.is_f32() {
                        (v as f32).to_bits()
                    } else {
                        v as u32
                    };
                }
                serde_json::Value::Array(arr) => {
                    for (i, val) in arr.iter().enumerate() {
                        let f = val.as_f64().unwrap_or(0.0) as f32;
                        clear_data[offset + i] = f.to_bits();
                    }
                }
                _ => {}
            }
        }
        queue.write_buffer(&scalars_buffer, 0, bytemuck::cast_slice(&clear_data));
    }

    // Domains: write clear values for each field (route to correct buffer)
    for domain_id in &domain_keys {
        let spec = &manifest.domains[*domain_id];
        let mut field_keys: Vec<_> = spec.fields.keys().collect();
        field_keys.sort();
        for field_key in &field_keys {
            let field = &spec.fields[*field_key];
            let symbol_id = format!("{}:{}", domain_id, field_key);
            let sym = &symbol_map[&symbol_id];
            let buffer = if field.data_type.is_atomic() {
                &domain_atomic_buffers[*domain_id]
            } else {
                &domain_buffers[*domain_id]
            };
            let offset_bytes = (sym.word_offset * 4) as u64;
            let clear_word = if field.data_type.is_f32() {
                (field.clear_value as f32).to_bits()
            } else {
                field.clear_value as u32
            };
            let clear_data = vec![clear_word; spec.capacity as usize];
            queue.write_buffer(buffer, offset_bytes, bytemuck::cast_slice(&clear_data));
        }
    }

    Ok(GpuMemoryArena {
        globals_buffer,
        scalars_buffer,
        domain_buffers,
        domain_atomic_buffers,
        shape_bank,
        indirect_buffer,
        indirect_offsets,
        textures,
        samplers,
        symbol_map,
        global_offset_map,
        frame_payload_length: globals_padded,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn align_up(value: u32, alignment: u32) -> u32 {
    if alignment == 0 {
        return value;
    }
    let remainder = value % alignment;
    if remainder == 0 {
        value
    } else {
        value + alignment - remainder
    }
}

fn resolve_dimension(value: &serde_json::Value, canvas_pixels: u32) -> u32 {
    match value {
        serde_json::Value::Number(n) => n.as_u64().unwrap_or(1) as u32,
        serde_json::Value::Object(obj) => {
            if let Some(scale) = obj.get("scale").and_then(|s| s.as_f64()) {
                ((canvas_pixels as f64 * scale).round() as u32).max(1)
            } else {
                canvas_pixels
            }
        }
        _ => 1,
    }
}

pub fn is_depth_or_stencil_format(format: wgpu::TextureFormat) -> bool {
    matches!(
        format,
        wgpu::TextureFormat::Depth16Unorm
            | wgpu::TextureFormat::Depth24Plus
            | wgpu::TextureFormat::Depth24PlusStencil8
            | wgpu::TextureFormat::Depth32Float
            | wgpu::TextureFormat::Depth32FloatStencil8
            | wgpu::TextureFormat::Stencil8
    )
}

fn parse_texture_format(format: &str) -> Result<wgpu::TextureFormat, String> {
    // [LAW:dataflow-not-control-flow] Texture format variance is resolved once
    // at the MMU boundary; unsupported values fail explicitly instead of
    // branching into a silent fallback default.
    match format {
        "r8unorm" => Ok(wgpu::TextureFormat::R8Unorm),
        "bgra8unorm" => Ok(wgpu::TextureFormat::Bgra8Unorm),
        "rgba8unorm" => Ok(wgpu::TextureFormat::Rgba8Unorm),
        "rgba16float" => Ok(wgpu::TextureFormat::Rgba16Float),
        "r32float" => Ok(wgpu::TextureFormat::R32Float),
        "r32uint" => Ok(wgpu::TextureFormat::R32Uint),
        "rg32float" => Ok(wgpu::TextureFormat::Rg32Float),
        "rgba32float" => Ok(wgpu::TextureFormat::Rgba32Float),
        "depth24plus" => Ok(wgpu::TextureFormat::Depth24Plus),
        "depth32float" => Ok(wgpu::TextureFormat::Depth32Float),
        "depth24plus-stencil8" => Ok(wgpu::TextureFormat::Depth24PlusStencil8),
        "depth32float-stencil8" => Ok(wgpu::TextureFormat::Depth32FloatStencil8),
        "stencil8" => Ok(wgpu::TextureFormat::Stencil8),
        _ => Err(format!("Unsupported texture format '{format}' in manifest.textures")),
    }
}

fn parse_address_mode(mode: SamplerAddressMode) -> wgpu::AddressMode {
    match mode {
        SamplerAddressMode::ClampToEdge => wgpu::AddressMode::ClampToEdge,
        SamplerAddressMode::Repeat => wgpu::AddressMode::Repeat,
        SamplerAddressMode::MirrorRepeat => wgpu::AddressMode::MirrorRepeat,
    }
}

fn parse_filter_mode(mode: SamplerFilterMode) -> wgpu::FilterMode {
    match mode {
        SamplerFilterMode::Nearest => wgpu::FilterMode::Nearest,
        SamplerFilterMode::Linear => wgpu::FilterMode::Linear,
    }
}

fn parse_mipmap_filter_mode(mode: SamplerFilterMode) -> wgpu::MipmapFilterMode {
    match mode {
        SamplerFilterMode::Nearest => wgpu::MipmapFilterMode::Nearest,
        SamplerFilterMode::Linear => wgpu::MipmapFilterMode::Linear,
    }
}

fn parse_vertex_format(format: &str) -> Result<(wgpu::VertexFormat, WgslType, u64), String> {
    // [LAW:dataflow-not-control-flow] Vertex format variance is normalized once
    // during shape allocation so pipeline install consumes resolved layout data.
    match format {
        "float32x2" => Ok((wgpu::VertexFormat::Float32x2, WgslType::Vec2F32, 8)),
        "float32x3" => Ok((wgpu::VertexFormat::Float32x3, WgslType::Vec3F32, 12)),
        "float32x4" => Ok((wgpu::VertexFormat::Float32x4, WgslType::Vec4F32, 16)),
        _ => Err(format!("Unsupported vertex attribute format '{format}' in shape vertexLayout")),
    }
}

fn compare_function_for(mode: DepthCompare) -> wgpu::CompareFunction {
    match mode {
        DepthCompare::Never => wgpu::CompareFunction::Never,
        DepthCompare::Less => wgpu::CompareFunction::Less,
        DepthCompare::Equal => wgpu::CompareFunction::Equal,
        DepthCompare::LessEqual => wgpu::CompareFunction::LessEqual,
        DepthCompare::Greater => wgpu::CompareFunction::Greater,
        DepthCompare::NotEqual => wgpu::CompareFunction::NotEqual,
        DepthCompare::GreaterEqual => wgpu::CompareFunction::GreaterEqual,
        DepthCompare::Always => wgpu::CompareFunction::Always,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_texture_format;

    #[test]
    fn parse_texture_format_accepts_new_supported_formats() {
        assert_eq!(
            parse_texture_format("bgra8unorm").unwrap(),
            wgpu::TextureFormat::Bgra8Unorm
        );
        assert_eq!(
            parse_texture_format("r32uint").unwrap(),
            wgpu::TextureFormat::R32Uint
        );
        assert_eq!(
            parse_texture_format("depth24plus").unwrap(),
            wgpu::TextureFormat::Depth24Plus
        );
        assert_eq!(
            parse_texture_format("depth32float-stencil8").unwrap(),
            wgpu::TextureFormat::Depth32FloatStencil8
        );
        assert_eq!(
            parse_texture_format("stencil8").unwrap(),
            wgpu::TextureFormat::Stencil8
        );
    }

    #[test]
    fn parse_texture_format_rejects_unknown_formats() {
        let message = parse_texture_format("definitely-not-a-format").unwrap_err();
        assert!(message.contains("Unsupported texture format"));
        assert!(message.contains("definitely-not-a-format"));
    }
}
