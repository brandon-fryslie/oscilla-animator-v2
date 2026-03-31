//! MMU — Memory Management Unit for the WASM renderer.
//!
//! Translates the semantic `MemoryManifest` JSON into physical WebGPU buffers
//! and a symbol resolution map the AST translator uses to patch memory addresses.
//!
//! Spec authority: design-docs/WASM-MMU-Spec.md

use std::collections::HashMap;

use wgpu::util::DeviceExt;

use crate::contract::{CompilationDiagnostic, MemoryManifest};

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
    pub wgsl_type: String,
    pub is_atomic: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BufferKind {
    GlobalUniform,
    ArenaScalar,
    ArenaScalarAtomic,
    DomainStandard,
    DomainAtomic,
    DataStream,
}

pub struct DomainBuffers {
    pub standard: wgpu::Buffer,
    pub atomic: Option<wgpu::Buffer>,
}

/// Static geometry allocated from the shape bank.
pub struct AllocatedShape {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: Option<wgpu::Buffer>,
    pub vertex_count: u32,
    pub index_count: u32,
    pub topology: wgpu::PrimitiveTopology,
    pub vertex_stride: u32,
}

/// Allocated texture with its view.
pub struct AllocatedTexture {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub format: wgpu::TextureFormat,
    pub dimension: wgpu::TextureViewDimension,
}

