
20) OpCode taxonomy (sufficiently future-proof)

You want opcodes grouped so Rust/WASM can dispatch efficiently.

export type OpCode =
  // Time
  | { kind: "TimeRoot"; model: TimeModelIR }
  | { kind: "TimeDerive" }

  // Identity / Domain
  | { kind: "DomainN" }
  | { kind: "DomainFromGrid" }
  | { kind: "DomainFromSVG" }

  // Pure math (scalar/signal/field lifted forms exist via TransformChain)
  | { kind: "Add" } | { kind: "Mul" } | { kind: "Clamp" } | { kind: "Ease" }
  | { kind: "Noise" } | { kind: "Sine" } | { kind: "Mix" }
  | { kind: "Vec2" } | { kind: "Vec3" } | { kind: "Color" }

  // State
  | { kind: "Integrate" }
  | { kind: "DelayFrames" }
  | { kind: "DelayMs" }
  | { kind: "SampleHold" }

  // Render
  | { kind: "RenderInstances2D" }
  | { kind: "RenderInstances3D" }
  | { kind: "Compose" }
  | { kind: "PostFX" }

  // IO
  | { kind: "OSCIn" } | { kind: "OSCOut" }
  | { kind: "MIDIIn" } | { kind: "MIDIOut" }

  // Transform opcodes used by adapters/lenses
  | { kind: "BroadcastSignalToField" }
  | { kind: "ReduceFieldToSignal" }
  | { kind: "RemapRange" }
  | { kind: "Quantize" }
  | { kind: "Slew" }
  ;

This is intentionally not “minimal.” It’s shaped for growth and compilation stability.

⸻