use js_sys::{Array, Object};
use wasm_bindgen::JsValue;

const TIMING_WINDOW_SAMPLES: u32 = 60;

#[derive(Clone, Copy, Debug, Default)]
pub struct StageTimingsMs {
    pub input_marshal_ms: f64,
    pub simulation_dispatch_ms: f64,
    pub fluid_pass_chain_ms: f64,
    pub draw_prep_ms: f64,
    pub render_ms: f64,
    pub swap_ms: f64,
    pub total_frame_ms: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct DispatchCounters {
    pub compute_dispatch_count: u32,
    pub compute_workgroup_count: u32,
    pub active_lane_count: u32,
    pub guarded_lane_count: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ResourceStats {
    pub shape_bank_word_count: u32,
    pub sink_table_word_count: u32,
    pub indexed_record_count: u32,
    pub non_indexed_record_count: u32,
    pub total_instance_count: u32,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub ping_pong_index: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SchedulerTelemetry {
    pub stage_timings: StageTimingsMs,
    pub dispatch_counters: DispatchCounters,
    pub resource_stats: ResourceStats,
}

#[derive(Clone, Copy, Debug)]
pub struct SchedulerTelemetryInputs {
    pub simulation_dispatch_count: u32,
    pub simulation_workgroup_count: u32,
    pub indexed_record_count: u32,
    pub non_indexed_record_count: u32,
    pub total_instance_count: u32,
    pub shape_bank_word_count: u32,
    pub sink_table_word_count: u32,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub ping_pong_index: u32,
}

pub fn build_scheduler_telemetry(
    stage_timings: StageTimingsMs,
    inputs: SchedulerTelemetryInputs,
) -> SchedulerTelemetry {
    // [LAW:one-source-of-truth] Scheduler telemetry shaping is centralized in
    // one module so runtime boundaries consume a single canonical packet model.
    let assembly_workgroup_count = ((inputs.total_instance_count.saturating_add(63)) / 64).max(1);
    let draw_prep_record_count = inputs
        .indexed_record_count
        .saturating_add(inputs.non_indexed_record_count);
    let draw_prep_workgroup_count = ((draw_prep_record_count.saturating_add(63)) / 64).max(1);
    let dispatch_counters = DispatchCounters {
        compute_dispatch_count: inputs
            .simulation_dispatch_count
            .saturating_add(1)
            .saturating_add(1),
        compute_workgroup_count: inputs
            .simulation_workgroup_count
            .saturating_add(assembly_workgroup_count)
            .saturating_add(draw_prep_workgroup_count),
        active_lane_count: inputs.total_instance_count,
        guarded_lane_count: assembly_workgroup_count
            .saturating_mul(64)
            .saturating_sub(inputs.total_instance_count),
    };
    let resource_stats = ResourceStats {
        shape_bank_word_count: inputs.shape_bank_word_count,
        sink_table_word_count: inputs.sink_table_word_count,
        indexed_record_count: inputs.indexed_record_count,
        non_indexed_record_count: inputs.non_indexed_record_count,
        total_instance_count: inputs.total_instance_count,
        canvas_width: inputs.canvas_width,
        canvas_height: inputs.canvas_height,
        ping_pong_index: inputs.ping_pong_index,
    };
    SchedulerTelemetry {
        stage_timings,
        dispatch_counters,
        resource_stats,
    }
}

pub fn with_total_frame_timing(
    mut telemetry: SchedulerTelemetry,
    total_frame_ms: f64,
) -> SchedulerTelemetry {
    telemetry.stage_timings.total_frame_ms = total_frame_ms.max(0.0);
    telemetry
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TickTimingStats {
    pub mean_tick_ms: f64,
    pub std_dev_tick_ms: f64,
    pub sample_count: u32,
}

#[derive(Debug, Default)]
pub struct TimingAggregator {
    window_sum_ms: f64,
    window_sum_sq_ms: f64,
    window_sample_count: u32,
    stats: TickTimingStats,
}

impl TimingAggregator {
    pub fn record_sample(&mut self, elapsed_ms: f64) {
        // [LAW:dataflow-not-control-flow] Sample aggregation runs every tick;
        // variability is represented by numeric sample values only.
        let sample = elapsed_ms.max(0.0);
        self.window_sum_ms += sample;
        self.window_sum_sq_ms += sample * sample;
        self.window_sample_count = self.window_sample_count.saturating_add(1);
        if self.window_sample_count < TIMING_WINDOW_SAMPLES {
            return;
        }
        let sample_count = self.window_sample_count.max(1);
        let sample_count_f = sample_count as f64;
        let mean = self.window_sum_ms / sample_count_f;
        let variance = (self.window_sum_sq_ms / sample_count_f) - (mean * mean);
        self.stats = TickTimingStats {
            mean_tick_ms: mean,
            std_dev_tick_ms: variance.max(0.0).sqrt(),
            sample_count,
        };
        self.window_sum_ms = 0.0;
        self.window_sum_sq_ms = 0.0;
        self.window_sample_count = 0;
    }

    pub fn stats(&self) -> TickTimingStats {
        self.stats
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SchedulerState {
    Booting,
    Running,
    Paused,
    Lost,
}

impl SchedulerState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Booting => "Booting",
            Self::Running => "Running",
            Self::Paused => "Paused",
            Self::Lost => "Lost",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeEventSeverity {
    Error,
    Fatal,
}

impl RuntimeEventSeverity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Fatal => "fatal",
        }
    }
}

#[derive(Clone, Debug)]
pub struct RuntimeEvent {
    pub severity: RuntimeEventSeverity,
    pub code: &'static str,
    pub stage: &'static str,
    pub message: String,
    pub state: SchedulerState,
    pub frame_count: u64,
    pub loop_count: u64,
    pub emitted_at_ms: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct SchedulerHeartbeat {
    pub sequence: u64,
    pub state: SchedulerState,
    pub emitted_at_ms: f64,
    pub frame_count: u64,
    pub loop_count: u64,
    pub mean_tick_ms: f64,
    pub std_dev_tick_ms: f64,
    pub sample_count: u32,
    pub last_tick_ms: f64,
    pub last_success_ms: f64,
    pub telemetry: SchedulerTelemetry,
}

#[derive(Clone, Debug)]
pub struct WorkerObservabilityPacket {
    pub state: SchedulerState,
    pub heartbeat: SchedulerHeartbeat,
    pub events: Vec<RuntimeEvent>,
}

impl WorkerObservabilityPacket {
    pub fn to_js_value(self) -> Result<JsValue, JsValue> {
        // [LAW:single-enforcer] JS serialization of observability packets is
        // enforced in one boundary helper to prevent shape drift.
        let payload = Object::new();
        set_string(&payload, "state", self.state.as_str())?;
        set_object(&payload, "heartbeat", &serialize_heartbeat(self.heartbeat)?)?;
        set_value(&payload, "events", &serialize_events(self.events)?)?;
        set_number(&payload, "frameCount", self.heartbeat.frame_count as f64)?;
        Ok(payload.into())
    }
}

fn serialize_heartbeat(heartbeat: SchedulerHeartbeat) -> Result<Object, JsValue> {
    let heartbeat_object = Object::new();
    set_number(&heartbeat_object, "sequence", heartbeat.sequence as f64)?;
    set_string(&heartbeat_object, "state", heartbeat.state.as_str())?;
    set_number(&heartbeat_object, "emittedAtMs", heartbeat.emitted_at_ms)?;
    set_number(
        &heartbeat_object,
        "frameCount",
        heartbeat.frame_count as f64,
    )?;
    set_number(&heartbeat_object, "loopCount", heartbeat.loop_count as f64)?;
    set_number(&heartbeat_object, "meanTickMs", heartbeat.mean_tick_ms)?;
    set_number(&heartbeat_object, "stdDevTickMs", heartbeat.std_dev_tick_ms)?;
    set_number(
        &heartbeat_object,
        "sampleCount",
        heartbeat.sample_count as f64,
    )?;
    set_number(&heartbeat_object, "lastTickMs", heartbeat.last_tick_ms)?;
    set_number(
        &heartbeat_object,
        "lastSuccessMs",
        heartbeat.last_success_ms,
    )?;
    set_object(
        &heartbeat_object,
        "telemetry",
        &serialize_scheduler_telemetry(heartbeat.telemetry)?,
    )?;
    Ok(heartbeat_object)
}

fn serialize_scheduler_telemetry(telemetry: SchedulerTelemetry) -> Result<Object, JsValue> {
    let telemetry_object = Object::new();
    set_object(
        &telemetry_object,
        "stageTimings",
        &serialize_stage_timings(telemetry.stage_timings)?,
    )?;
    set_object(
        &telemetry_object,
        "dispatchCounters",
        &serialize_dispatch_counters(telemetry.dispatch_counters)?,
    )?;
    set_object(
        &telemetry_object,
        "resourceStats",
        &serialize_resource_stats(telemetry.resource_stats)?,
    )?;
    Ok(telemetry_object)
}

fn serialize_stage_timings(stage_timings: StageTimingsMs) -> Result<Object, JsValue> {
    let object = Object::new();
    set_number(&object, "inputMarshalMs", stage_timings.input_marshal_ms)?;
    set_number(
        &object,
        "simulationDispatchMs",
        stage_timings.simulation_dispatch_ms,
    )?;
    set_number(
        &object,
        "fluidPassChainMs",
        stage_timings.fluid_pass_chain_ms,
    )?;
    set_number(&object, "drawPrepMs", stage_timings.draw_prep_ms)?;
    set_number(&object, "renderMs", stage_timings.render_ms)?;
    set_number(&object, "swapMs", stage_timings.swap_ms)?;
    set_number(&object, "totalFrameMs", stage_timings.total_frame_ms)?;
    Ok(object)
}

fn serialize_dispatch_counters(dispatch_counters: DispatchCounters) -> Result<Object, JsValue> {
    let object = Object::new();
    set_number(
        &object,
        "computeDispatchCount",
        dispatch_counters.compute_dispatch_count as f64,
    )?;
    set_number(
        &object,
        "computeWorkgroupCount",
        dispatch_counters.compute_workgroup_count as f64,
    )?;
    set_number(
        &object,
        "activeLaneCount",
        dispatch_counters.active_lane_count as f64,
    )?;
    set_number(
        &object,
        "guardedLaneCount",
        dispatch_counters.guarded_lane_count as f64,
    )?;
    Ok(object)
}

fn serialize_resource_stats(resource_stats: ResourceStats) -> Result<Object, JsValue> {
    let object = Object::new();
    set_number(
        &object,
        "shapeBankWordCount",
        resource_stats.shape_bank_word_count as f64,
    )?;
    set_number(
        &object,
        "sinkTableWordCount",
        resource_stats.sink_table_word_count as f64,
    )?;
    set_number(
        &object,
        "indexedRecordCount",
        resource_stats.indexed_record_count as f64,
    )?;
    set_number(
        &object,
        "nonIndexedRecordCount",
        resource_stats.non_indexed_record_count as f64,
    )?;
    set_number(
        &object,
        "totalInstanceCount",
        resource_stats.total_instance_count as f64,
    )?;
    set_number(&object, "canvasWidth", resource_stats.canvas_width as f64)?;
    set_number(&object, "canvasHeight", resource_stats.canvas_height as f64)?;
    set_number(
        &object,
        "pingPongIndex",
        resource_stats.ping_pong_index as f64,
    )?;
    Ok(object)
}

fn serialize_events(events: Vec<RuntimeEvent>) -> Result<JsValue, JsValue> {
    let array = Array::new();
    for event in events {
        array.push(&serialize_runtime_event(event)?.into());
    }
    Ok(array.into())
}

fn serialize_runtime_event(event: RuntimeEvent) -> Result<Object, JsValue> {
    let object = Object::new();
    set_string(&object, "severity", event.severity.as_str())?;
    set_string(&object, "code", event.code)?;
    set_string(&object, "stage", event.stage)?;
    set_string(&object, "message", event.message.as_str())?;
    set_string(&object, "state", event.state.as_str())?;
    set_number(&object, "frameCount", event.frame_count as f64)?;
    set_number(&object, "loopCount", event.loop_count as f64)?;
    set_number(&object, "emittedAtMs", event.emitted_at_ms)?;
    Ok(object)
}

fn set_number(target: &Object, key: &str, value: f64) -> Result<(), JsValue> {
    js_sys::Reflect::set(target, &JsValue::from_str(key), &JsValue::from_f64(value))?;
    Ok(())
}

fn set_string(target: &Object, key: &str, value: &str) -> Result<(), JsValue> {
    js_sys::Reflect::set(target, &JsValue::from_str(key), &JsValue::from_str(value))?;
    Ok(())
}

fn set_object(target: &Object, key: &str, value: &Object) -> Result<(), JsValue> {
    js_sys::Reflect::set(target, &JsValue::from_str(key), value)?;
    Ok(())
}

fn set_value(target: &Object, key: &str, value: &JsValue) -> Result<(), JsValue> {
    js_sys::Reflect::set(target, &JsValue::from_str(key), value)?;
    Ok(())
}

// -- RECOVER-10: Structured readback snapshot ----------------------------

/// [LAW:single-enforcer] One canonical readback snapshot type for all
/// GPU-to-host observability data (indirect args + instance probe).
#[derive(Clone, Debug)]
pub struct ReadbackSnapshot {
    pub frame_count: u64,
    pub captured_at_ms: f64,
    pub indirect_args: Vec<IndirectArgsRecord>,
    pub indirect_words_head: Vec<u32>,
    pub shape_header_sample: Vec<u32>,
    pub shape_cp_resolution_sample: Vec<u32>,
    pub instance_probe_values: Vec<f32>,
    pub render_counters: ReadbackRenderCounters,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct IndirectArgsRecord {
    pub index_count: u32,
    pub vertex_count: u32,
    pub instance_count: u32,
    pub first_index: u32,
    pub first_vertex: u32,
    pub base_vertex: i32,
    pub first_instance: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadbackRenderCounters {
    pub expected_indexed_record_count: u32,
    pub expected_non_indexed_record_count: u32,
    pub expected_total_instance_count: u32,
    pub decoded_indexed_record_count: u32,
    pub decoded_non_indexed_record_count: u32,
    pub decoded_indexed_instance_count: u32,
    pub decoded_non_indexed_instance_count: u32,
    pub decoded_non_zero_record_count: u32,
}

impl ReadbackSnapshot {
    pub fn to_js_value(&self) -> Result<JsValue, JsValue> {
        let payload = Object::new();
        set_number(&payload, "frameCount", self.frame_count as f64)?;
        set_number(&payload, "capturedAtMs", self.captured_at_ms)?;
        let indirect_args_js = serialize_indirect_args_records(&self.indirect_args)?;
        set_value(&payload, "indirectArgs", &indirect_args_js)?;
        let indirect_words_js = serialize_u32_array(&self.indirect_words_head);
        set_value(&payload, "indirectWordsHead", &indirect_words_js)?;
        let shape_header_js = serialize_u32_array(&self.shape_header_sample);
        set_value(&payload, "shapeHeaderSample", &shape_header_js)?;
        let shape_cp_resolution_js = serialize_u32_array(&self.shape_cp_resolution_sample);
        set_value(
            &payload,
            "shapeCpResolutionSample",
            &shape_cp_resolution_js,
        )?;
        let probe_js = serialize_f32_array(&self.instance_probe_values);
        set_value(&payload, "instanceProbeValues", &probe_js)?;
        let render_counters_js = serialize_readback_render_counters(self.render_counters)?;
        set_value(&payload, "renderCounters", &render_counters_js)?;
        Ok(payload.into())
    }
}

fn serialize_indirect_args_records(records: &[IndirectArgsRecord]) -> Result<JsValue, JsValue> {
    let array = Array::new();
    for record in records {
        let object = Object::new();
        set_number(&object, "indexCount", record.index_count as f64)?;
        set_number(&object, "vertexCount", record.vertex_count as f64)?;
        set_number(&object, "instanceCount", record.instance_count as f64)?;
        set_number(&object, "firstIndex", record.first_index as f64)?;
        set_number(&object, "firstVertex", record.first_vertex as f64)?;
        set_number(&object, "baseVertex", record.base_vertex as f64)?;
        set_number(&object, "firstInstance", record.first_instance as f64)?;
        array.push(&object.into());
    }
    Ok(array.into())
}

fn serialize_f32_array(values: &[f32]) -> JsValue {
    let array = js_sys::Float32Array::new_with_length(values.len() as u32);
    for (i, &v) in values.iter().enumerate() {
        array.set_index(i as u32, v);
    }
    array.into()
}

fn serialize_u32_array(values: &[u32]) -> JsValue {
    let array = js_sys::Uint32Array::new_with_length(values.len() as u32);
    for (i, &v) in values.iter().enumerate() {
        array.set_index(i as u32, v);
    }
    array.into()
}

fn serialize_readback_render_counters(
    counters: ReadbackRenderCounters,
) -> Result<JsValue, JsValue> {
    let object = Object::new();
    set_number(
        &object,
        "expectedIndexedRecordCount",
        counters.expected_indexed_record_count as f64,
    )?;
    set_number(
        &object,
        "expectedNonIndexedRecordCount",
        counters.expected_non_indexed_record_count as f64,
    )?;
    set_number(
        &object,
        "expectedTotalInstanceCount",
        counters.expected_total_instance_count as f64,
    )?;
    set_number(
        &object,
        "decodedIndexedRecordCount",
        counters.decoded_indexed_record_count as f64,
    )?;
    set_number(
        &object,
        "decodedNonIndexedRecordCount",
        counters.decoded_non_indexed_record_count as f64,
    )?;
    set_number(
        &object,
        "decodedIndexedInstanceCount",
        counters.decoded_indexed_instance_count as f64,
    )?;
    set_number(
        &object,
        "decodedNonIndexedInstanceCount",
        counters.decoded_non_indexed_instance_count as f64,
    )?;
    set_number(
        &object,
        "decodedNonZeroRecordCount",
        counters.decoded_non_zero_record_count as f64,
    )?;
    Ok(object.into())
}

#[cfg(test)]
mod tests {
    use super::TimingAggregator;

    #[test]
    fn timing_aggregator_updates_summary_after_window() {
        let mut aggregator = TimingAggregator::default();
        for _ in 0..60 {
            aggregator.record_sample(2.0);
        }
        let stats = aggregator.stats();
        assert_eq!(stats.sample_count, 60);
        assert!((stats.mean_tick_ms - 2.0).abs() < f64::EPSILON);
        assert!((stats.std_dev_tick_ms - 0.0).abs() < f64::EPSILON);
    }
}
