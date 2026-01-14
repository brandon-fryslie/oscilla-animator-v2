/**
 * Socket Type System for Rete.js
 *
 * Maps Oscilla SignalTypes to Rete sockets with compatibility rules:
 * - Signal → Signal (same payload): COMPATIBLE
 * - Signal → Field (same payload): COMPATIBLE (broadcast)
 * - Field → Signal: INCOMPATIBLE
 * - Field → Field (same payload): COMPATIBLE
 */

import { ClassicPreset } from 'rete';
import type { SignalType } from '../../core/canonical-types';
import { resolveExtent, DEFAULTS_V0 } from '../../core/canonical-types';

/**
 * OscillaSocket - Custom socket class with type compatibility rules
 */
export class OscillaSocket extends ClassicPreset.Socket {
  constructor(
    name: string,
    public readonly cardinality: 'signal' | 'field',
    public readonly payloadType: string
  ) {
    super(name);
  }

  /**
   * Determines if this socket can connect to another socket.
   * Called by Rete when dragging connections.
   */
  isCompatibleWith(socket: ClassicPreset.Socket): boolean {
    if (!(socket instanceof OscillaSocket)) return false;

    // Same cardinality and payload → compatible
    if (
      this.cardinality === socket.cardinality &&
      this.payloadType === socket.payloadType
    ) {
      return true;
    }

    // Signal → Field broadcast (same payload)
    // This socket is signal, target is field
    if (
      this.cardinality === 'signal' &&
      socket.cardinality === 'field' &&
      this.payloadType === socket.payloadType
    ) {
      return true;
    }

    // Field → Signal: INCOMPATIBLE
    // Field → Field (different payload): INCOMPATIBLE
    return false;
  }
}

/**
 * Singleton socket instances.
 * IMPORTANT: Use these instances, not new instances per node.
 */
export const Sockets = {
  signal_float: new OscillaSocket('Signal<float>', 'signal', 'float'),
  signal_int: new OscillaSocket('Signal<int>', 'signal', 'int'),
  signal_phase: new OscillaSocket('Signal<phase>', 'signal', 'phase'),
  signal_vec2: new OscillaSocket('Signal<vec2>', 'signal', 'vec2'),
  signal_bool: new OscillaSocket('Signal<bool>', 'signal', 'bool'),
  field_float: new OscillaSocket('Field<float>', 'field', 'float'),
  field_int: new OscillaSocket('Field<int>', 'field', 'int'),
  field_vec2: new OscillaSocket('Field<vec2>', 'field', 'vec2'),
  field_phase: new OscillaSocket('Field<phase>', 'field', 'phase'),
  field_bool: new OscillaSocket('Field<bool>', 'field', 'bool'),
};

/**
 * Map from SignalType to Socket instance.
 * Returns the appropriate singleton socket for a given signal type.
 */
export function getSocketForSignalType(signalType: SignalType): OscillaSocket {
  // Resolve extent to get concrete cardinality
  const resolved = resolveExtent(signalType.extent);
  const { payload } = signalType;

  // Special case: zero cardinality (compile-time constant, no ports)
  if (resolved.cardinality.kind === 'zero') {
    // Should not have ports for zero cardinality
    return Sockets.signal_float; // fallback
  }

  // Map cardinality.kind to our socket cardinality
  let socketCardinality: 'signal' | 'field';
  if (resolved.cardinality.kind === 'one') {
    socketCardinality = 'signal';
  } else if (resolved.cardinality.kind === 'many') {
    socketCardinality = 'field';
  } else {
    // Unknown cardinality
    socketCardinality = 'signal';
  }

  // Build key and lookup
  const key = `${socketCardinality}_${payload}` as keyof typeof Sockets;
  return Sockets[key] ?? Sockets.signal_float; // fallback
}
