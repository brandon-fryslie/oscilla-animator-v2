use std::collections::VecDeque;

const HEARTBEAT_INTERVAL_MS: f64 = 250.0;
const TIMING_WINDOW_SAMPLES: u32 = 60;
const MAX_PENDING_EVENTS: usize = 32;
// TODO(#161): Split scheduler telemetry/statistics helpers into a dedicated
// module so scheduler.rs owns state transitions and packet cadence only.
// https://github.com/brandon-fryslie/oscilla-animator-v2/issues/161

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

pub struct WorkerScheduler {
    state: SchedulerState,
    frame_count: u64,
    loop_count: u64,
    timing_window_sum_ms: f64,
    timing_window_sum_sq_ms: f64,
    timing_window_samples: u32,
    mean_tick_ms: f64,
    std_dev_tick_ms: f64,
    sample_count: u32,
    last_tick_ms: f64,
    last_success_ms: f64,
    last_heartbeat_ms: f64,
    heartbeat_sequence: u64,
    pending_events: VecDeque<RuntimeEvent>,
    latest_telemetry: SchedulerTelemetry,
}

impl WorkerScheduler {
    pub fn new(now_ms: f64) -> Self {
        Self {
            state: SchedulerState::Booting,
            frame_count: 0,
            loop_count: 0,
            timing_window_sum_ms: 0.0,
            timing_window_sum_sq_ms: 0.0,
            timing_window_samples: 0,
            mean_tick_ms: 0.0,
            std_dev_tick_ms: 0.0,
            sample_count: 0,
            last_tick_ms: now_ms.max(0.0),
            last_success_ms: now_ms.max(0.0),
            // [LAW:single-enforcer] Heartbeat cadence is owned by scheduler state,
            // so callers never invent independent telemetry clocks.
            last_heartbeat_ms: now_ms.max(0.0) - HEARTBEAT_INTERVAL_MS,
            heartbeat_sequence: 0,
            pending_events: VecDeque::with_capacity(MAX_PENDING_EVENTS),
            latest_telemetry: SchedulerTelemetry::default(),
        }
    }

    pub fn state(&self) -> SchedulerState {
        self.state
    }

    pub fn begin_loop_iteration(&mut self, now_ms: f64) {
        self.loop_count = self.loop_count.wrapping_add(1);
        self.last_tick_ms = now_ms.max(0.0);
    }

    pub fn mark_paused(&mut self, now_ms: f64) {
        self.state = SchedulerState::Paused;
        self.last_tick_ms = now_ms.max(0.0);
    }

    pub fn mark_running(&mut self, now_ms: f64) {
        self.state = SchedulerState::Running;
        self.last_tick_ms = now_ms.max(0.0);
    }

    pub fn record_paused_tick(
        &mut self,
        now_ms: f64,
        tick_elapsed_ms: f64,
        telemetry: SchedulerTelemetry,
    ) {
        self.state = SchedulerState::Paused;
        self.record_tick_timing(now_ms, tick_elapsed_ms, telemetry);
    }

    pub fn record_tick_success(
        &mut self,
        now_ms: f64,
        tick_elapsed_ms: f64,
        frame_count: u64,
        telemetry: SchedulerTelemetry,
    ) {
        self.state = SchedulerState::Running;
        self.frame_count = frame_count;
        self.last_success_ms = now_ms.max(0.0);
        self.record_tick_timing(now_ms, tick_elapsed_ms, telemetry);
    }

    pub fn record_surface_timeout(
        &mut self,
        now_ms: f64,
        tick_elapsed_ms: f64,
        telemetry: SchedulerTelemetry,
    ) {
        if self.state == SchedulerState::Booting {
            self.state = SchedulerState::Running;
        }
        self.record_tick_timing(now_ms, tick_elapsed_ms, telemetry);
    }

    pub fn record_surface_lost(
        &mut self,
        now_ms: f64,
        tick_elapsed_ms: f64,
        message: &'static str,
        telemetry: SchedulerTelemetry,
    ) {
        self.state = SchedulerState::Lost;
        self.record_tick_timing(now_ms, tick_elapsed_ms, telemetry);
        self.push_event(
            RuntimeEventSeverity::Error,
            "surface_lost",
            "swap",
            message,
            now_ms,
        );
    }

