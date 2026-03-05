use bytemuck::{bytes_of, cast_slice, Pod, Zeroable};

pub const INDIRECT_WORDS_PER_RECORD: usize = 5;
pub const INSTANCE_FLOATS_PER_RECORD: usize = 12;
pub const SHAPE_BANK_HEADER_WORDS: usize = 16;
pub const SINK_TABLE_HEADER_WORDS: usize = 8;
pub const SINK_TABLE_RECORD_WORDS: usize = 29;
pub const INDIRECT_INDEXED_STRIDE_WORDS: usize = 5;
pub const INDIRECT_NON_INDEXED_STRIDE_WORDS: usize = 4;

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
    pub topology_buffer: wgpu::Buffer,
    pub sink_table_buffer: wgpu::Buffer,
    pub indirect_buffer: wgpu::Buffer,
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub assembly_write_bind_group: wgpu::BindGroup,
    pub draw_prep_bind_group: wgpu::BindGroup,
    pub instance_bind_group: wgpu::BindGroup,
    pub topology_bind_group: wgpu::BindGroup,
    assembly_layout: wgpu::BindGroupLayout,
    draw_prep_layout: wgpu::BindGroupLayout,
    instance_layout: wgpu::BindGroupLayout,
    topology_layout: wgpu::BindGroupLayout,
    instance_capacity_bytes: u64,
    topology_capacity_words: usize,
    sink_table_capacity_words: usize,
    indirect_capacity_words: usize,
    vertex_capacity_bytes: u64,
    index_capacity_bytes: u64,
    state_buffers: [wgpu::Buffer; 2],
    compiler_arena_buffers: [wgpu::Buffer; 2],
    state_bind_groups: [wgpu::BindGroup; 2],
    compiler_arena_bind_groups: [wgpu::BindGroup; 2],
    compiler_simulation_bind_groups: [wgpu::BindGroup; 2],
    staging_buffers: [wgpu::Buffer; 2],
    ping_pong_index: usize,
}

impl GpuMemoryArena {
    fn clear_buffer_words(queue: &wgpu::Queue, buffer: &wgpu::Buffer) {
        let byte_len = buffer.size() as usize;
        let word_len = (byte_len / std::mem::size_of::<u32>()).max(1);
        let zeros = vec![0u32; word_len];
        queue.write_buffer(buffer, 0, cast_slice(zeros.as_slice()));
    }