/// The complete GPU memory arena allocated from a manifest.
pub struct GpuMemoryArena {
    pub globals_buffer: wgpu::Buffer,
    pub scalars_buffer: wgpu::Buffer,
    pub atomic_scalars_buffer: Option<wgpu::Buffer>,
    pub domain_buffers: HashMap<String, DomainBuffers>,
    pub data_stream_buffers: HashMap<String, wgpu::Buffer>,
    pub shape_bank: HashMap<String, AllocatedShape>,
    pub indirect_buffer: wgpu::Buffer,
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
        let words = global_type_word_count(&spec.wgsl_type);

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
                wgsl_type: spec.wgsl_type.clone(),
                is_atomic: false,
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
        usage: wgpu::BufferUsages::STORAGE
            | wgpu::BufferUsages::COPY_SRC
            | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Phase A.5: Arena scalars (split standard/atomic storage buffers, packed)
    let mut scalars_word_count: u32 = 0;
    let mut atomic_scalars_word_count: u32 = 0;
    let mut scalar_keys: Vec<_> = manifest.arena_scalars.keys().collect();
    scalar_keys.sort();
    for key in &scalar_keys {
        let spec = &manifest.arena_scalars[*key];
        if is_atomic_type(&spec.wgsl_type) {
            let canonical_type = atomic_inner_type(&spec.wgsl_type).unwrap_or("u32").to_string();
            symbol_map.insert(
                (*key).clone(),
                PhysicalSymbol {
                    buffer_kind: BufferKind::ArenaScalarAtomic,
                    domain_id: None,
                    word_offset: atomic_scalars_word_count,
                    wgsl_type: canonical_type,
                    is_atomic: true,
                },
            );
            atomic_scalars_word_count += 1;
            continue;
        }
        symbol_map.insert(
            (*key).clone(),
            PhysicalSymbol {
                buffer_kind: BufferKind::ArenaScalar,
                domain_id: None,
                word_offset: scalars_word_count,
                wgsl_type: spec.wgsl_type.clone(),
                is_atomic: false,
            },
        );
        scalars_word_count += 1;
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
    let atomic_scalars_buffer = if atomic_scalars_word_count == 0 {
        None
    } else {
        Some(device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("arena_scalars_atomic"),
            size: ((atomic_scalars_word_count * 4) as u64).max(MIN_BUFFER_BYTES),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        }))
    };

    // Phase B: Domains (Storage buffers, SoA with 256-byte alignment per field)
    // [LAW:single-enforcer] Domain field-to-buffer routing (standard vs atomic)
    // is decided once in MMU allocation so translators and passes consume one map.
    let mut domain_buffers = HashMap::new();
    let mut domain_keys: Vec<_> = manifest.domains.keys().collect();
    domain_keys.sort();
    for domain_id in &domain_keys {
        let spec = &manifest.domains[*domain_id];
        let capacity = spec.capacity;
        let mut standard_offset: u32 = 0;
        let mut atomic_offset: u32 = 0;

        let mut field_keys: Vec<_> = spec.fields.keys().collect();
        field_keys.sort();
        for field_key in &field_keys {
            let field = &spec.fields[*field_key];
            let is_atomic = is_atomic_type(&field.wgsl_type);
            let (buffer_kind, word_offset, canonical_type) = if is_atomic {
                let inner = atomic_inner_type(&field.wgsl_type).unwrap_or("u32");
                let offset = atomic_offset;
                atomic_offset += capacity;
                atomic_offset = align_up(atomic_offset, DOMAIN_ALIGNMENT_WORDS);
                (BufferKind::DomainAtomic, offset, inner.to_string())
            } else {
                let offset = standard_offset;
                standard_offset += capacity;
                standard_offset = align_up(standard_offset, DOMAIN_ALIGNMENT_WORDS);
                (BufferKind::DomainStandard, offset, field.wgsl_type.clone())
            };
            let symbol_id = format!("{}:{}", domain_id, field_key);
            symbol_map.insert(
                symbol_id,
                PhysicalSymbol {
                    buffer_kind,
                    domain_id: Some((*domain_id).clone()),
                    word_offset,
                    wgsl_type: canonical_type,
                    is_atomic,
                },
            );
        }

        let standard_bytes = ((standard_offset * 4) as u64).max(MIN_BUFFER_BYTES);
        let standard = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("domain_{}", domain_id)),
            size: standard_bytes,
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let atomic = if atomic_offset == 0 {
            None
        } else {
            Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(&format!("domain_{}_atomic", domain_id)),
                size: ((atomic_offset * 4) as u64).max(MIN_BUFFER_BYTES),
                usage: wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_SRC
                    | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }))
        };
        domain_buffers.insert((*domain_id).clone(), DomainBuffers { standard, atomic });
    }

    // Phase B.5: Data streams (Storage buffers, JS-updated)
    let mut data_stream_buffers = HashMap::new();
    let mut stream_keys: Vec<_> = manifest.data_streams.keys().collect();
    stream_keys.sort();
    for stream_id in &stream_keys {
        let spec = &manifest.data_streams[*stream_id];
        let word_len = spec.length.max(1);
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("stream_{}", stream_id)),
            size: ((word_len * 4) as u64).max(MIN_BUFFER_BYTES),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        data_stream_buffers.insert((*stream_id).clone(), buffer);
        symbol_map.insert(
            format!("stream:{}", stream_id),
            PhysicalSymbol {
                buffer_kind: BufferKind::DataStream,
                domain_id: Some((*stream_id).clone()),
                word_offset: 0,
                wgsl_type: spec.wgsl_type.clone(),
                is_atomic: false,
            },
        );
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
            index_buffer = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("{}_ibo", shape_id)),
                contents: &i_bytes,
                usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            }));
            index_count = i_data.len() as u32;
        }

        let topology = match spec.topology.as_str() {
            "point-list" => wgpu::PrimitiveTopology::PointList,
            "line-list" => wgpu::PrimitiveTopology::LineList,
            "line-strip" => wgpu::PrimitiveTopology::LineStrip,
            "triangle-strip" => wgpu::PrimitiveTopology::TriangleStrip,
            _ => wgpu::PrimitiveTopology::TriangleList,
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
            },
        );
    }

    // Indirect buffer: 4 × u32 = 16 bytes (vertexCount, instanceCount, firstVertex, firstInstance)
    let indirect_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("indirect"),
        size: 16,
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
        let height = spec.height.as_ref().map(|h| resolve_dimension(h, 600)).unwrap_or(1);
        let depth = spec.depth_or_array_layers.unwrap_or(1);

        let format = parse_texture_format(&spec.format);
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

        let dim = match spec.dimension.as_str() {
            "1d" => wgpu::TextureDimension::D1,
            "3d" => wgpu::TextureDimension::D3,
            _ => wgpu::TextureDimension::D2,
        };

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(texture_id),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: depth },
            mip_level_count: 1,
            sample_count: 1,
            dimension: dim,
            format,
            usage,
            view_formats: &[],
        });

        let view_dim = match spec.dimension.as_str() {
            "1d" => wgpu::TextureViewDimension::D1,
            "3d" => wgpu::TextureViewDimension::D3,
            "cube" => wgpu::TextureViewDimension::Cube,
            _ => wgpu::TextureViewDimension::D2,
        };

        let view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some(&format!("{}_view", texture_id)),
            dimension: Some(view_dim),
            ..Default::default()
        });

        textures.insert((*texture_id).clone(), AllocatedTexture {
            texture, view, format, dimension: view_dim,
        });
    }

    // Phase E: Samplers
    let mut samplers = HashMap::new();
    let mut sampler_keys: Vec<_> = manifest.samplers.keys().collect();
    sampler_keys.sort();
    for sampler_id in &sampler_keys {
        let spec = &manifest.samplers[*sampler_id];
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some(sampler_id),
            address_mode_u: parse_address_mode(&spec.address_mode_u),
            address_mode_v: parse_address_mode(&spec.address_mode_v),
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: parse_filter_mode(&spec.mag_filter),
            min_filter: parse_filter_mode(&spec.min_filter),
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        samplers.insert((*sampler_id).clone(), sampler);
    }

    // Phase G: Clear — write clearValues to scalars and domain buffers
    // Scalars: write clear values
    if scalars_word_count > 0 {
        let mut clear_data = vec![0u32; scalars_word_count as usize];
        for key in &scalar_keys {
            let spec = &manifest.arena_scalars[*key];
            let sym = &symbol_map[*key];
            if sym.buffer_kind != BufferKind::ArenaScalar {
                continue;
            }
            clear_data[sym.word_offset as usize] = spec.clear_value as u32;
        }
        queue.write_buffer(&scalars_buffer, 0, bytemuck::cast_slice(&clear_data));
    }
    if atomic_scalars_word_count > 0 {
        let mut clear_data = vec![0u32; atomic_scalars_word_count as usize];
        for key in &scalar_keys {
            let spec = &manifest.arena_scalars[*key];
            let sym = &symbol_map[*key];
            if sym.buffer_kind != BufferKind::ArenaScalarAtomic {
                continue;
            }
            clear_data[sym.word_offset as usize] = spec.clear_value as u32;
        }
        if let Some(ref atomic_scalars) = atomic_scalars_buffer {
            queue.write_buffer(atomic_scalars, 0, bytemuck::cast_slice(&clear_data));
        }
    }

    // Domains: write clear values for each field
    for domain_id in &domain_keys {
        let spec = &manifest.domains[*domain_id];
        let buffers = &domain_buffers[*domain_id];
        let mut field_keys: Vec<_> = spec.fields.keys().collect();
        field_keys.sort();
        for field_key in &field_keys {
            let field = &spec.fields[*field_key];
            let symbol_id = format!("{}:{}", domain_id, field_key);
            let sym = &symbol_map[&symbol_id];
            let offset_bytes = (sym.word_offset * 4) as u64;
            // Write clearValue for each instance slot
            let clear_word = if !sym.is_atomic && field.wgsl_type == "f32" {
                (field.clear_value as f32).to_bits()
            } else {
                field.clear_value as u32
            };
            let clear_data = vec![clear_word; spec.capacity as usize];
            match sym.buffer_kind {
                BufferKind::DomainStandard => {
                    queue.write_buffer(&buffers.standard, offset_bytes, bytemuck::cast_slice(&clear_data));
                }
                BufferKind::DomainAtomic => {
                    if let Some(ref atomic) = buffers.atomic {
                        queue.write_buffer(atomic, offset_bytes, bytemuck::cast_slice(&clear_data));
                    }
                }
                _ => {}
            }
        }
    }

    Ok(GpuMemoryArena {
        globals_buffer,
        scalars_buffer,
        atomic_scalars_buffer,
        domain_buffers,
        data_stream_buffers,
        shape_bank,
        indirect_buffer,
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

fn global_type_word_count(wgsl_type: &str) -> u32 {
    match wgsl_type {
        "f32" | "u32" | "i32" => 1,
        "vec2" => 2,
        "vec3" => 3,
        "vec4" => 4,
        "mat4x4" => 16,
        _ => 1,
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

fn parse_texture_format(format: &str) -> wgpu::TextureFormat {
    match format {
        "r8unorm" => wgpu::TextureFormat::R8Unorm,
        "rgba8unorm" => wgpu::TextureFormat::Rgba8Unorm,
        "rgba16float" => wgpu::TextureFormat::Rgba16Float,
        "r32float" => wgpu::TextureFormat::R32Float,
        "rg32float" => wgpu::TextureFormat::Rg32Float,
        "rgba32float" => wgpu::TextureFormat::Rgba32Float,
        "depth32float" => wgpu::TextureFormat::Depth32Float,
        "depth24plus-stencil8" => wgpu::TextureFormat::Depth24PlusStencil8,
        _ => wgpu::TextureFormat::Rgba8Unorm,
    }
}

fn parse_address_mode(mode: &str) -> wgpu::AddressMode {
    match mode {
        "repeat" => wgpu::AddressMode::Repeat,
        "mirror-repeat" => wgpu::AddressMode::MirrorRepeat,
        _ => wgpu::AddressMode::ClampToEdge,
    }
}

fn parse_filter_mode(mode: &str) -> wgpu::FilterMode {
    match mode {
        "linear" => wgpu::FilterMode::Linear,
        _ => wgpu::FilterMode::Nearest,
    }
}

fn is_atomic_type(wgsl_type: &str) -> bool {
    matches!(wgsl_type, "atomic<u32>" | "atomic<i32>")
}

fn atomic_inner_type(wgsl_type: &str) -> Option<&'static str> {
    match wgsl_type {
        "atomic<u32>" => Some("u32"),
        "atomic<i32>" => Some("i32"),
        _ => None,
    }
}

fn is_canvas_relative_dimension(value: &serde_json::Value) -> bool {
    value
        .as_object()
        .and_then(|obj| obj.get("relativeTo"))
        .and_then(|v| v.as_str())
        .map(|s| s == "canvas")
        .unwrap_or(false)
}

fn texture_uses_canvas_relative_size(spec: &crate::contract::TextureSpec) -> bool {
    is_canvas_relative_dimension(&spec.width)
        || spec
            .height
            .as_ref()
            .map(is_canvas_relative_dimension)
            .unwrap_or(false)
}

fn allocate_texture_from_spec(
    device: &wgpu::Device,
    texture_id: &str,
    spec: &crate::contract::TextureSpec,
    canvas_width: u32,
    canvas_height: u32,
) -> AllocatedTexture {
    let width = resolve_dimension(&spec.width, canvas_width);
    let height = spec
        .height
        .as_ref()
        .map(|h| resolve_dimension(h, canvas_height))
        .unwrap_or(1);
    let depth = spec.depth_or_array_layers.unwrap_or(1);

    let format = parse_texture_format(&spec.format);
    let mut usage = wgpu::TextureUsages::empty();
    for u in &spec.usage {
        match u.as_str() {
            "storage" => usage |= wgpu::TextureUsages::STORAGE_BINDING,
            "sampled" => usage |= wgpu::TextureUsages::TEXTURE_BINDING,
            "render_attachment" => usage |= wgpu::TextureUsages::RENDER_ATTACHMENT,
            _ => {}
        }
    }
    if spec.external_source.is_some() {
        usage |= wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING;
    }

    let dim = match spec.dimension.as_str() {
        "1d" => wgpu::TextureDimension::D1,
        "3d" => wgpu::TextureDimension::D3,
        _ => wgpu::TextureDimension::D2,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(texture_id),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: depth,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: dim,
        format,
        usage,
        view_formats: &[],
    });

    let view_dim = match spec.dimension.as_str() {
        "1d" => wgpu::TextureViewDimension::D1,
        "3d" => wgpu::TextureViewDimension::D3,
        "cube" => wgpu::TextureViewDimension::Cube,
        _ => wgpu::TextureViewDimension::D2,
    };
    let view = texture.create_view(&wgpu::TextureViewDescriptor {
        label: Some(&format!("{}_view", texture_id)),
        dimension: Some(view_dim),
        ..Default::default()
    });

    AllocatedTexture {
        texture,
        view,
        format,
        dimension: view_dim,
    }
}

pub fn reallocate_canvas_relative_textures(
    device: &wgpu::Device,
    manifest: &MemoryManifest,
    canvas_width: u32,
    canvas_height: u32,
    textures: &mut HashMap<String, AllocatedTexture>,
) {
    for (texture_id, spec) in &manifest.textures {
        if !texture_uses_canvas_relative_size(spec) {
            continue;
        }
        let replacement = allocate_texture_from_spec(device, texture_id, spec, canvas_width, canvas_height);
        textures.insert(texture_id.clone(), replacement);
    }
}

fn buffer_for_symbol<'a>(
    arena: &'a GpuMemoryArena,
    symbol: &PhysicalSymbol,
) -> Option<&'a wgpu::Buffer> {
    match symbol.buffer_kind {
        BufferKind::GlobalUniform => Some(&arena.globals_buffer),
        BufferKind::ArenaScalar => Some(&arena.scalars_buffer),
        BufferKind::ArenaScalarAtomic => arena.atomic_scalars_buffer.as_ref(),
        BufferKind::DomainStandard => symbol
            .domain_id
            .as_ref()
            .and_then(|id| arena.domain_buffers.get(id))
            .map(|buffers| &buffers.standard),
        BufferKind::DomainAtomic => symbol
            .domain_id
            .as_ref()
            .and_then(|id| arena.domain_buffers.get(id))
            .and_then(|buffers| buffers.atomic.as_ref()),
        BufferKind::DataStream => symbol
            .domain_id
            .as_ref()
            .and_then(|id| arena.data_stream_buffers.get(id)),
    }
}

