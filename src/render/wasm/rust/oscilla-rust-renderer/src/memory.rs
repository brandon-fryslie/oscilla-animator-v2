use bytemuck::{bytes_of, Pod, Zeroable};

pub const INDIRECT_WORDS_PER_RECORD: usize = 5;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Zeroable, Pod)]
pub struct GlobalUniforms {
    pub view_proj: [[f32; 4]; 4],
    pub resolution: [f32; 2],
    pub time_seconds: f32,
    pub delta_time_seconds: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Zeroable, Pod)]
pub struct ShapeInstanceData {
    pub transform: [[f32; 4]; 4],
    pub color: [f32; 4],
    pub sdf_params: [f32; 3],
    pub _pad0: f32,
    pub material_id: u32,
    pub _pad1: [u32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Zeroable, Pod)]
pub struct DrawIndexedIndirect {
    pub index_count: u32,
    pub instance_count: u32,
    pub first_index: u32,
    pub base_vertex: i32,
    pub first_instance: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Zeroable, Pod)]
pub struct SlotDescriptor {
    pub buffer_id: u32,
    pub byte_offset: u32,
    pub stride: u32,
    pub length: u32,
}

pub struct GpuMemoryArena {
    pub uniforms: GlobalUniforms,
    pub slot_descriptors: Vec<SlotDescriptor>,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_bind_group: wgpu::BindGroup,
    pub instance_buffer: wgpu::Buffer,
    pub indirect_buffer: wgpu::Buffer,
    pub assembly_write_bind_group: wgpu::BindGroup,
    pub render_bind_group: wgpu::BindGroup,
    state_buffers: [wgpu::Buffer; 2],
    state_bind_groups: [wgpu::BindGroup; 2],
    compiler_simulation_bind_groups: Option<[wgpu::BindGroup; 2]>,
    staging_buffers: [wgpu::Buffer; 2],
    ping_pong_index: usize,
}

impl GpuMemoryArena {
    pub fn new(
        device: &wgpu::Device,
        uniform_layout: &wgpu::BindGroupLayout,
        state_layout: &wgpu::BindGroupLayout,
        assembly_layout: &wgpu::BindGroupLayout,
        render_layout: &wgpu::BindGroupLayout,
        max_particles: usize,
        max_shapes: usize,
    ) -> Self {
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("GlobalUniforms"),
            size: std::mem::size_of::<GlobalUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("GlobalUniforms.BindGroup"),
            layout: uniform_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let state_buffer_bytes = (max_particles.saturating_mul(4).saturating_mul(std::mem::size_of::<f32>())) as u64;
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

        let instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ShapeBank.InstanceBuffer"),
            size: (max_shapes.saturating_mul(std::mem::size_of::<ShapeInstanceData>()) as u64).max(16),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let indirect_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ShapeBank.IndirectBuffer"),
            size: (max_shapes
                .saturating_mul(INDIRECT_WORDS_PER_RECORD)
                .saturating_mul(std::mem::size_of::<u32>()) as u64)
                .max(20),
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::INDIRECT
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
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
                    resource: indirect_buffer.as_entire_binding(),
                },
            ],
        });
        let render_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ShapeBank.Render.BindGroup"),
            layout: render_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: instance_buffer.as_entire_binding(),
            }],
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

        Self {
            uniforms: GlobalUniforms::default(),
            slot_descriptors: Vec::with_capacity(64),
            uniform_buffer,
            uniform_bind_group,
            instance_buffer,
            indirect_buffer,
            assembly_write_bind_group,
            render_bind_group,
            state_buffers,
            state_bind_groups,
            compiler_simulation_bind_groups: None,
            staging_buffers,
            ping_pong_index: 0,
        }
    }

    pub fn update_uniforms(&mut self, queue: &wgpu::Queue, next_uniforms: GlobalUniforms) {
        self.uniforms = next_uniforms;
        queue.write_buffer(&self.uniform_buffer, 0, bytes_of(&self.uniforms));
    }

    pub fn get_compute_read_bind_group(&self) -> &wgpu::BindGroup {
        &self.state_bind_groups[self.ping_pong_index]
    }

    pub fn get_compute_write_bind_group(&self) -> &wgpu::BindGroup {
        let write_index = (self.ping_pong_index + 1) & 1;
        &self.state_bind_groups[write_index]
    }

    pub fn rebuild_compiler_simulation_bind_groups(
        &mut self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
    ) {
        // [LAW:single-enforcer] Compiler-simulation bind groups are rebuilt in
        // one place from the canonical layout so ping/pong bindings cannot drift.
        self.compiler_simulation_bind_groups = Some([
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Compute.CompilerSimulation.BindGroup.A"),
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.state_buffers[0].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.state_buffers[1].as_entire_binding(),
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
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.state_buffers[1].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.state_buffers[0].as_entire_binding(),
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
        ]);
    }

    pub fn get_compiler_simulation_bind_group(&self) -> Option<&wgpu::BindGroup> {
        self.compiler_simulation_bind_groups
            .as_ref()
            .map(|bind_groups| &bind_groups[self.ping_pong_index])
    }

    pub fn read_state_buffer(&self) -> &wgpu::Buffer {
        &self.state_buffers[self.ping_pong_index]
    }

    pub fn debug_staging_buffer(&self) -> &wgpu::Buffer {
        &self.staging_buffers[self.ping_pong_index & 1]
    }

    pub fn swap_ping_pong(&mut self) {
        self.ping_pong_index = (self.ping_pong_index + 1) & 1;
    }
}
