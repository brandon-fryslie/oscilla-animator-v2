use js_sys::{Array, Object};
use wasm_bindgen::JsValue;

const TIMING_WINDOW_SAMPLES: u32 = 60;

// ---------------------------------------------------------------------------
// Scheduler telemetry — will be replaced by EngineTelemetry from the new spec.
// For now, just enough to keep the scheduler/heartbeat loop compiling.
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default)]
pub struct SchedulerTelemetry {
    pub total_frame_ms: f64,
}

pub fn with_total_frame_timing(
    mut telemetry: SchedulerTelemetry,
    total_frame_ms: f64,
) -> SchedulerTelemetry {
    telemetry.total_frame_ms = total_frame_ms.max(0.0);
    telemetry
}

// ---------------------------------------------------------------------------
// Timing aggregator (rolling window stats for heartbeat)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Scheduler state machine
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Runtime events
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Heartbeat + observability packet
// ---------------------------------------------------------------------------

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
        let payload = Object::new();
        set_str(&payload, "state", self.state.as_str())?;
        set_num(&payload, "frameCount", self.heartbeat.frame_count as f64)?;

        // Heartbeat
        let hb = Object::new();
        set_num(&hb, "sequence", self.heartbeat.sequence as f64)?;
        set_str(&hb, "state", self.heartbeat.state.as_str())?;
        set_num(&hb, "emittedAtMs", self.heartbeat.emitted_at_ms)?;
        set_num(&hb, "frameCount", self.heartbeat.frame_count as f64)?;
        set_num(&hb, "loopCount", self.heartbeat.loop_count as f64)?;
        set_num(&hb, "meanTickMs", self.heartbeat.mean_tick_ms)?;
        set_num(&hb, "stdDevTickMs", self.heartbeat.std_dev_tick_ms)?;
        set_num(&hb, "sampleCount", self.heartbeat.sample_count as f64)?;
        set_num(&hb, "lastTickMs", self.heartbeat.last_tick_ms)?;
        set_num(&hb, "lastSuccessMs", self.heartbeat.last_success_ms)?;

        // Telemetry sub-object (stageTimings, dispatchCounters, resourceStats)
        let telemetry = Object::new();
        let stage_timings = Object::new();
        set_num(&stage_timings, "inputMarshalMs", 0.0)?;
        set_num(&stage_timings, "simulationDispatchMs", 0.0)?;
        set_num(&stage_timings, "drawPrepMs", 0.0)?;
        set_num(&stage_timings, "renderMs", 0.0)?;
        set_num(&stage_timings, "swapMs", 0.0)?;
        set_num(
            &stage_timings,
            "totalFrameMs",
            self.heartbeat.telemetry.total_frame_ms,
        )?;
        js_sys::Reflect::set(
            &telemetry,
            &JsValue::from_str("stageTimings"),
            &stage_timings,
        )?;
        let dispatch_counters = Object::new();
        set_num(&dispatch_counters, "computeDispatchCount", 0.0)?;
        set_num(&dispatch_counters, "computeWorkgroupCount", 0.0)?;
        set_num(&dispatch_counters, "activeLaneCount", 0.0)?;
        set_num(&dispatch_counters, "guardedLaneCount", 0.0)?;
        js_sys::Reflect::set(
            &telemetry,
            &JsValue::from_str("dispatchCounters"),
            &dispatch_counters,
        )?;
        let resource_stats = Object::new();
        set_num(&resource_stats, "shapeBankWordCount", 0.0)?;
        set_num(&resource_stats, "sinkTableWordCount", 0.0)?;
        set_num(&resource_stats, "indexedRecordCount", 0.0)?;
        set_num(&resource_stats, "nonIndexedRecordCount", 0.0)?;
        set_num(&resource_stats, "totalInstanceCount", 0.0)?;
        set_num(&resource_stats, "canvasWidth", 0.0)?;
        set_num(&resource_stats, "canvasHeight", 0.0)?;
        set_num(&resource_stats, "pingPongIndex", 0.0)?;
        js_sys::Reflect::set(
            &telemetry,
            &JsValue::from_str("resourceStats"),
            &resource_stats,
        )?;
        js_sys::Reflect::set(&hb, &JsValue::from_str("telemetry"), &telemetry)?;

        js_sys::Reflect::set(&payload, &JsValue::from_str("heartbeat"), &hb)?;

        // Events
        let events = Array::new();
        for event in self.events {
            let obj = Object::new();
            set_str(&obj, "severity", event.severity.as_str())?;
            set_str(&obj, "code", event.code)?;
            set_str(&obj, "stage", event.stage)?;
            set_str(&obj, "message", event.message.as_str())?;
            set_str(&obj, "state", event.state.as_str())?;
            set_num(&obj, "frameCount", event.frame_count as f64)?;
            set_num(&obj, "loopCount", event.loop_count as f64)?;
            set_num(&obj, "emittedAtMs", event.emitted_at_ms)?;
            events.push(&obj.into());
        }
        js_sys::Reflect::set(&payload, &JsValue::from_str("events"), &events)?;

        Ok(payload.into())
    }
}

// ---------------------------------------------------------------------------
// JS serialization helpers
// ---------------------------------------------------------------------------

fn set_num(target: &Object, key: &str, value: f64) -> Result<(), JsValue> {
    js_sys::Reflect::set(target, &JsValue::from_str(key), &JsValue::from_f64(value))?;
    Ok(())
}

fn set_str(target: &Object, key: &str, value: &str) -> Result<(), JsValue> {
    js_sys::Reflect::set(target, &JsValue::from_str(key), &JsValue::from_str(value))?;
    Ok(())
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
