# Breathing Ring
#
# A ring of circles that pulses in size using a sine wave.
# Demonstrates: oscillator → math → render scale, named blocks for clarity.

patch "Breathing Ring" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2000
    periodBMs = 10000
    role = "timeRoot"
    outputs {
      phaseA = breath.phase
    }
  }

  # Shape and instances
  block "Ellipse" "dot" {
    rx = 0.03
    ry = 0.03
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 20
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

  # Breathing animation: scale oscillates between 0.5 and 1.5
  block "Oscillator" "breath" {
    outputs {
      out = breath-scaled.a
    }
  }

  block "Const" "half" {
    value = 0.5
    outputs {
      out = breath-scaled.b
    }
  }

  block "Const" "one" {
    value = 1
    outputs {
      out = breath-offset.a
    }
  }

  block "Multiply" "breath-scaled" {
    outputs {
      out = breath-offset.b
    }
  }

  block "Add" "breath-offset" {
    outputs {
      out = render.scale
    }
  }

  # Color: warm pink
  block "Const" "color" {
    value = { r = 1, g = 0.4, b = 0.6, a = 1 }
    outputs {
      out = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
