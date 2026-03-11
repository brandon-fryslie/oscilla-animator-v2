# Feedback Simple
#
# Demonstrates feedback-driven rotation with VARIABLE SPEED.
# The rotation accelerates and decelerates - impossible without feedback!
#
# Two rings with per-element rainbow color:
# - OUTER (32 dots): Feedback-driven - speeds up and slows down
# - INNER (12 dots): Time-driven - constant speed
#
# Demonstrates: UnitDelay feedback loop, Modulo wrap, per-element rainbow.

patch "Feedback Simple" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 3000
    role = "timeRoot"
    outputs {
      phaseA = speed-osc.phase
      phaseB = inner-layout.phase
    }
  }

  # ===========================================================================
  # FEEDBACK ACCUMULATOR WITH VARIABLE SPEED
  # ===========================================================================

  block "Const" "one" {
    value = 1.0
    outputs {
      out = wrap.b
    }
  }

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
      out = [prev-phase.in, feedback-phase.in]
    }
  }

  block "Adapter_ScalarToPhase01" "feedback-phase" {
    outputs {
      out = outer-layout.phase
    }
  }

  # ===========================================================================
  # OUTER RING: Feedback-driven (variable speed), 32 dots, rainbow
  # ===========================================================================

  block "Ellipse" "outer-dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = outer-instances.element
    }
  }

  block "Array" "outer-instances" {
    count = 32
    outputs {
      elements = outer-layout.elements
      t = outer-color.h
    }
  }

  block "CircleLayoutUV" "outer-layout" {
    radius = 0.35
    outputs {
      controlPoints = render-outer.controlPoints
    }
  }

  block "MakeColorOKLCH" "outer-color" {
    outputs {
      color = render-outer.color
    }
  }

  # ===========================================================================
  # INNER RING: Time-driven (constant speed), 12 dots, rainbow
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
      t = inner-color.h
    }
  }

  block "CircleLayoutUV" "inner-layout" {
    radius = 0.18
    outputs {
      controlPoints = render-inner.controlPoints
    }
  }

  block "MakeColorOKLCH" "inner-color" {
    outputs {
      color = render-inner.color
    }
  }

  # ===========================================================================
  # RENDER BOTH RINGS
  # ===========================================================================

  block "RenderInstances2D" "render-outer" {}

  block "RenderInstances2D" "render-inner" {}
}
