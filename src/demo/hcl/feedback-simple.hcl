# Feedback Simple
#
# Demonstrates feedback-driven rotation with VARIABLE SPEED.
# The rotation accelerates and decelerates - impossible without feedback!
#
# Two rings for comparison:
# - OUTER (cyan): Feedback-driven - speeds up and slows down
# - INNER (orange): Time-driven - constant speed
#
# Watch the outer ring "breathe" while the inner ring stays steady.
# Demonstrates: UnitDelay feedback loop, Modulo wrap, variable-rate accumulation.

patch "Feedback Simple" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = speed-osc.phase
      phaseB = outer-layout.phase
    }
  }

  # ===========================================================================
  # FEEDBACK ACCUMULATOR WITH VARIABLE SPEED
  # ===========================================================================
  # phase[t] = (phase[t-1] + delta) mod 1
  # delta oscillates between 0.002 and 0.018 (9x speed variation!)

  block "Const" "one" {
    value = 1.0
    outputs {
      out = wrap.b
    }
  }

  # Speed modulation: base + amplitude * sin(time)
  block "Const" "speed-base" {
    value = 0.01
    outputs {
      out = delta.a
    }
  }

  block "Const" "speed-amplitude" {
    value = 0.008
    outputs {
      out = speed-variation.b
    }
  }

  block "Oscillator" "speed-osc" {
    mode = 0
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

  # The feedback loop
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

  block "Modulo" "wrap" {
    outputs {
      out = prev-phase.in
    }
  }

  # ===========================================================================
  # OUTER RING: Feedback-driven (variable speed)
  # ===========================================================================

  block "Ellipse" "outer-dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = outer-instances.element
    }
  }

  block "Array" "outer-instances" {
    count = 16
    outputs {
      elements = outer-layout.elements
    }
  }

  # Use CircleLayoutUV with slow rotation from phaseB
  block "CircleLayoutUV" "outer-layout" {
    radius = 0.35
    outputs {
      position = render-outer.pos
    }
  }

  # Color: cyan
  block "Const" "outer-color" {
    value = { r = 0.3, g = 0.9, b = 0.9, a = 1.0 }
    outputs {
      out = render-outer.color
    }
  }

  # ===========================================================================
  # INNER RING: Time-driven (constant speed) - for comparison
  # ===========================================================================

  block "Ellipse" "inner-dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = inner-instances.element
    }
  }

  block "Array" "inner-instances" {
    count = 12
    outputs {
      elements = inner-layout.elements
    }
  }

  # Use CircleLayoutUV
  block "CircleLayoutUV" "inner-layout" {
    radius = 0.18
    outputs {
      position = render-inner.pos
    }
  }

  # Color: orange
  block "Const" "inner-color" {
    value = { r = 1.0, g = 0.6, b = 0.3, a = 1.0 }
    outputs {
      out = render-inner.color
    }
  }

  # ===========================================================================
  # RENDER BOTH RINGS
  # ===========================================================================

  block "RenderInstances2D" "render-outer" {}

  block "RenderInstances2D" "render-inner" {}
}
