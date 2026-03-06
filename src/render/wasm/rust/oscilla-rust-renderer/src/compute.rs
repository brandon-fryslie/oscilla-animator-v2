use crate::memory::GpuMemoryArena;

const DEFAULT_DRAW_PREP_WGSL: &str = r#"
const DRAW_MODE_INDEXED: u32 = 0u;
const DRAW_MODE_NON_INDEXED: u32 = 1u;
const SINK_TABLE_HEADER_WORDS: u32 = 8u;
const SINK_TABLE_RECORD_WORDS: u32 = 8u;
const DEFAULT_INDEXED_STRIDE_WORDS: u32 = 5u;
const DEFAULT_NON_INDEXED_STRIDE_WORDS: u32 = 4u;

const TABLE_WORD_TOTAL_RECORD_COUNT: u32 = 1u;
const TABLE_WORD_INDEXED_COUNT: u32 = 2u;
const TABLE_WORD_INDEXED_REGION_BASE_WORDS: u32 = 4u;
const TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS: u32 = 5u;
const TABLE_WORD_INDEXED_STRIDE_WORDS: u32 = 6u;
const TABLE_WORD_NON_INDEXED_STRIDE_WORDS: u32 = 7u;

const RECORD_WORD_DRAW_MODE: u32 = 0u;
const RECORD_WORD_COUNT: u32 = 1u;
const RECORD_WORD_INSTANCE_COUNT: u32 = 2u;
const RECORD_WORD_FIRST: u32 = 3u;
const RECORD_WORD_BASE_VERTEX: u32 = 4u;
const RECORD_WORD_FIRST_INSTANCE: u32 = 5u;

@group(0) @binding(0) var<storage, read> sinkTableWords: array<u32>;
@group(0) @binding(1) var<storage, read> topologyWords: array<u32>;
@group(0) @binding(2) var<storage, read_write> indirectWords: array<atomic<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (arrayLength(&sinkTableWords) < SINK_TABLE_HEADER_WORDS) {
    return;
  }

  let totalRecordCount = sinkTableWords[TABLE_WORD_TOTAL_RECORD_COUNT];
  let recordIndex = gid.x;
  if (recordIndex >= totalRecordCount) {
    return;
  }

  let recordBase = SINK_TABLE_HEADER_WORDS + recordIndex * SINK_TABLE_RECORD_WORDS;
  if (recordBase + RECORD_WORD_FIRST_INSTANCE >= arrayLength(&sinkTableWords)) {
    return;
  }

  let drawMode = sinkTableWords[recordBase + RECORD_WORD_DRAW_MODE];
  let count = sinkTableWords[recordBase + RECORD_WORD_COUNT];
  let instanceCount = sinkTableWords[recordBase + RECORD_WORD_INSTANCE_COUNT];
  let first = sinkTableWords[recordBase + RECORD_WORD_FIRST];
  let baseVertex = sinkTableWords[recordBase + RECORD_WORD_BASE_VERTEX];
  let firstInstance = sinkTableWords[recordBase + RECORD_WORD_FIRST_INSTANCE];
  let indexedRecordCount = sinkTableWords[TABLE_WORD_INDEXED_COUNT];
  let indexedRegionBaseWords = sinkTableWords[TABLE_WORD_INDEXED_REGION_BASE_WORDS];
  let nonIndexedRegionBaseWords = sinkTableWords[TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS];
  let indexedStrideWords = max(sinkTableWords[TABLE_WORD_INDEXED_STRIDE_WORDS], DEFAULT_INDEXED_STRIDE_WORDS);
  let nonIndexedStrideWords = max(sinkTableWords[TABLE_WORD_NON_INDEXED_STRIDE_WORDS], DEFAULT_NON_INDEXED_STRIDE_WORDS);

  if (drawMode == DRAW_MODE_INDEXED) {
    if (recordIndex >= indexedRecordCount) {
      return;
    }
    let base = indexedRegionBaseWords + recordIndex * indexedStrideWords;
    if (base + 4u >= arrayLength(&indirectWords)) {
      return;
    }
    atomicStore(&indirectWords[base + 0u], count);
    atomicAdd(&indirectWords[base + 1u], instanceCount);
    atomicStore(&indirectWords[base + 2u], first);
    atomicStore(&indirectWords[base + 3u], baseVertex);
    atomicStore(&indirectWords[base + 4u], firstInstance);
    return;
  }

  if (drawMode != DRAW_MODE_NON_INDEXED || recordIndex < indexedRecordCount) {
    return;
  }
  let nonIndexedRecordIndex = recordIndex - indexedRecordCount;
  let base = nonIndexedRegionBaseWords + nonIndexedRecordIndex * nonIndexedStrideWords;
  if (base + 3u >= arrayLength(&indirectWords)) {
    return;
  }
  atomicStore(&indirectWords[base + 0u], count);
  atomicAdd(&indirectWords[base + 1u], instanceCount);
  atomicStore(&indirectWords[base + 2u], first);
  atomicStore(&indirectWords[base + 3u], firstInstance);
}
"#;

