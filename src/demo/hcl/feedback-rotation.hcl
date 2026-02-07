# Feedback Rotation
#
# UnitDelay showcase demo demonstrating feedback-driven animation.
# Uses UnitDelay to implement a phase accumulator with variable speed.
# The rotation speed oscillates between fast and slow, creating dynamic
# acceleration and deceleration.
#
# This pattern is IMPOSSIBLE without UnitDelay because:
#   phase[t] = phase[t-1] + delta
# creates a dependency cycle. UnitDelay breaks the cycle by providing
# the previous frame's value, enabling feedback loops.
#
# The demo shows two rings:
# - Inner ring: Direct time-driven rotation (constant speed)
# - Outer ring: Feedback-driven rotation (variable speed via accumulator)
#
# Watch how the outer ring accelerates and decelerates while the inner
# ring maintains constant speed - the visual difference shows the power
# of stateful feedback.
# Demonstrates: UnitDelay, feedback loops, Modulo wrap, phase accumulation.

patch "Feedback Rotation" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 8000
    role = "timeRoot"
    outputs {
      phaseA = speed-osc.phase
      phaseB = outer-layout.phase
    }
  }

  # ===========================================================================
  # FEEDBACK ACCUMULATOR (the core UnitDelay pattern)
  # ===========================================================================
  #
  # This implements: phase[t] = (phase[t-1] + delta) mod 1
  #
  # The delta varies with time, creating acceleration/deceleration.
  # Without UnitDelay, this feedback loop would be impossible.

  # Speed modulation: oscillates between 0.005 and 0.025 per frame
  # This creates the "breathing" rotation effect
  block "Const" "speed-base" {
    value = 0.015
    outputs {
      out = speed-delta.a
    }
  }

  block "Const" "speed-amp" {
    value = 0.01
    outputs {
      out = speed-modulation.b
    }
  }

  block "Oscillator" "speed-osc" {
    outputs {
      out = speed-modulation.a
    }
  }

  block "Multiply" "speed-modulation" {
    outputs {
      out = speed-delta.b
    }
  }

  block "Add" "speed-delta" {
    outputs {
      out = phase-add.b
    }
  }

  # The feedback loop using UnitDelay
  # accumulatedPhase = UnitDelay(accumulatedPhase + speedDelta)
  block "UnitDelay" "phase-delay" {
    initialValue = 0
    outputs {
      out = phase-add.a
    }
  }

  block "Add" "phase-add" {
    outputs {
      out = phase-wrap.a
    }
  }

  block "Const" "phase-wrap-divisor" {
    value = 1.0
    outputs {
      out = phase-wrap.b
    }
  }

  block "Modulo" "phase-wrap" {
    outputs {
      out = phase-delay.in
    }
  }

  # ===========================================================================
  # OUTER RING: Feedback-driven rotation (variable speed)
  # ===========================================================================

  block "Ellipse" "outer-dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = outer-instances.element
    }
  }

  block "Array" "outer-instances" {
    count = 24
    outputs {
      elements = outer-layout.elements
    }
  }

  # Use CircleLayoutUV for outer ring with slow rotation from phaseB
  block "CircleLayoutUV" "outer-layout" {
    radius = 0.35
    outputs {
      position = render-outer.pos
    }
  }

  # Simple constant color - cyan
  block "Const" "outer-color" {
    value = { r = 0.3, g = 0.9, b = 0.9, a = 1.0 }
    outputs {
      out = render-outer.color
    }
  }

  # ===========================================================================
  # INNER RING: Direct time-driven rotation (constant speed for comparison)
  # ===========================================================================

  block "Ellipse" "inner-dot" {
    rx = 0.015
    ry = 0.015
    outputs {
      shape = inner-instances.element
    }
  }

  block "Array" "inner-instances" {
    count = 16
    outputs {
      elements = inner-layout.elements
    }
  }

  # Use CircleLayoutUV for inner ring
  block "CircleLayoutUV" "inner-layout" {
    radius = 0.18
    outputs {
      position = render-inner.pos
    }
  }

  # Simple constant color - orange
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
