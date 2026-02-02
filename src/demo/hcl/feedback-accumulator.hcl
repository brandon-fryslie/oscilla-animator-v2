# Feedback Accumulator
#
# A ring of dots whose rotation speed modulates over time.
# Uses a feedback loop: phase accumulates with variable delta.
#
# The key insight: delta = base_speed + amplitude * sin(time)
# So the ring speeds up and slows down — impossible without feedback.
#
# Demonstrates: UnitDelay feedback loop, Modulo wrap, variable-rate accumulation.

patch "Feedback Accumulator" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 8000
    role = "timeRoot"
    outputs {
      phaseA = speed-lfo.phase
    }
  }

  # --- Speed modulation: oscillating delta ---

  block "Const" "base-speed" {
    value = 0.01
    outputs {
      out = delta.a
    }
  }

  block "Const" "speed-swing" {
    value = 0.008
    outputs {
      out = speed-variation.b
    }
  }

  block "Oscillator" "speed-lfo" {
    outputs {
      out = speed-variation.a
    }
  }

  block "Multiply" "speed-variation" {
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
      out = prev-phase.in
    }
  }

  # --- Visuals: ring of 24 circles ---

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = [instances.element, render.shape]
    }
  }

  block "Array" "instances" {
    count = 24
    outputs {
      elements = ring.elements
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.3
    outputs {
      position = render.pos
    }
  }

  block "Const" "color" {
    value = { r = 0.2, g = 0.9, b = 0.8, a = 1 }
    outputs {
      out = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
