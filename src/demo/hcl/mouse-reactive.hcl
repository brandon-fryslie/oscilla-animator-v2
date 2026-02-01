# Mouse Reactive
#
# A ring of circles that responds to mouse input.
# Click to enlarge, move to... well, the mouse position is a signal,
# it doesn't directly move the ring — but it modulates the scale.
#
# Demonstrates: ExternalInput blocks, math chains, interactive patches.

patch "Mouse Reactive" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    periodBMs = 12000
    role = "timeRoot"
  }

  # --- Mouse input ---

  block "ExternalInput" "mouse-x" {
    channel = "mouse.x"
  }

  block "ExternalInput" "click" {
    channel = "mouse.button.left.held"
  }

  # --- Scale: base + click bonus ---
  #   base_scale = 0.8 + 0.4 * mouse_x   (mouse_x is ~0..1)
  #   click_bonus = 0.5 * click_state     (0 or 1)
  #   final_scale = base_scale + click_bonus

  block "Const" "scale-base" {
    value = 0.8
  }

  block "Const" "scale-mouse-range" {
    value = 0.4
  }

  block "Multiply" "mouse-contrib" {}
  block "Add" "base-scale" {}

  block "Const" "click-amount" {
    value = 0.5
  }

  block "Multiply" "click-contrib" {}
  block "Add" "final-scale" {}

  connect {
    from = mouse-x.value
    to = mouse-contrib.a
  }

  connect {
    from = scale-mouse-range.out
    to = mouse-contrib.b
  }

  connect {
    from = scale-base.out
    to = base-scale.a
  }

  connect {
    from = mouse-contrib.out
    to = base-scale.b
  }

  connect {
    from = click.value
    to = click-contrib.a
  }

  connect {
    from = click-amount.out
    to = click-contrib.b
  }

  connect {
    from = base-scale.out
    to = final-scale.a
  }

  connect {
    from = click-contrib.out
    to = final-scale.b
  }

  # --- Visuals ---

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
  }

  block "Array" "instances" {
    count = 16
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.25
  }

  block "Const" "color" {
    value = { r = 0.9, g = 0.5, b = 1, a = 1 }
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

  connect {
    from = final-scale.out
    to = render.scale
  }
}
