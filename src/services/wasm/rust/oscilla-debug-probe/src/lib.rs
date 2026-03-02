use std::cell::RefCell;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID: u16 = 1 << 2;
const DEBUG_PACKET_FLAG_NAN_DETECTED_ANY: u16 = 1 << 3;

const DEBUG_SAMPLE_FLAG_FRESH: u16 = 1 << 0;
const DEBUG_SAMPLE_FLAG_NAN_DETECTED: u16 = 1 << 3;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum DebugProbeSampleKind {
    Scalar,
    LaneWindow,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbeLaneWindow {
    start: u32,
    count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbeSubscription {
    target_id: u32,
    slot_id: u32,
    sample_kind: DebugProbeSampleKind,
    lane_window: Option<DebugProbeLaneWindow>,
    #[serde(default = "default_component_mask")]
    component_mask: u32,
    #[serde(default)]
    priority: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeArenaDescriptor {
    offset: usize,
    stride: u16,
    lane_count: u32,
    length: usize,
    component_offsets: Option<Vec<usize>>,
    packing: Option<String>,
    lane_stride: Option<usize>,
    component_stride: Option<usize>,
}

fn default_component_mask() -> u32 {
    u32::MAX
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbeRuntimeSlotSnapshot {
    slot_id: u32,
    descriptor: RuntimeArenaDescriptor,
    values: Vec<f32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbeRuntimeSnapshot {
    runtime_frame_id: u32,
    slots: Vec<DebugProbeRuntimeSlotSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DebugProbePacketSample {
    target_id: u32,
    slot_id: u32,
    payload_kind: DebugProbeSampleKind,
    stride: u8,
    lane_count: u32,
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
    SetRateHz {
        #[serde(rename = "rateHz")]
        rate_hz: u32,
    },
}

#[derive(Debug, Clone, Copy)]
struct ArenaAddress {
    base_offset: usize,
    lane_stride: usize,
    component_stride: usize,
    stride: usize,
    lane_count: usize,
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

    fn build_packet_from_snapshot(
        &mut self,
        captured_at_ms: f64,
        snapshot: DebugProbeRuntimeSnapshot,
    ) -> Option<DebugProbePacket> {
        if self.subscriptions.is_empty() {
            return None;
        }

        let slot_by_id: HashMap<u32, DebugProbeRuntimeSlotSnapshot> = snapshot
            .slots
            .into_iter()
            .map(|slot| (slot.slot_id, slot))
            .collect();

        let mut packet_flags = 0u16;
        let mut packet_samples: Vec<DebugProbePacketSample> =
            Vec::with_capacity(self.subscriptions.len());

        // [LAW:dataflow-not-control-flow] Poll always walks the configured
        // subscriptions in one order; sample validity/freshness flows through
        // flags instead of branching the pipeline itself.
        for sub in &self.subscriptions {
            let Some(slot) = slot_by_id.get(&sub.slot_id) else {
                packet_flags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
                continue;
            };

            let Some(mut sample) = build_packet_sample(sub, slot) else {
                packet_flags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
                continue;
            };

            if sample.values.iter().any(|value| !value.is_finite()) {
                packet_flags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
                sample.sample_flags = DEBUG_SAMPLE_FLAG_NAN_DETECTED;
            }

            packet_samples.push(sample);
        }

        if packet_samples.is_empty() {
            return None;
        }

        self.sequence = self.sequence.saturating_add(1);

        Some(DebugProbePacket {
            version: 1,
            sequence: self.sequence,
            captured_at_ms,
            runtime_frame_id: snapshot.runtime_frame_id,
            sample_count: packet_samples.len() as u16,
            packet_flags,
            samples: packet_samples,
        })
    }
}

fn resolve_arena_address(desc: &RuntimeArenaDescriptor) -> ArenaAddress {
    let packing = desc.packing.as_deref().unwrap_or("soa");
    let lane_count = desc.lane_count as usize;
    let stride = desc.stride as usize;
    let lane_stride = desc
        .lane_stride
        .unwrap_or(if packing == "soa" { 1 } else { stride });
    let component_stride = desc
        .component_stride
        .unwrap_or(if packing == "soa" { lane_count } else { 1 });

    ArenaAddress {
        base_offset: desc.offset,
        lane_stride,
        component_stride,
        stride,
        lane_count,
    }
}

fn arena_index(desc: &RuntimeArenaDescriptor, lane: usize, component: usize) -> Option<usize> {
    let address = resolve_arena_address(desc);
    if lane >= address.lane_count {
        return None;
    }
    if let Some(component_offsets) = &desc.component_offsets {
        if component < component_offsets.len() {
            return Some(desc.offset + component_offsets[component] + lane * address.lane_stride);
        }
    }

    if component >= address.stride {
        return None;
    }

    Some(address.base_offset + component * address.component_stride + lane * address.lane_stride)
}

fn selected_component_indices(stride: usize, component_mask: u32) -> Option<Vec<usize>> {
    if stride < 1 || stride > 32 {
        return None;
    }
    let mut selected = Vec::new();
    for component in 0..stride {
        if (component_mask & (1u32 << component)) != 0 {
            selected.push(component);
        }
    }
    if selected.is_empty() {
        return None;
    }
    Some(selected)
}

fn read_scalar_values(
    slot: &DebugProbeRuntimeSlotSnapshot,
    component_mask: u32,
) -> Option<(u8, u32, Vec<f64>)> {
    let desc = &slot.descriptor;
    if desc.lane_count != 1 || desc.stride < 1 {
        return None;
    }
    let selected = selected_component_indices(desc.stride as usize, component_mask)?;
    if selected.len() != 1 {
        return None;
    }
    let index = arena_index(desc, 0, selected[0])?;
    let value = *slot.values.get(index)? as f64;
    Some((1, 1, vec![value]))
}

fn read_lane_window_values(
    slot: &DebugProbeRuntimeSlotSnapshot,
    lane_window: Option<&DebugProbeLaneWindow>,
    component_mask: u32,
) -> Option<(u8, u32, Vec<f64>)> {
    let desc = &slot.descriptor;
    if desc.stride < 1 {
        return None;
    }
    let selected_components = selected_component_indices(desc.stride as usize, component_mask)?;
    let output_stride = u8::try_from(selected_components.len()).ok()?;

    let lane_start = lane_window.map(|window| window.start as usize).unwrap_or(0);
    let lane_count = lane_window
        .map(|window| window.count as usize)
        .unwrap_or(desc.lane_count as usize);
    let total_lane_count = desc.lane_count as usize;
    if lane_count < 1 || lane_start.checked_add(lane_count)? > total_lane_count {
        return None;
    }

    let mut values = Vec::with_capacity(lane_count * selected_components.len());
    for lane in lane_start..(lane_start + lane_count) {
        for component in &selected_components {
            let index = arena_index(desc, lane, *component)?;
            let value = *slot.values.get(index)? as f64;
            values.push(value);
        }
    }

    Some((output_stride, lane_count as u32, values))
}

fn build_packet_sample(
    sub: &DebugProbeSubscription,
    slot: &DebugProbeRuntimeSlotSnapshot,
) -> Option<DebugProbePacketSample> {
    if slot.values.len() != slot.descriptor.length {
        return None;
    }

    let _priority = sub.priority;
    let (stride, lane_count, values) = match sub.sample_kind {
        DebugProbeSampleKind::Scalar => read_scalar_values(slot, sub.component_mask)?,
        DebugProbeSampleKind::LaneWindow => {
            read_lane_window_values(slot, sub.lane_window.as_ref(), sub.component_mask)?
        }
    };

    Some(DebugProbePacketSample {
        target_id: sub.target_id,
        slot_id: sub.slot_id,
        payload_kind: sub.sample_kind.clone(),
        stride,
        lane_count,
        sample_flags: DEBUG_SAMPLE_FLAG_FRESH,
        values,
    })
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
pub fn debug_poll_runtime_packet(captured_at_ms: f64, snapshot: JsValue) -> Result<JsValue, JsValue> {
    let parsed_snapshot: DebugProbeRuntimeSnapshot = serde_wasm_bindgen::from_value(snapshot)
        .map_err(|err| js_error(format!("debug_poll_runtime_packet decode failed: {err}")))?;

    let packet = ENGINE.with(|engine| {
        engine
            .borrow_mut()
            .build_packet_from_snapshot(captured_at_ms, parsed_snapshot)
    });

    serde_wasm_bindgen::to_value(&packet)
        .map_err(|err| js_error(format!("debug_poll_runtime_packet encode failed: {err}")))
}
