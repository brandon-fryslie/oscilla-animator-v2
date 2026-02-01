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
  }

  # --- Speed modulation: oscillating delta ---

  block "Const" "base-speed" {
    value = 0.01
  }

  block "Const" "speed-swing" {
    value = 0.008
  }

  block "Oscillator" "speed-lfo" {}

  block "Multiply" "speed-variation" {}
  block "Add" "delta" {}

  connect {
    from = clock.phaseA
    to = speed-lfo.phase
  }

  connect {
    from = speed-lfo.out
    to = speed-variation.a
  }

  connect {
    from = speed-swing.out
    to = speed-variation.b
  }

  connect {
    from = base-speed.out
    to = delta.a
  }

  connect {
    from = speed-variation.out
    to = delta.b
  }

  # --- Feedback loop: phase[t] = (phase[t-1] + delta) mod 1 ---

  block "UnitDelay" "prev-phase" {
    initialValue = 0
  }

  block "Add" "accumulate" {}

  block "Const" "wrap-at" {
    value = 1
  }

  block "Modulo" "wrap" {}

  connect {
    from = prev-phase.out
    to = accumulate.a
  }

  connect {
    from = delta.out
    to = accumulate.b
  }

  connect {
    from = accumulate.out
    to = wrap.a
  }

  connect {
    from = wrap-at.out
    to = wrap.b
  }

  # The feedback edge: output feeds back to input via one-frame delay
  connect {
    from = wrap.out
    to = prev-phase.in
  }

  # --- Visuals: ring of 24 circles ---

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
  }

  block "Array" "instances" {
    count = 24
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.3
  }

  block "Const" "color" {
    value = { r = 0.2, g = 0.9, b = 0.8, a = 1 }
  }

  block "RenderInstances2D" "render" {}

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
}
