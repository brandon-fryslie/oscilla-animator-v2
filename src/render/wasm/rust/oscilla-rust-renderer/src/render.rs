use crate::memory::GpuMemoryArena;

const U32_BYTES: u64 = std::mem::size_of::<u32>() as u64;

pub struct DepthTarget {
    _depth_texture: wgpu::Texture,
    depth_view: wgpu::TextureView,
    width: u32,
    height: u32,
}

impl DepthTarget {
    pub fn new(device: &wgpu::Device, width: u32, height: u32) -> Self {
        let safe_width = width.max(1);
        let safe_height = height.max(1);
        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Render.DepthTarget"),
            size: wgpu::Extent3d {
                width: safe_width,
                height: safe_height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self {
            _depth_texture: depth_texture,
            depth_view,
            width: safe_width,
            height: safe_height,
        }
    }

    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        let safe_width = width.max(1);
        let safe_height = height.max(1);
        if self.width == safe_width && self.height == safe_height {
            return;
        }
        *self = Self::new(device, safe_width, safe_height);
    }

    pub fn view(&self) -> &wgpu::TextureView {
        &self.depth_view
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct IndirectRegionPlan {
    pub total_instance_count: u32,
    pub indexed_record_count: u32,
    pub non_indexed_record_count: u32,
    pub indexed_region_base_words: u32,
    pub non_indexed_region_base_words: u32,
    pub indexed_stride_words: u32,
    pub non_indexed_stride_words: u32,
}

pub struct RenderDispatcher {
    render_pipeline: wgpu::RenderPipeline,
    pub instance_layout: wgpu::BindGroupLayout,
    pub topology_layout: wgpu::BindGroupLayout,
}

impl RenderDispatcher {
    pub fn new(
        device: &wgpu::Device,
        uber_shader_wgsl: &str,
        surface_format: wgpu::TextureFormat,
        uniform_layout: &wgpu::BindGroupLayout,
    ) -> Self {
        let instance_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Render.Instance.Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let topology_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Render.Topology.Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Render.UberShader"),
            source: wgpu::ShaderSource::Wgsl(uber_shader_wgsl.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Render.PipelineLayout"),
            bind_group_layouts: &[uniform_layout, &instance_layout, &topology_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Render.UberPipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: (std::mem::size_of::<f32>() * 2) as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x2],
                }],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: surface_format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::LessEqual,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            render_pipeline,
            instance_layout,
            topology_layout,
        }
    }

    pub fn encode_passes(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        arena: &GpuMemoryArena,
        color_view: &wgpu::TextureView,
        depth_view: &wgpu::TextureView,
        plan: IndirectRegionPlan,
    ) {
        let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Render.Uber.Pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: color_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.05,
                        g: 0.05,
                        b: 0.05,
                        a: 1.0,
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        render_pass.set_pipeline(&self.render_pipeline);
        render_pass.set_bind_group(0, &arena.uniform_bind_group, &[]);
        render_pass.set_bind_group(1, &arena.instance_bind_group, &[]);
        render_pass.set_bind_group(2, &arena.topology_bind_group, &[]);
        render_pass.set_vertex_buffer(0, arena.vertex_buffer.slice(..));
        render_pass.set_index_buffer(arena.index_buffer.slice(..), wgpu::IndexFormat::Uint32);

        let indexed_stride_words = plan.indexed_stride_words.max(5);
        let non_indexed_stride_words = plan.non_indexed_stride_words.max(4);

        for record_index in 0..plan.indexed_record_count {
            let word_offset = plan
                .indexed_region_base_words
                .saturating_add(record_index.saturating_mul(indexed_stride_words));
            render_pass
                .draw_indexed_indirect(&arena.indirect_buffer, (word_offset as u64) * U32_BYTES);
        }

        for record_index in 0..plan.non_indexed_record_count {
            let word_offset = plan
                .non_indexed_region_base_words
                .saturating_add(record_index.saturating_mul(non_indexed_stride_words));
            render_pass.draw_indirect(&arena.indirect_buffer, (word_offset as u64) * U32_BYTES);
        }
    }
}
