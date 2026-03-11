# Feedback Accumulator
#
# A ring of dots whose rotation speed modulates over time.
# Smoothstep eases the speed oscillator for snappy acceleration.
# Per-element rainbow color differentiates from other feedback demos.
#
# Demonstrates: UnitDelay, Smoothstep easing, feedback-driven phase, per-element color.

patch "Feedback Accumulator" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    role = "timeRoot"
    outputs {
      phaseA = speed-lfo.phase
    }
  }

  # --- Speed modulation with Smoothstep easing ---

  block "Const" "base-speed" {
    value = 0.01
    outputs {
      out = delta.a
    }
  }

  block "Const" "speed-swing" {
    value = 0.008
    outputs {
      out = speed-scaled.b
    }
  }

  block "Oscillator" "speed-lfo" {
    outputs {
      out = speed-ease.in
    }
  }

  # Smoothstep on oscillator: S-curve easing for snappy accel/decel
  block "Smoothstep" "speed-ease" {
    outputs {
      out = speed-scaled.a
    }
  }

  block "Multiply" "speed-scaled" {
    outputs {
      out = delta.b
    }
  }

  block "Add" "delta" {
    outputs {
      out = accumulate.b
    }
  }

  # --- Feedback loop: phase[t] = (phase[t-1] + delta) mod 1 ---

  block "UnitDelay" "prev-phase" {
    initialValue = 0
    outputs {
      out = accumulate.a
    }
  }

  block "Add" "accumulate" {
    outputs {
      out = wrap.a
    }
  }

  block "Const" "wrap-at" {
    value = 1
    outputs {
      out = wrap.b
    }
  }

  block "Modulo" "wrap" {
    outputs {
      out = [prev-phase.in, feedback-phase.in]
    }
  }

  block "Adapter_ScalarToPhase01" "feedback-phase" {
    outputs {
      out = [ring.phase, hue-shift.b]
    }
  }

  # --- Visuals: ring of 24 circles with per-element rainbow ---

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 24
    outputs {
      elements = ring.elements
      t = hue-shift.a
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.3
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