pub fn blit_state(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    old_arena: &GpuMemoryArena,
    new_arena: &GpuMemoryArena,
) {
    // [LAW:dataflow-not-control-flow] Blit scans one canonical symbol map and
    // deterministically emits copies for symbols that remain compatible.
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("hot_swap_blit"),
    });

    for (symbol_id, old_symbol) in &old_arena.symbol_map {
        let Some(new_symbol) = new_arena.symbol_map.get(symbol_id) else {
            continue;
        };
        if old_symbol.buffer_kind != new_symbol.buffer_kind {
            continue;
        }
        let Some(old_buffer) = buffer_for_symbol(old_arena, old_symbol) else {
            continue;
        };
        let Some(new_buffer) = buffer_for_symbol(new_arena, new_symbol) else {
            continue;
        };

        let src_offset = (old_symbol.word_offset as u64) * 4;
        let dst_offset = (new_symbol.word_offset as u64) * 4;
        if src_offset >= old_buffer.size() || dst_offset >= new_buffer.size() {
            continue;
        }
        let src_avail = old_buffer.size() - src_offset;
        let dst_avail = new_buffer.size() - dst_offset;
        let copy_size = src_avail.min(dst_avail);
        if copy_size == 0 {
            continue;
        }

        encoder.copy_buffer_to_buffer(
            old_buffer,
            src_offset,
            new_buffer,
            dst_offset,
            copy_size,
        );
    }

    queue.submit(std::iter::once(encoder.finish()));
}
