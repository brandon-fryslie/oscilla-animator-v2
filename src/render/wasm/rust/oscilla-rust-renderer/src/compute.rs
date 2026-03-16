use crate::memory::GpuMemoryArena;
use naga::valid::{Capabilities, ValidationFlags, Validator};
use naga::{AddressSpace, Block, Module, Statement, TypeInner};

// [RECOVER-06] Draw-prep compute derives indirect args from canonical GPU state.
// [LAW:one-source-of-truth] Topology bank (ShapeHeaderV1) is the canonical
// geometry source. Descriptors carry static metadata resolved at pack time.
const DEFAULT_DRAW_PREP_WGSL: &str = r#"
const DRAW_MODE_INDEXED: u32 = 0u;
const DRAW_MODE_NON_INDEXED: u32 = 1u;
const SINK_TABLE_HEADER_WORDS: u32 = 8u;
const SINK_TABLE_RECORD_WORDS: u32 = 8u;
const SINK_TABLE_DESCRIPTOR_WORDS: u32 = 26u;
const DEFAULT_INDEXED_STRIDE_WORDS: u32 = 5u;
const DEFAULT_NON_INDEXED_STRIDE_WORDS: u32 = 4u;

const TABLE_WORD_TOTAL_RECORD_COUNT: u32 = 1u;
const TABLE_WORD_INDEXED_COUNT: u32 = 2u;
const TABLE_WORD_INDEXED_REGION_BASE_WORDS: u32 = 4u;
const TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS: u32 = 5u;
const TABLE_WORD_INDEXED_STRIDE_WORDS: u32 = 6u;
const TABLE_WORD_NON_INDEXED_STRIDE_WORDS: u32 = 7u;

const RECORD_WORD_DRAW_MODE: u32 = 0u;

// Descriptor word offsets for instance-count and shape metadata
const DESCRIPTOR_WORD_INSTANCE_COUNT_MODE: u32 = 23u;
const DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT: u32 = 24u;
const DESCRIPTOR_WORD_SHAPE_WORD_OFFSET: u32 = 25u;

const INSTANCE_COUNT_MODE_STATIC: u32 = 0u;

// ShapeHeaderV1 word offsets (must match RuntimeState.ts ShapeBankHeaderWord)
const SHAPE_WORD_INDEX_COUNT: u32 = 4u;
const SHAPE_WORD_FIRST_INDEX: u32 = 5u;
const SHAPE_WORD_BASE_VERTEX: u32 = 6u;
const SHAPE_WORD_VERTEX_COUNT: u32 = 7u;
const SHAPE_WORD_FIRST_VERTEX: u32 = 8u;

@group(0) @binding(0) var<storage, read> sinkTableWords: array<u32>;
@group(0) @binding(1) var<storage, read> topologyBank: array<u32>;
@group(0) @binding(2) var<storage, read_write> indirectWords: array<atomic<u32>>;

