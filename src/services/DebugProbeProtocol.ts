import type { ValueSlot } from '../types';

/**
 * Debug probe control command.
 *
 * Maps directly to the Rust/WASM ABI control plane (`debug_command`).
 */
export type DebugProbeCommand =
  | {
    readonly kind: 'set_subscriptions';
    readonly subscriptions: readonly DebugProbeSubscription[];
  }
  | {
    readonly kind: 'clear_subscriptions';
  }
  | {
    readonly kind: 'set_rate_hz';
    readonly rateHz: number;
  };

export type DebugProbeSampleKind = 'scalar' | 'lane_window';

export interface DebugProbeSubscription {
  /** Stable debug target id. For current JS fallback this is slot-backed. */
  readonly targetId: number;
  readonly slotId: ValueSlot;
  readonly sampleKind: DebugProbeSampleKind;
  /** Bitmask of components to sample (LSB => component 0). */
  readonly componentMask: number;
  readonly priority: number;
  readonly laneWindow?: {
    readonly start: number;
    readonly count: number;
  };
}

export interface DebugProbePacket {
  readonly version: number;
  readonly sequence: number;
  readonly capturedAtMs: number;
  readonly runtimeFrameId: number;
  readonly sampleCount: number;
  readonly packetFlags: number;
  readonly samples: readonly DebugProbePacketSample[];
}

export interface DebugProbePacketSample {
  readonly targetId: number;
  readonly slotId: ValueSlot;
  readonly payloadKind: DebugProbeSampleKind;
  readonly stride: number;
  readonly laneCount: number;
  readonly sampleFlags: number;
  readonly values: readonly number[];
}

/** Packet flags (`packet_flags` in ABI). */
export const DEBUG_PACKET_FLAG_STALE = 1 << 0;
export const DEBUG_PACKET_FLAG_BUDGET_CLAMPED = 1 << 1;
export const DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID = 1 << 2;
export const DEBUG_PACKET_FLAG_NAN_DETECTED_ANY = 1 << 3;

/** Sample flags (`sample_flags` in ABI). */
export const DEBUG_SAMPLE_FLAG_FRESH = 1 << 0;
export const DEBUG_SAMPLE_FLAG_DOWNSAMPLED = 1 << 1;
export const DEBUG_SAMPLE_FLAG_PARTIAL_BUDGET = 1 << 2;
export const DEBUG_SAMPLE_FLAG_NAN_DETECTED = 1 << 3;

/**
 * Debug probe transport seam.
 *
 * [LAW:locality-or-seam] RuntimeService depends on this seam so the current JS
 * packet source can be swapped for Rust/WASM without changing UI consumers.
 */
export interface DebugProbeTransport {
  debugCommand(command: DebugProbeCommand): void;
  debugPollPacket(capturedAtMs: number): DebugProbePacket | null;
}