pub struct ComputeDispatcher {
    simulation_pipelines: Vec<CompiledComputePassPipeline>,
    instance_assembly_pipeline: wgpu::ComputePipeline,
    draw_prep_pipeline: wgpu::ComputePipeline,
    compiler_simulation_layout: wgpu::BindGroupLayout,
    pub uniform_layout: wgpu::BindGroupLayout,
    pub state_layout: wgpu::BindGroupLayout,
    pub assembly_layout: wgpu::BindGroupLayout,
    pub draw_prep_layout: wgpu::BindGroupLayout,
}

#[derive(Clone, Debug)]
pub struct CompilerComputePassSpec {
    pub pass_id: String,
    pub entry_point: String,
    pub wgsl: String,
}

struct CompiledComputePassPipeline {
    _pass_id: String,
    pipeline: wgpu::ComputePipeline,
    workgroup_count: u32,
}

impl ComputeDispatcher {
    fn parse_workgroup_size_x(simulation_wgsl: &str) -> u32 {
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
        maybe_x
            .filter(|x| *x > 0)
            .unwrap_or(DEFAULT_WORKGROUP_SIZE_X)
    }

    fn simulation_dispatch_count_for_wgsl(particle_count: u32, simulation_wgsl: &str) -> u32 {
        let workgroup_size_x = Self::parse_workgroup_size_x(simulation_wgsl);
        ((particle_count.saturating_add(workgroup_size_x.saturating_sub(1))) / workgroup_size_x)
            .max(1)
    }

