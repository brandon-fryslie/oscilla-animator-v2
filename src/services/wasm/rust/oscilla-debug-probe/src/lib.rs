use std::cell::RefCell;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID: u16 = 1 << 2;
const DEBUG_PACKET_FLAG_NAN_DETECTED_ANY: u16 = 1 << 3;

const DEBUG_SAMPLE_FLAG_FRESH: u16 = 1 << 0;
const DEBUG_SAMPLE_FLAG_NAN_DETECTED: u16 = 1 << 3;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbeSubscription {
    target_id: u32,
    slot_id: u32,
    sample_kind: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbeInputSample {
    target_id: u32,
    slot_id: u32,
    payload_kind: String,
    stride: u8,
    lane_count: u16,
    valid: bool,
    finite: bool,
    values: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbePacketSample {
    target_id: u32,
    slot_id: u32,
    payload_kind: &'static str,
    stride: u8,
    lane_count: u16,
    sample_flags: u16,
    values: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbePacket {
    version: u16,
    sequence: u32,
    captured_at_ms: f64,
    runtime_frame_id: u32,
    sample_count: u16,
    packet_flags: u16,
    samples: Vec<DebugProbePacketSample>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum DebugProbeCommand {
    SetSubscriptions { subscriptions: Vec<DebugProbeSubscription> },
    ClearSubscriptions,
    SetRateHz { rate_hz: u32 },
}

#[derive(Default)]
struct DebugProbeEngine {
    sequence: u32,
    rate_hz: u32,
    subscriptions: Vec<DebugProbeSubscription>,
}

impl DebugProbeEngine {
    fn apply_command(&mut self, command: DebugProbeCommand) {
        match command {
            DebugProbeCommand::SetSubscriptions { subscriptions } => {
                self.subscriptions = subscriptions;
            }
            DebugProbeCommand::ClearSubscriptions => {
                self.subscriptions.clear();
            }
            DebugProbeCommand::SetRateHz { rate_hz } => {
                // [LAW:no-mode-explosion] Keep one canonical cadence knob in one place.
                self.rate_hz = rate_hz.max(1);
            }
        }
    }

    fn build_packet(
        &mut self,
        captured_at_ms: f64,
        runtime_frame_id: u32,
        samples: Vec<DebugProbeInputSample>,
    ) -> Option<DebugProbePacket> {
        if self.subscriptions.is_empty() {
            return None;
        }

        let sample_by_slot: HashMap<u32, DebugProbeInputSample> = samples
            .into_iter()
            .map(|sample| (sample.slot_id, sample))
            .collect();

        let mut packet_flags = 0u16;
        let mut packet_samples: Vec<DebugProbePacketSample> = Vec::with_capacity(self.subscriptions.len());

        // [LAW:dataflow-not-control-flow] Poll always walks the subscription set in one order;
        // variability is encoded in validity/freshness flags.
        for sub in &self.subscriptions {
            if sub.sample_kind != "scalar" {
                packet_flags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
                continue;
            }
            let Some(sample) = sample_by_slot.get(&sub.slot_id) else {
                packet_flags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
                continue;
            };
            if !sample.valid || sample.slot_id != sub.slot_id || sample.target_id != sub.target_id {
                packet_flags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
                continue;
            }
            if sample.payload_kind != sub.sample_kind {
                packet_flags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
                continue;
            }

            let mut sample_flags = DEBUG_SAMPLE_FLAG_FRESH;
            if !sample.finite {
                packet_flags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
                sample_flags = DEBUG_SAMPLE_FLAG_NAN_DETECTED;
            }

            packet_samples.push(DebugProbePacketSample {
                target_id: sub.target_id,
                slot_id: sub.slot_id,
                payload_kind: if sample.payload_kind == "lane_window" {
                    "lane_window"
                } else {
                    "scalar"
                },
                stride: sample.stride,
                lane_count: sample.lane_count,
                sample_flags,
                values: sample.values.clone(),
            });
        }

        if packet_samples.is_empty() {
            return None;
        }

        self.sequence = self.sequence.saturating_add(1);

        Some(DebugProbePacket {
            version: 1,
            sequence: self.sequence,
            captured_at_ms,
            runtime_frame_id,
            sample_count: packet_samples.len() as u16,
            packet_flags,
            samples: packet_samples,
        })
    }
}

thread_local! {
    static ENGINE: RefCell<DebugProbeEngine> = RefCell::new(DebugProbeEngine {
        sequence: 0,
        rate_hz: 5,
        subscriptions: Vec::new(),
    });
}

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn debug_command(command: JsValue) -> Result<(), JsValue> {
    let parsed: DebugProbeCommand = serde_wasm_bindgen::from_value(command)
        .map_err(|err| js_error(format!("debug_command decode failed: {err}")))?;
    ENGINE.with(|engine| {
        engine.borrow_mut().apply_command(parsed);
    });
    Ok(())
}

#[wasm_bindgen]
pub fn debug_poll_packet(
    captured_at_ms: f64,
    runtime_frame_id: u32,
    samples: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed_samples: Vec<DebugProbeInputSample> = serde_wasm_bindgen::from_value(samples)
        .map_err(|err| js_error(format!("debug_poll_packet decode failed: {err}")))?;

    let packet = ENGINE.with(|engine| {
        engine
            .borrow_mut()
            .build_packet(captured_at_ms, runtime_frame_id, parsed_samples)
    });

    serde_wasm_bindgen::to_value(&packet)
        .map_err(|err| js_error(format!("debug_poll_packet encode failed: {err}")))
}
