# Breathing Ring
#
# A ring of circles that pulses in size using a sine wave.
# Demonstrates: oscillator → math → render scale, named blocks for clarity.

patch "Breathing Ring" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2000
    periodBMs = 10000
    role = "timeRoot"
  }

  # Shape and instances
  block "Ellipse" "dot" {
    rx = 0.03
    ry = 0.03
  }

  block "Array" "instances" {
    count = 20
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.3
  }

  # Breathing animation: scale oscillates between 0.5 and 1.5
  block "Oscillator" "breath" {}

  block "Const" "half" {
    value = 0.5
  }

  block "Const" "one" {
    value = 1
  }

  block "Multiply" "breath-scaled" {}
  block "Add" "breath-offset" {}

  # Color: warm pink
  block "Const" "color" {
    value = { r = 1, g = 0.4, b = 0.6, a = 1 }
  }

  block "RenderInstances2D" "render" {}

  # Wiring: shape → array → layout → render
  connect {
    from = dot.shape
    to = instances.element
  }

  connect {
    from = instances.elements
    to = ring.elements
  }

  connect {
    from = ring.position
    to = render.pos
  }

  connect {
    from = color.out
    to = render.color
  }

  connect {
    from = dot.shape
    to = render.shape
  }

  # Wiring: oscillator → scale math → render scale
  connect {
    from = clock.phaseA
    to = breath.phase
  }

  connect {
    from = breath.out
    to = breath-scaled.a
  }

  connect {
    from = half.out
    to = breath-scaled.b
  }

  connect {
    from = one.out
    to = breath-offset.a
  }

  connect {
    from = breath-scaled.out
    to = breath-offset.b
  }

  connect {
    from = breath-offset.out
    to = render.scale
  }
}