fn readTopology(offset: u32) -> u32 {
  if (offset >= arrayLength(&topologyBank)) {
    return 0u;
  }
  return topologyBank[offset];
}

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
  if (recordBase >= arrayLength(&sinkTableWords)) {
    return;
  }

  let drawMode = sinkTableWords[recordBase + RECORD_WORD_DRAW_MODE];
  let indexedRecordCount = sinkTableWords[TABLE_WORD_INDEXED_COUNT];
  let indexedRegionBaseWords = sinkTableWords[TABLE_WORD_INDEXED_REGION_BASE_WORDS];
  let nonIndexedRegionBaseWords = sinkTableWords[TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS];
  let indexedStrideWords = max(sinkTableWords[TABLE_WORD_INDEXED_STRIDE_WORDS], DEFAULT_INDEXED_STRIDE_WORDS);
  let nonIndexedStrideWords = max(sinkTableWords[TABLE_WORD_NON_INDEXED_STRIDE_WORDS], DEFAULT_NON_INDEXED_STRIDE_WORDS);

  // [RECOVER-06] Read descriptor for this record
  let descriptorsBase = SINK_TABLE_HEADER_WORDS + totalRecordCount * SINK_TABLE_RECORD_WORDS;
  let descriptorBase = descriptorsBase + recordIndex * SINK_TABLE_DESCRIPTOR_WORDS;

  // Derive instanceCount from descriptor
  let instanceCountMode = sinkTableWords[descriptorBase + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE];
  let instanceCount = select(0u, sinkTableWords[descriptorBase + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT], instanceCountMode == INSTANCE_COUNT_MODE_STATIC);

  // Derive firstInstance as prefix sum of instance counts for all earlier records
  var firstInstance = 0u;
  for (var i = 0u; i < recordIndex; i = i + 1u) {
    let prevDescBase = descriptorsBase + i * SINK_TABLE_DESCRIPTOR_WORDS;
    let prevMode = sinkTableWords[prevDescBase + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE];
    firstInstance = firstInstance + select(0u, sinkTableWords[prevDescBase + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT], prevMode == INSTANCE_COUNT_MODE_STATIC);
  }

  // Read shape word offset from descriptor and derive geometry from topology bank
  let shapeWordOffset = sinkTableWords[descriptorBase + DESCRIPTOR_WORD_SHAPE_WORD_OFFSET];

  if (drawMode == DRAW_MODE_INDEXED) {
    if (recordIndex >= indexedRecordCount) {
      return;
    }
    // Derive indexed draw args from ShapeHeaderV1
    let count = readTopology(shapeWordOffset + SHAPE_WORD_INDEX_COUNT);
    let first = readTopology(shapeWordOffset + SHAPE_WORD_FIRST_INDEX);
    let baseVertex = readTopology(shapeWordOffset + SHAPE_WORD_BASE_VERTEX);

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
  // Derive non-indexed draw args from ShapeHeaderV1
  let count = readTopology(shapeWordOffset + SHAPE_WORD_VERTEX_COUNT);
  let first = readTopology(shapeWordOffset + SHAPE_WORD_FIRST_VERTEX);

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WorkgroupSize {
    x: u32,
    y: u32,
    z: u32,
}

struct CompiledComputePassPipeline {
    _pass_id: String,
    pipeline: wgpu::ComputePipeline,
    workgroup_count: u32,
}

#[derive(Clone, Debug)]
struct ValidatedComputePassProgram {
    pass_id: String,
    entry_point: String,
    wgsl: String,
    workgroup_count: u32,
}

pub struct StagedSimulationPipelines {
    programs: Vec<ValidatedComputePassProgram>,
}

impl ComputeDispatcher {
    fn validate_workgroup_size(
        limits: &wgpu::Limits,
        pass_id: &str,
        workgroup_size: WorkgroupSize,
    ) -> Result<(), String> {
        if workgroup_size.x > limits.max_compute_workgroup_size_x {
            return Err(format!(
                "pass \"{}\" workgroup_size.x={} exceeds device limit {}",
                pass_id, workgroup_size.x, limits.max_compute_workgroup_size_x
            ));
        }
        if workgroup_size.y > limits.max_compute_workgroup_size_y {
            return Err(format!(
                "pass \"{}\" workgroup_size.y={} exceeds device limit {}",
                pass_id, workgroup_size.y, limits.max_compute_workgroup_size_y
            ));
        }
        if workgroup_size.z > limits.max_compute_workgroup_size_z {
            return Err(format!(
                "pass \"{}\" workgroup_size.z={} exceeds device limit {}",
                pass_id, workgroup_size.z, limits.max_compute_workgroup_size_z
            ));
        }
        let total_invocations = workgroup_size
            .x
            .saturating_mul(workgroup_size.y)
            .saturating_mul(workgroup_size.z);
        if total_invocations > limits.max_compute_invocations_per_workgroup {
            return Err(format!(
                "pass \"{}\" total workgroup invocations={} exceeds device limit {}",
                pass_id, total_invocations, limits.max_compute_invocations_per_workgroup
            ));
        }
        Ok(())
    }

    fn simulation_dispatch_count_for_workgroup_size(
        particle_count: u32,
        workgroup_size: WorkgroupSize,
    ) -> u32 {
        ((particle_count.saturating_add(workgroup_size.x.saturating_sub(1))) / workgroup_size.x)
            .max(1)
    }

    fn validate_supported_type_subset(
        module: &Module,
        pass_id: &str,
        ty: naga::Handle<naga::Type>,
    ) -> Result<(), String> {
        match &module.types[ty].inner {
            TypeInner::Scalar(_)
            | TypeInner::Vector { .. }
            | TypeInner::Matrix { .. }
            | TypeInner::Atomic(_) => Ok(()),
            TypeInner::Array { base, .. } => {
                Self::validate_supported_type_subset(module, pass_id, *base)
            }
            TypeInner::Struct { members, .. } => {
                for member in members {
                    Self::validate_supported_type_subset(module, pass_id, member.ty)?;
                }
                Ok(())
            }
            TypeInner::Pointer { .. }
            | TypeInner::ValuePointer { .. }
            | TypeInner::Image { .. }
            | TypeInner::Sampler { .. }
            | TypeInner::BindingArray { .. }
            | TypeInner::AccelerationStructure
            | TypeInner::RayQuery => Err(format!(
                "pass \"{}\" uses unsupported resource type {:?}",
                pass_id, module.types[ty].inner
            )),
        }
    }

    fn validate_supported_program_interface(pass_id: &str, module: &Module) -> Result<(), String> {
        for (_, global) in module.global_variables.iter() {
            if global.space == AddressSpace::WorkGroup {
                return Err(format!(
                    "pass \"{}\" uses unsupported workgroup memory",
                    pass_id
                ));
            }
            if global.binding.is_none() {
                continue;
            }
            match global.space {
                AddressSpace::Uniform | AddressSpace::Storage { .. } => {
                    Self::validate_supported_type_subset(module, pass_id, global.ty)?;
                }
                _ => {
                    return Err(format!(
                        "pass \"{}\" uses unsupported bound resource address space {:?}",
                        pass_id, global.space
                    ));
                }
            }
        }
        Ok(())
    }

    fn validate_supported_statement_subset(pass_id: &str, block: &Block) -> Result<(), String> {
        for statement in block {
            match statement {
                Statement::Block(inner) => {
                    Self::validate_supported_statement_subset(pass_id, inner)?
                }
                Statement::If { accept, reject, .. } => {
                    Self::validate_supported_statement_subset(pass_id, accept)?;
                    Self::validate_supported_statement_subset(pass_id, reject)?;
                }
                Statement::Switch { cases, .. } => {
                    for case in cases {
                        Self::validate_supported_statement_subset(pass_id, &case.body)?;
                    }
                }
                Statement::Loop { .. } => {
                    return Err(format!(
                        "pass \"{}\" uses unsupported loop control flow",
                        pass_id
                    ));
                }
                Statement::Barrier(_)
                | Statement::Atomic { .. }
                | Statement::ImageStore { .. }
                | Statement::ImageAtomic { .. }
                | Statement::WorkGroupUniformLoad { .. }
                | Statement::RayQuery { .. } => {
                    return Err(format!(
                        "pass \"{}\" uses unsupported compute-side synchronization or image operations",
                        pass_id
                    ));
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn find_compute_entry_point(
        pass_id: &str,
        module: &Module,
        entry_point: &str,
    ) -> Result<WorkgroupSize, String> {
        let entry = module
            .entry_points
            .iter()
            .find(|candidate| candidate.name == entry_point)
            .ok_or_else(|| {
                format!(
                    "pass \"{}\" entry point \"{}\" was not found in WGSL module",
                    pass_id, entry_point
                )
            })?;
        if entry.stage != naga::ShaderStage::Compute {
            return Err(format!(
                "pass \"{}\" entry point \"{}\" must be a compute stage",
                pass_id, entry_point
            ));
        }
        if entry.workgroup_size_overrides.is_some() {
            return Err(format!(
                "pass \"{}\" entry point \"{}\" uses unsupported override-based workgroup sizing",
                pass_id, entry_point
            ));
        }
        Ok(WorkgroupSize {
            x: entry.workgroup_size[0],
            y: entry.workgroup_size[1],
            z: entry.workgroup_size[2],
        })
    }

    fn validate_compute_program_contract(
        limits: &wgpu::Limits,
        particle_count: u32,
        spec: &CompilerComputePassSpec,
    ) -> Result<ValidatedComputePassProgram, String> {
        // [LAW:single-enforcer] Candidate shader admission is derived from the
        // uploaded WGSL program and device limits at one Rust boundary.
        let module = naga::front::wgsl::parse_str(spec.wgsl.as_str()).map_err(|error| {
            format!(
                "pass \"{}\" WGSL parsing failed:\n{}",
                spec.pass_id,
                error.emit_to_string(spec.wgsl.as_str())
            )
        })?;
        Validator::new(ValidationFlags::all(), Capabilities::all())
            .validate(&module)
            .map_err(|error| {
                format!(
                    "pass \"{}\" WGSL validation failed: {}",
                    spec.pass_id, error
                )
            })?;
        let workgroup_size = Self::find_compute_entry_point(
            spec.pass_id.as_str(),
            &module,
            spec.entry_point.as_str(),
        )?;
        Self::validate_workgroup_size(limits, spec.pass_id.as_str(), workgroup_size)?;
        Self::validate_supported_program_interface(spec.pass_id.as_str(), &module)?;
        for entry in &module.entry_points {
            Self::validate_supported_statement_subset(spec.pass_id.as_str(), &entry.function.body)?;
        }
        for (_, function) in module.functions.iter() {
            Self::validate_supported_statement_subset(spec.pass_id.as_str(), &function.body)?;
        }
        let workgroup_count =
            Self::simulation_dispatch_count_for_workgroup_size(particle_count, workgroup_size)
                .max(1);
        if workgroup_count > limits.max_compute_workgroups_per_dimension {
            return Err(format!(
                "pass \"{}\" dispatch count {} exceeds device limit {}",
                spec.pass_id, workgroup_count, limits.max_compute_workgroups_per_dimension
            ));
        }
        Ok(ValidatedComputePassProgram {
            pass_id: spec.pass_id.clone(),
            entry_point: spec.entry_point.clone(),
            wgsl: spec.wgsl.clone(),
            workgroup_count,
        })
    }

    pub fn new(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        assembly_wgsl: &str,
        particle_count: u32,
        _shape_count: u32,
    ) -> Self {
        // [LAW:one-source-of-truth] This layout defines the uniform transport
        // binding for FrameHeader. The canonical source is the arena header
        // zone; this uniform binding mirrors that data for GPU binding compat.
        let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("FrameHeader.UniformTransport.Layout"),
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
        let default_program = Self::validate_compute_program_contract(
            &device.limits(),
            particle_count,
            &CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: simulation_wgsl.to_string(),
            },
        )
        .expect("default simulation shader must satisfy canonical compute-program contract");
        let simulation_pipelines = Self::compile_runtime_simulation_pipelines(
            device,
            &compiler_simulation_layout,
            &[default_program],
        )
        .expect("default simulation pipeline must satisfy canonical workgroup/device limits");
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

    fn compile_runtime_simulation_pipelines(
        device: &wgpu::Device,
        compiler_simulation_layout: &wgpu::BindGroupLayout,
        programs: &[ValidatedComputePassProgram],
    ) -> Result<Vec<CompiledComputePassPipeline>, String> {
        if programs.is_empty() {
            return Err(
                "[LAW:no-silent-fallbacks] compile_runtime_simulation_pipelines requires at least one validated program".to_string(),
            );
        }
        let mut compiled = Vec::with_capacity(programs.len().max(1));
        for program in programs {
            let pipeline = Self::create_compiler_simulation_pipeline(
                device,
                program.wgsl.as_str(),
                program.entry_point.as_str(),
                compiler_simulation_layout,
            );
            compiled.push(CompiledComputePassPipeline {
                _pass_id: program.pass_id.clone(),
                pipeline,
                workgroup_count: program.workgroup_count,
            });
        }
        Ok(compiled)
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

    async fn validate_program_only_pipeline_compilation(
        device: &wgpu::Device,
        program: &ValidatedComputePassProgram,
    ) -> Result<(), String> {
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let simulation_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.CandidateShaderAdmission.Shader"),
            source: wgpu::ShaderSource::Wgsl(program.wgsl.as_str().into()),
        });
        let _pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.CandidateShaderAdmission.Pipeline"),
            layout: None,
            module: &simulation_module,
            entry_point: Some(program.entry_point.as_str()),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });
        if let Some(error) = device.pop_error_scope().await {
            return Err(format!(
                "pass \"{}\" generic pipeline compilation failed: {}",
                program.pass_id, error
            ));
        }
        Ok(())
    }

    pub async fn stage_gpu_pipelines_with_compiler_wgsl(
        &self,
        device: &wgpu::Device,
        pass_specs: &[CompilerComputePassSpec],
        particle_count: u32,
    ) -> Result<StagedSimulationPipelines, String> {
        if pass_specs.is_empty() {
            return Err(
                "[LAW:no-silent-fallbacks] stage_gpu_pipelines_with_compiler_wgsl requires at least one pass spec".to_string(),
            );
        }
        // [LAW:one-source-of-truth] Stage decisions come from WGSL program
        // contents plus device limits, not application-owned runtime planes.
        let limits = device.limits();
        let mut programs = Vec::with_capacity(pass_specs.len());
        for spec in pass_specs {
            let program = Self::validate_compute_program_contract(&limits, particle_count, spec)?;
            Self::validate_program_only_pipeline_compilation(device, &program).await?;
            programs.push(program);
        }
        Ok(StagedSimulationPipelines { programs })
    }

    pub async fn activate_staged_gpu_pipelines(
        &mut self,
        device: &wgpu::Device,
        staged: StagedSimulationPipelines,
    ) -> Result<(), String> {
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let pipelines = Self::compile_runtime_simulation_pipelines(
            device,
            &self.compiler_simulation_layout,
            staged.programs.as_slice(),
        )?;
        if let Some(error) = device.pop_error_scope().await {
            return Err(error.to_string());
        }
        self.simulation_pipelines = pipelines;
        Ok(())
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
            compute_pass.set_bind_group(
                1,
                arena.get_compiler_arena_bind_group_for_index(read_index),
                &[],
            );
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
        let draw_prep_workgroup_count = ((draw_prep_record_count.saturating_add(63)) / 64).max(1);
        compute_pass.dispatch_workgroups(draw_prep_workgroup_count, 1, 1);
    }
}

#[cfg(test)]
mod tests {
    use super::{CompilerComputePassSpec, ComputeDispatcher, WorkgroupSize};

    #[test]
    fn validate_compute_program_contract_rejects_missing_entry_point() {
        let result = ComputeDispatcher::validate_compute_program_contract(
            &wgpu::Limits::default(),
            1_024,
            &CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: "@compute @workgroup_size(64) fn other_main() {}".to_string(),
            },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("entry point \"compute_main\" was not found")));
    }

    #[test]
    fn validate_compute_program_contract_rejects_workgroup_memory() {
        let result = ComputeDispatcher::validate_compute_program_contract(
            &wgpu::Limits::default(),
            1_024,
            &CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: "@group(0) @binding(0) var<storage, read> input_words: array<u32>;\nvar<workgroup> scratch: array<u32, 64>;\n@compute @workgroup_size(64) fn compute_main() { let _value = input_words[0]; scratch[0] = 1u; }".to_string(),
            },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("unsupported workgroup memory")));
    }

    #[test]
    fn dispatch_count_uses_x_dimension_only() {
        let count = ComputeDispatcher::simulation_dispatch_count_for_workgroup_size(
            65_536,
            WorkgroupSize { x: 64, y: 1, z: 1 },
        );
        assert_eq!(count, 1_024);
    }

    #[test]
    fn validate_workgroup_size_rejects_total_invocations_over_limit() {
        let mut limits = wgpu::Limits::default();
        limits.max_compute_workgroup_size_x = 256;
        limits.max_compute_workgroup_size_y = 256;
        limits.max_compute_workgroup_size_z = 64;
        limits.max_compute_invocations_per_workgroup = 256;
        let result = ComputeDispatcher::validate_workgroup_size(
            &limits,
            "simulation",
            WorkgroupSize { x: 32, y: 16, z: 1 },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("total workgroup invocations")));
    }

    #[test]
    fn validate_compute_program_contract_rejects_loop_control_flow() {
        let result = ComputeDispatcher::validate_compute_program_contract(
            &wgpu::Limits::default(),
            1_024,
            &CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: "@group(0) @binding(0) var<storage, read_write> words: array<u32>;\n@compute @workgroup_size(64) fn compute_main() { loop { words[0] = 1u; break; } }".to_string(),
            },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("unsupported loop control flow")));
    }
}