    pub fn new(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        assembly_wgsl: &str,
        particle_count: u32,
        _shape_count: u32,
    ) -> Self {
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
                    // [LAW:one-source-of-truth] Assembly consumes one canonical
                    // compiler-arena input binding as read-only storage.
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
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
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let draw_prep_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.DrawPrep.Layout"),
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
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
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

        let compiler_simulation_layout = Self::create_compiler_simulation_layout(device);
        let simulation_pipelines = Self::compile_simulation_passes(
            device,
            &compiler_simulation_layout,
            particle_count,
            &[CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: simulation_wgsl.to_string(),
            }],
        );
        let assembly_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.Assembly.Shader"),
            source: wgpu::ShaderSource::Wgsl(assembly_wgsl.into()),
        });
        let draw_prep_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.DrawPrep.Shader"),
            source: wgpu::ShaderSource::Wgsl(DEFAULT_DRAW_PREP_WGSL.into()),
        });

        let assembly_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute.Assembly.PipelineLayout"),
                bind_group_layouts: &[&uniform_layout, &state_layout, &assembly_layout],
                push_constant_ranges: &[],
            });
        let instance_assembly_pipeline =
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("Compute.Assembly.Pipeline"),
                layout: Some(&assembly_pipeline_layout),
                module: &assembly_module,
                entry_point: Some("main"),
                cache: None,
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            });

        let draw_prep_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute.DrawPrep.PipelineLayout"),
                bind_group_layouts: &[&draw_prep_layout],
                push_constant_ranges: &[],
            });
        let draw_prep_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.DrawPrep.Pipeline"),
            layout: Some(&draw_prep_pipeline_layout),
            module: &draw_prep_module,
            entry_point: Some("main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });

        Self {
            simulation_pipelines,
            instance_assembly_pipeline,
            draw_prep_pipeline,
            compiler_simulation_layout,
            uniform_layout,
            state_layout,
            assembly_layout,
            draw_prep_layout,
        }
    }

    fn create_compiler_simulation_pipeline(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        entry_point: &str,
        compiler_simulation_layout: &wgpu::BindGroupLayout,
    ) -> wgpu::ComputePipeline {
        let simulation_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.CompilerSimulation.Shader"),
            source: wgpu::ShaderSource::Wgsl(simulation_wgsl.into()),
        });
        let simulation_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute.CompilerSimulation.PipelineLayout"),
                bind_group_layouts: &[compiler_simulation_layout],
                push_constant_ranges: &[],
            });
        device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.CompilerSimulation.Pipeline"),
            layout: Some(&simulation_pipeline_layout),
            module: &simulation_module,
            entry_point: Some(entry_point),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        })
    }

    fn compile_simulation_passes(
        device: &wgpu::Device,
        compiler_simulation_layout: &wgpu::BindGroupLayout,
        particle_count: u32,
        pass_specs: &[CompilerComputePassSpec],
    ) -> Vec<CompiledComputePassPipeline> {
        if pass_specs.is_empty() {
            panic!(
                "[LAW:no-silent-fallbacks] compile_simulation_passes requires at least one pass spec"
            );
        }
        let mut compiled = Vec::with_capacity(pass_specs.len().max(1));
        for spec in pass_specs {
            let pipeline = Self::create_compiler_simulation_pipeline(
                device,
                spec.wgsl.as_str(),
                spec.entry_point.as_str(),
                compiler_simulation_layout,
            );
            let workgroup_count =
                Self::simulation_dispatch_count_for_wgsl(particle_count, spec.wgsl.as_str())
                    .max(1);
            compiled.push(CompiledComputePassPipeline {
                _pass_id: spec.pass_id.clone(),
                pipeline,
                workgroup_count,
            });
        }
        compiled
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

    pub fn rebuild_gpu_pipelines_with_compiler_wgsl(
        &mut self,
        device: &wgpu::Device,
        pass_specs: &[CompilerComputePassSpec],
        particle_count: u32,
    ) {
        self.simulation_pipelines = Self::compile_simulation_passes(
            device,
            &self.compiler_simulation_layout,
            particle_count,
            pass_specs,
        );
    }

    pub fn compiler_simulation_layout(&self) -> &wgpu::BindGroupLayout {
        &self.compiler_simulation_layout
    }

    pub fn simulation_workgroup_count(&self) -> u32 {
        self.simulation_pipelines
            .iter()
            .map(|pipeline| pipeline.workgroup_count)
            .fold(0u32, |acc, count| acc.saturating_add(count))
    }

    pub fn simulation_dispatch_count(&self) -> u32 {
        self.simulation_pipelines.len() as u32
    }

    pub fn encode_simulation_and_assembly(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        arena: &mut GpuMemoryArena,
        assembly_instance_count: u32,
    ) {
        let mut read_index = arena.ping_pong_index();
        for compiled_pass in &self.simulation_pipelines {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute.Simulation.Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&compiled_pass.pipeline);
            compute_pass.set_bind_group(
                0,
                arena.get_compiler_simulation_bind_group_for_index(read_index),
                &[],
            );
            compute_pass.dispatch_workgroups(compiled_pass.workgroup_count, 1, 1);
            read_index = (read_index + 1) & 1;
        }

        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute.InstanceAssembly.Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&self.instance_assembly_pipeline);
            compute_pass.set_bind_group(0, &arena.uniform_bind_group, &[]);
            // [LAW:one-source-of-truth] Instance assembly reads the final
            // simulation output bank resolved by deterministic pass chaining.
            compute_pass.set_bind_group(1, arena.get_compiler_arena_bind_group_for_index(read_index), &[]);
            compute_pass.set_bind_group(2, &arena.assembly_write_bind_group, &[]);
            // [LAW:single-enforcer] Runtime sink-table instance totals are the
            // canonical source for per-frame assembly dispatch size.
            let assembly_workgroup_count =
                ((assembly_instance_count.saturating_add(63)) / 64).max(1);
            compute_pass.dispatch_workgroups(assembly_workgroup_count, 1, 1);
        }
        arena.set_ping_pong_index(read_index);
    }

    pub fn encode_draw_prep(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        arena: &GpuMemoryArena,
        draw_prep_record_count: u32,
    ) {
        let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Compute.DrawPrep.Pass"),
            timestamp_writes: None,
        });
        compute_pass.set_pipeline(&self.draw_prep_pipeline);
        compute_pass.set_bind_group(0, &arena.draw_prep_bind_group, &[]);
        // [LAW:dataflow-not-control-flow] Draw prep always dispatches on the
        // canonical stage; record count data governs in-shader no-op behavior.
        let draw_prep_workgroup_count =
            ((draw_prep_record_count.saturating_add(63)) / 64).max(1);
        compute_pass.dispatch_workgroups(draw_prep_workgroup_count, 1, 1);
    }

}