    pub fn clear_simulation_planes(&self, queue: &wgpu::Queue) {
        // [LAW:no-silent-fallbacks] Simulation state must start from a
        // deterministic finite baseline; uninitialized GPU memory is invalid.
        Self::clear_buffer_words(queue, &self.state_buffers[0]);
        Self::clear_buffer_words(queue, &self.state_buffers[1]);
        Self::clear_buffer_words(queue, &self.compiler_arena_buffers[0]);
        Self::clear_buffer_words(queue, &self.compiler_arena_buffers[1]);
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
        let initial_sink_table_words =
            SINK_TABLE_HEADER_WORDS + max_shapes.saturating_mul(SINK_TABLE_RECORD_WORDS);
        let initial_indirect_words = max_shapes
            .saturating_mul(INDIRECT_INDEXED_STRIDE_WORDS + INDIRECT_NON_INDEXED_STRIDE_WORDS);
        let initial_vertex_bytes = (max_shapes
            .saturating_mul(8)
            .saturating_mul(std::mem::size_of::<f32>())) as u64;
        let initial_index_bytes = (max_shapes
            .saturating_mul(12)
            .saturating_mul(std::mem::size_of::<u32>())) as u64;

        let instance_capacity_bytes = initial_instance_bytes
            .max((INSTANCE_FLOATS_PER_RECORD * std::mem::size_of::<f32>()) as u64);
        let topology_capacity_words = initial_topology_words.max(SHAPE_BANK_HEADER_WORDS);
        let sink_table_capacity_words = initial_sink_table_words.max(SINK_TABLE_HEADER_WORDS);
        let indirect_capacity_words = initial_indirect_words.max(INDIRECT_WORDS_PER_RECORD);
        let vertex_capacity_bytes =
            initial_vertex_bytes.max((8 * std::mem::size_of::<f32>()) as u64);
        let index_capacity_bytes = initial_index_bytes.max((6 * std::mem::size_of::<u32>()) as u64);

        let instance_buffer = Self::create_instance_buffer(device, instance_capacity_bytes);
        let topology_buffer = Self::create_topology_buffer(device, topology_capacity_words);
        let sink_table_buffer = Self::create_sink_table_buffer(device, sink_table_capacity_words);
        let indirect_buffer = Self::create_indirect_buffer(device, indirect_capacity_words);
        let vertex_buffer = Self::create_vertex_buffer(device, vertex_capacity_bytes);
        let index_buffer = Self::create_index_buffer(device, index_capacity_bytes);

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
        let topology_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Render.Topology.BindGroup"),
            layout: topology_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: topology_buffer.as_entire_binding(),
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

        Self {
            uniforms: GlobalUniforms::default(),
            slot_descriptors: Vec::with_capacity(64),
            uniform_buffer,
            uniform_bind_group,
            instance_buffer,
            topology_buffer,
            sink_table_buffer,
            indirect_buffer,
            vertex_buffer,
            index_buffer,
            assembly_write_bind_group,
            draw_prep_bind_group,
            instance_bind_group,
            topology_bind_group,
            assembly_layout: assembly_layout.clone(),
            draw_prep_layout: draw_prep_layout.clone(),
            instance_layout: instance_layout.clone(),
            topology_layout: topology_layout.clone(),
            instance_capacity_bytes,
            topology_capacity_words,
            sink_table_capacity_words,
            indirect_capacity_words,
            vertex_capacity_bytes,
            index_capacity_bytes,
            state_buffers,
            compiler_arena_buffers,
            state_bind_groups,
            compiler_arena_bind_groups,
            compiler_simulation_bind_groups,
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

    pub fn read_state_buffer(&self) -> &wgpu::Buffer {
        &self.state_buffers[self.ping_pong_index]
    }

    pub fn debug_staging_buffer(&self) -> &wgpu::Buffer {
        &self.staging_buffers[self.ping_pong_index & 1]
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

    pub fn write_geometry_payload(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        vertices: &[f32],
        indices: &[u32],
    ) {
        // [LAW:one-source-of-truth] Geometry payload upload happens through one
        // canonical arena method so render buffers are never seeded from ad-hoc defaults.
        self.ensure_vertex_capacity(device, vertices.len().max(2));
        self.ensure_index_capacity(device, indices.len().max(3));
        if !vertices.is_empty() {
            queue.write_buffer(&self.vertex_buffer, 0, cast_slice(vertices));
        }
        if !indices.is_empty() {
            queue.write_buffer(&self.index_buffer, 0, cast_slice(indices));
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
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
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

    fn create_vertex_buffer(device: &wgpu::Device, size_bytes: u64) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.VertexBuffer"),
            size: size_bytes.max(16),
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    }

    fn create_index_buffer(device: &wgpu::Device, size_bytes: u64) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Render.IndexBuffer"),
            size: size_bytes.max(16),
            usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
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
        self.indirect_capacity_words = next_capacity;
        true
    }

    fn ensure_vertex_capacity(&mut self, device: &wgpu::Device, required_floats: usize) {
        let required_bytes = (required_floats.saturating_mul(std::mem::size_of::<f32>())) as u64;
        if required_bytes <= self.vertex_capacity_bytes {
            return;
        }
        let mut next_capacity = self.vertex_capacity_bytes.max(16);
        while next_capacity < required_bytes {
            next_capacity = next_capacity.saturating_mul(2);
        }
        self.vertex_buffer = Self::create_vertex_buffer(device, next_capacity);
        self.vertex_capacity_bytes = next_capacity;
    }

    fn ensure_index_capacity(&mut self, device: &wgpu::Device, required_words: usize) {
        let required_bytes = (required_words.saturating_mul(std::mem::size_of::<u32>())) as u64;
        if required_bytes <= self.index_capacity_bytes {
            return;
        }
        let mut next_capacity = self.index_capacity_bytes.max(16);
        while next_capacity < required_bytes {
            next_capacity = next_capacity.saturating_mul(2);
        }
        self.index_buffer = Self::create_index_buffer(device, next_capacity);
        self.index_capacity_bytes = next_capacity;
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

    fn rebuild_topology_bind_group(&mut self, device: &wgpu::Device) {
        self.topology_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Render.Topology.BindGroup"),
            layout: &self.topology_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: self.topology_buffer.as_entire_binding(),
            }],
        });
    }
}