    pub fn record_fatal(
        &mut self,
        now_ms: f64,
        tick_elapsed_ms: f64,
        code: &'static str,
        message: &'static str,
        stage: &'static str,
        telemetry: SchedulerTelemetry,
    ) {
        self.state = SchedulerState::Lost;
        self.record_tick_timing(now_ms, tick_elapsed_ms, telemetry);
        self.push_event(RuntimeEventSeverity::Fatal, code, stage, message, now_ms);
    }

    pub fn take_observability_packet(&mut self, now_ms: f64) -> Option<WorkerObservabilityPacket> {
        let normalized_now = now_ms.max(0.0);
        let should_emit_heartbeat = self.heartbeat_sequence == 0
            || (normalized_now - self.last_heartbeat_ms) >= HEARTBEAT_INTERVAL_MS
            || !self.pending_events.is_empty();
        if !should_emit_heartbeat {
            return None;
        }
        self.heartbeat_sequence = self.heartbeat_sequence.wrapping_add(1);
        self.last_heartbeat_ms = normalized_now;
        let heartbeat = SchedulerHeartbeat {
            sequence: self.heartbeat_sequence,
            state: self.state,
            emitted_at_ms: normalized_now,
            frame_count: self.frame_count,
            loop_count: self.loop_count,
            mean_tick_ms: self.mean_tick_ms,
            std_dev_tick_ms: self.std_dev_tick_ms,
            sample_count: self.sample_count,
            last_tick_ms: self.last_tick_ms,
            last_success_ms: self.last_success_ms,
            telemetry: self.latest_telemetry,
        };
        Some(WorkerObservabilityPacket {
            state: self.state,
            heartbeat,
            events: std::mem::take(&mut self.pending_events)
                .into_iter()
                .collect(),
        })
    }

    fn record_tick_timing(
        &mut self,
        now_ms: f64,
        tick_elapsed_ms: f64,
        telemetry: SchedulerTelemetry,
    ) {
        // TODO(#161): Extract timing-window aggregation into dedicated telemetry
        // helper module to reduce scheduler centrality and hot-path coupling.
        // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/161
        let elapsed = tick_elapsed_ms.max(0.0);
        self.last_tick_ms = now_ms.max(0.0);
        let mut next_telemetry = telemetry;
        // [LAW:one-source-of-truth] The scheduler is the canonical owner of
        // final total-frame timing in heartbeat telemetry.
        next_telemetry.stage_timings.total_frame_ms = elapsed;
        self.latest_telemetry = next_telemetry;
        self.timing_window_sum_ms += elapsed;
        self.timing_window_sum_sq_ms += elapsed * elapsed;
        self.timing_window_samples = self.timing_window_samples.saturating_add(1);
        if self.timing_window_samples < TIMING_WINDOW_SAMPLES {
            return;
        }
        let sample_count = self.timing_window_samples.max(1);
        let sample_count_f = sample_count as f64;
        let mean = self.timing_window_sum_ms / sample_count_f;
        let variance = (self.timing_window_sum_sq_ms / sample_count_f) - (mean * mean);
        self.mean_tick_ms = mean;
        self.std_dev_tick_ms = variance.max(0.0).sqrt();
        self.sample_count = sample_count;
        self.timing_window_sum_ms = 0.0;
        self.timing_window_sum_sq_ms = 0.0;
        self.timing_window_samples = 0;
    }

    fn push_event(
        &mut self,
        severity: RuntimeEventSeverity,
        code: &'static str,
        stage: &'static str,
        message: &'static str,
        now_ms: f64,
    ) {
        // [LAW:no-shared-mutable-globals] Runtime event buffering is owned by a
        // single scheduler instance and exposed only via explicit drain APIs.
        if self.pending_events.len() >= MAX_PENDING_EVENTS {
            self.pending_events.pop_front();
        }
        self.pending_events.push_back(RuntimeEvent {
            severity,
            code,
            stage,
            message: message.to_string(),
            state: self.state,
            frame_count: self.frame_count,
            loop_count: self.loop_count,
            emitted_at_ms: now_ms.max(0.0),
        });
    }
}
