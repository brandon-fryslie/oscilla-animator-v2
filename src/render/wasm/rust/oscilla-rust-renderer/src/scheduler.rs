use std::collections::VecDeque;

use crate::telemetry::{
    with_total_frame_timing, RuntimeEvent, RuntimeEventSeverity, SchedulerHeartbeat,
    SchedulerState, SchedulerTelemetry, TickTimingStats, TimingAggregator,
    WorkerObservabilityPacket,
};

const HEARTBEAT_INTERVAL_MS: f64 = 250.0;
const MAX_PENDING_EVENTS: usize = 32;

pub struct WorkerScheduler {
    state: SchedulerState,
    frame_count: u64,
    loop_count: u64,
    timing_aggregator: TimingAggregator,
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
            timing_aggregator: TimingAggregator::default(),
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
        let TickTimingStats {
            mean_tick_ms,
            std_dev_tick_ms,
            sample_count,
        } = self.timing_aggregator.stats();
        let heartbeat = SchedulerHeartbeat {
            sequence: self.heartbeat_sequence,
            state: self.state,
            emitted_at_ms: normalized_now,
            frame_count: self.frame_count,
            loop_count: self.loop_count,
            mean_tick_ms,
            std_dev_tick_ms,
            sample_count,
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
        let elapsed = tick_elapsed_ms.max(0.0);
        self.last_tick_ms = now_ms.max(0.0);
        // [LAW:one-source-of-truth] Scheduler owns final total-frame timing in
        // heartbeat telemetry, so all callers publish partial stage timings only.
        self.latest_telemetry = with_total_frame_timing(telemetry, elapsed);
        self.timing_aggregator.record_sample(elapsed);
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
