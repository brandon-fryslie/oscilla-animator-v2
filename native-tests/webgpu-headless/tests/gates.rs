use futures_intrusive::channel::shared::oneshot_channel;
use png::Encoder;
use wgpu::util::DeviceExt;

const COMPUTE_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  dst[i] = src[i] + 1.0;
}
"#;

const RENDER_WGSL: &str = r#"
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  let p = positions[vertex_index];
  return vec4<f32>(p, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
"#;

fn request_device() -> (wgpu::Device, wgpu::Queue) {
  // [LAW:verifiable-goals] Gate backend selection is deterministic per host OS
  // so adapter choice does not drift across machines with multiple backends.
  let preferred_backends = if cfg!(target_os = "macos") {
    wgpu::Backends::METAL
  } else if cfg!(target_os = "windows") {
    wgpu::Backends::DX12
  } else {
    // Linux + CI contract: Vulkan (Lavapipe in CI) is the canonical backend.
    wgpu::Backends::VULKAN
  };
  let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
    backends: preferred_backends,
    ..Default::default()
  });
  let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
    power_preference: wgpu::PowerPreference::HighPerformance,
    compatible_surface: None,
    force_fallback_adapter: false,
  }))
  .expect("Gate 1/3: A compatible adapter is required; in CI Vulkan/Lavapipe should satisfy this");

  pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
    label: Some("webgpu-headless-gates-device"),
    required_features: wgpu::Features::empty(),
    required_limits: wgpu::Limits::default(),
    memory_hints: wgpu::MemoryHints::Performance,
  }, None))
  .expect("Gate 1/3: request_device failed")
}

fn map_read_buffer(device: &wgpu::Device, buffer: &wgpu::Buffer) -> Vec<u8> {
  let slice = buffer.slice(..);
  let (sender, receiver) = oneshot_channel();
  slice.map_async(wgpu::MapMode::Read, move |result| {
    let _ = sender.send(result);
  });
  device.poll(wgpu::Maintain::Wait);
  let map_result = pollster::block_on(receiver.receive())
    .expect("map_async callback dropped")
    .expect("map_async failed");
  let _ = map_result;
  let bytes = slice.get_mapped_range().to_vec();
  buffer.unmap();
  bytes
}

#[test]
fn gate1_native_headless_compute_math_is_correct() {
  // [LAW:verifiable-goals] Gate 1 executes real compute work and asserts exact
  // numeric readback to prove compiler+dispatcher behavior outside browser/WASM.
  let (device, queue) = request_device();

  let src_data = [1.0f32, 2.0, 3.0, 4.0];
  let src_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
    label: Some("gate1-src"),
    contents: bytemuck::cast_slice(&src_data),
    usage: wgpu::BufferUsages::STORAGE,
  });
  let dst_buffer = device.create_buffer(&wgpu::BufferDescriptor {
    label: Some("gate1-dst"),
    size: (std::mem::size_of::<f32>() * src_data.len()) as u64,
    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
    mapped_at_creation: false,
  });
  let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
    label: Some("gate1-readback"),
    size: (std::mem::size_of::<f32>() * src_data.len()) as u64,
    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
    mapped_at_creation: false,
  });

  let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    label: Some("gate1-compute-shader"),
    source: wgpu::ShaderSource::Wgsl(COMPUTE_WGSL.into()),
  });
  let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
    label: Some("gate1-compute-pipeline"),
    layout: None,
    module: &shader,
    entry_point: Some("main"),
    cache: None,
    compilation_options: wgpu::PipelineCompilationOptions::default(),
  });
  let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
    label: Some("gate1-bind-group"),
    layout: &pipeline.get_bind_group_layout(0),
    entries: &[
      wgpu::BindGroupEntry {
        binding: 0,
        resource: src_buffer.as_entire_binding(),
      },
      wgpu::BindGroupEntry {
        binding: 1,
        resource: dst_buffer.as_entire_binding(),
      },
    ],
  });

  let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
    label: Some("gate1-encoder"),
  });
  {
    let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
      label: Some("gate1-pass"),
      timestamp_writes: None,
    });
    pass.set_pipeline(&pipeline);
    pass.set_bind_group(0, &bind_group, &[]);
    pass.dispatch_workgroups(src_data.len() as u32, 1, 1);
  }
  encoder.copy_buffer_to_buffer(&dst_buffer, 0, &readback_buffer, 0, readback_buffer.size());
  queue.submit([encoder.finish()]);

  let bytes = map_read_buffer(&device, &readback_buffer);
  let values: &[f32] = bytemuck::cast_slice(&bytes);
  assert_eq!(values, &[2.0, 3.0, 4.0, 5.0]);
}

