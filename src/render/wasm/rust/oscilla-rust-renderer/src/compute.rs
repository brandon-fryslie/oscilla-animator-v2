use crate::memory::GpuMemoryArena;

enum SimulationBindingKind {
    LegacySplit,
    CompilerUnified,
}

pub struct ComputeDispatcher {
    simulation_pipeline: wgpu::ComputePipeline,
    render_assembly_pipeline: wgpu::ComputePipeline,
    sim_workgroup_count: u32,
    assembly_workgroup_count: u32,
    compiler_simulation_layout: Option<wgpu::BindGroupLayout>,
    simulation_binding_kind: SimulationBindingKind,
    pub uniform_layout: wgpu::BindGroupLayout,
    pub state_layout: wgpu::BindGroupLayout,
    pub assembly_layout: wgpu::BindGroupLayout,
}

impl ComputeDispatcher {
    fn parse_workgroup_size_x(simulation_wgsl: &str) -> u32 {
        // [LAW:single-enforcer] Workgroup-size parsing is centralized in one
        // helper so all simulation dispatch counts use the same contract.
        const DEFAULT_WORKGROUP_SIZE_X: u32 = 64;
        let start = match simulation_wgsl.find("@workgroup_size(") {
            Some(index) => index + "@workgroup_size(".len(),
            None => return DEFAULT_WORKGROUP_SIZE_X,
        };
        let end = match simulation_wgsl[start..].find(')') {
            Some(relative_end) => start + relative_end,
            None => return DEFAULT_WORKGROUP_SIZE_X,
        };
        let maybe_x = simulation_wgsl[start..end]
            .split(',')
            .next()
            .map(str::trim)
            .unwrap_or_default()
            .parse::<u32>()
            .ok();
        maybe_x.filter(|x| *x > 0).unwrap_or(DEFAULT_WORKGROUP_SIZE_X)
    }

    fn simulation_dispatch_count(particle_count: u32, simulation_wgsl: &str) -> u32 {
        let workgroup_size_x = Self::parse_workgroup_size_x(simulation_wgsl);
        ((particle_count.saturating_add(workgroup_size_x.saturating_sub(1))) / workgroup_size_x).max(1)
    }

    pub fn new(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        assembly_wgsl: &str,
        particle_count: u32,
        shape_count: u32,
    ) -> Self {
        // [LAW:single-enforcer] The bind-group contract is declared once here
        // so compile/rebuild and runtime pass encoding share one authority.
        let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.Uniform.Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE
                    | wgpu::ShaderStages::VERTEX
                    | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let state_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.State.Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: false },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let assembly_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.Assembly.Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let simulation_pipeline = Self::create_legacy_simulation_pipeline(
            device,
            simulation_wgsl,
            &uniform_layout,
            &state_layout,
        );
        let assembly_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.Assembly.Shader"),
            source: wgpu::ShaderSource::Wgsl(assembly_wgsl.into()),
        });

        let assembly_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Compute.Assembly.PipelineLayout"),
            bind_group_layouts: &[&uniform_layout, &state_layout, &assembly_layout],
            push_constant_ranges: &[],
        });
        let render_assembly_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.Assembly.Pipeline"),
            layout: Some(&assembly_pipeline_layout),
            module: &assembly_module,
            entry_point: Some("main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });

        let sim_workgroup_count = Self::simulation_dispatch_count(particle_count, simulation_wgsl);
        let assembly_workgroup_count = (shape_count.saturating_add(63)) / 64;

        Self {
            simulation_pipeline,
            render_assembly_pipeline,
            sim_workgroup_count: sim_workgroup_count.max(1),
            assembly_workgroup_count: assembly_workgroup_count.max(1),
            compiler_simulation_layout: None,
            simulation_binding_kind: SimulationBindingKind::LegacySplit,
            uniform_layout,
            state_layout,
            assembly_layout,
        }
    }

    fn create_legacy_simulation_pipeline(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        uniform_layout: &wgpu::BindGroupLayout,
        state_layout: &wgpu::BindGroupLayout,
    ) -> wgpu::ComputePipeline {
        let simulation_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.Simulation.Shader"),
            source: wgpu::ShaderSource::Wgsl(simulation_wgsl.into()),
        });
        let simulation_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Compute.Simulation.PipelineLayout"),
            bind_group_layouts: &[uniform_layout, state_layout, state_layout],
            push_constant_ranges: &[],
        });
        device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.Simulation.Pipeline"),
            layout: Some(&simulation_pipeline_layout),
            module: &simulation_module,
            entry_point: Some("main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        })
    }

    fn create_compiler_simulation_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.CompilerSimulation.Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        })
    }

    pub fn rebuild_simulation_pipeline_with_compiler_wgsl(
        &mut self,
        device: &wgpu::Device,
        simulation_wgsl: &str,
        particle_count: u32,
    ) {
        let compiler_simulation_layout = Self::create_compiler_simulation_layout(device);
        let simulation_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.CompilerSimulation.Shader"),
            source: wgpu::ShaderSource::Wgsl(simulation_wgsl.into()),
        });
        let simulation_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Compute.CompilerSimulation.PipelineLayout"),
            bind_group_layouts: &[&compiler_simulation_layout],
            push_constant_ranges: &[],
        });
        self.simulation_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.CompilerSimulation.Pipeline"),
            layout: Some(&simulation_pipeline_layout),
            module: &simulation_module,
            entry_point: Some("compute_main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });
        self.sim_workgroup_count =
            Self::simulation_dispatch_count(particle_count, simulation_wgsl);
        self.compiler_simulation_layout = Some(compiler_simulation_layout);
        self.simulation_binding_kind = SimulationBindingKind::CompilerUnified;
    }

    pub fn compiler_simulation_layout(&self) -> Option<&wgpu::BindGroupLayout> {
        self.compiler_simulation_layout.as_ref()
    }

    pub fn encode_passes(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        arena: &mut GpuMemoryArena,
        encode_assembly: bool,
    ) {
        // [LAW:dataflow-not-control-flow] Compute stage order is immutable every
        // frame; variability is in uniforms/state payload values only.
        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute.Simulation.Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&self.simulation_pipeline);
            match self.simulation_binding_kind {
                SimulationBindingKind::LegacySplit => {
                    compute_pass.set_bind_group(0, &arena.uniform_bind_group, &[]);
                    compute_pass.set_bind_group(1, arena.get_compute_read_bind_group(), &[]);
                    compute_pass.set_bind_group(2, arena.get_compute_write_bind_group(), &[]);
                }
                SimulationBindingKind::CompilerUnified => {
                    let bind_group = arena
                        .get_compiler_simulation_bind_group()
                        .expect("compiler simulation bind group must be rebuilt before dispatch");
                    compute_pass.set_bind_group(0, bind_group, &[]);
                }
            }
            compute_pass.dispatch_workgroups(self.sim_workgroup_count, 1, 1);
        }

        if encode_assembly {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute.RenderAssembly.Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&self.render_assembly_pipeline);
            compute_pass.set_bind_group(0, &arena.uniform_bind_group, &[]);
            compute_pass.set_bind_group(1, arena.get_compute_write_bind_group(), &[]);
            // [LAW:one-source-of-truth] Arena owns the canonical assembly bind
            // group used for draw-prep writes.
            compute_pass.set_bind_group(2, &arena.assembly_write_bind_group, &[]);
            compute_pass.dispatch_workgroups(self.assembly_workgroup_count, 1, 1);
        }

        arena.swap_ping_pong();
    }
}