#[test]
fn gate3_render_snapshot_matches_golden_master_pixels() {
  // [LAW:verifiable-goals] Gate 3 renders a deterministic frame and performs
  // pixel-level comparison against a fixed golden target.
  let (device, queue) = request_device();
  let width: u32 = 32;
  let height: u32 = 32;

  let color_texture = device.create_texture(&wgpu::TextureDescriptor {
    label: Some("gate3-color"),
    size: wgpu::Extent3d {
      width,
      height,
      depth_or_array_layers: 1,
    },
    mip_level_count: 1,
    sample_count: 1,
    dimension: wgpu::TextureDimension::D2,
    format: wgpu::TextureFormat::Rgba8Unorm,
    usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
    view_formats: &[],
  });
  let color_view = color_texture.create_view(&wgpu::TextureViewDescriptor::default());

  let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    label: Some("gate3-render-shader"),
    source: wgpu::ShaderSource::Wgsl(RENDER_WGSL.into()),
  });
  let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    label: Some("gate3-render-pipeline"),
    layout: None,
    vertex: wgpu::VertexState {
      module: &shader,
      entry_point: Some("vs_main"),
      compilation_options: wgpu::PipelineCompilationOptions::default(),
      buffers: &[],
    },
    fragment: Some(wgpu::FragmentState {
      module: &shader,
      entry_point: Some("fs_main"),
      compilation_options: wgpu::PipelineCompilationOptions::default(),
      targets: &[Some(wgpu::ColorTargetState {
        format: wgpu::TextureFormat::Rgba8Unorm,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
      })],
    }),
    primitive: wgpu::PrimitiveState::default(),
    depth_stencil: None,
    multisample: wgpu::MultisampleState::default(),
    multiview: None,
    cache: None,
  });

  let unpadded_bytes_per_row = width * 4;
  let row_alignment = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
  let bytes_per_row = unpadded_bytes_per_row.div_ceil(row_alignment) * row_alignment;
  let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
    label: Some("gate3-readback"),
    size: (bytes_per_row * height) as u64,
    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
    mapped_at_creation: false,
  });

  let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
    label: Some("gate3-encoder"),
  });
  {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
      label: Some("gate3-pass"),
      color_attachments: &[Some(wgpu::RenderPassColorAttachment {
        view: &color_view,
        resolve_target: None,
        ops: wgpu::Operations {
          load: wgpu::LoadOp::Clear(wgpu::Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 1.0,
          }),
          store: wgpu::StoreOp::Store,
        },
      })],
      depth_stencil_attachment: None,
      timestamp_writes: None,
      occlusion_query_set: None,
    });
    pass.set_pipeline(&pipeline);
    pass.draw(0..3, 0..1);
  }
  encoder.copy_texture_to_buffer(
    wgpu::TexelCopyTextureInfo {
      texture: &color_texture,
      mip_level: 0,
      origin: wgpu::Origin3d::ZERO,
      aspect: wgpu::TextureAspect::All,
    },
    wgpu::TexelCopyBufferInfo {
      buffer: &readback_buffer,
      layout: wgpu::TexelCopyBufferLayout {
        offset: 0,
        bytes_per_row: Some(bytes_per_row),
        rows_per_image: Some(height),
      },
    },
    wgpu::Extent3d {
      width,
      height,
      depth_or_array_layers: 1,
    },
  );
  queue.submit([encoder.finish()]);

  let rendered_with_padding = map_read_buffer(&device, &readback_buffer);
  let rendered: Vec<u8> = rendered_with_padding
    .chunks_exact(bytes_per_row as usize)
    .flat_map(|row| row[..unpadded_bytes_per_row as usize].iter().copied())
    .collect();
  let expected: Vec<u8> = std::iter::repeat([255u8, 0u8, 0u8, 255u8])
    .take((width * height) as usize)
    .flatten()
    .collect();
  let diff_pixels = rendered
    .chunks_exact(4)
    .zip(expected.chunks_exact(4))
    .filter(|(actual, golden)| actual != golden)
    .count();

  let mut png_bytes = Vec::new();
  {
    let mut encoder = Encoder::new(&mut png_bytes, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().expect("png header");
    writer.write_image_data(&rendered).expect("png image data");
  }
  assert!(!png_bytes.is_empty(), "Gate 3 must emit a PNG snapshot");
  assert_eq!(diff_pixels, 0, "Gate 3 pixel diff against golden master must be zero");
}
