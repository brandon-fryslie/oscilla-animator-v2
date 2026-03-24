# Expression Operator Showcase
#
# Demonstrates Expression syntax in stable many-cardinality usage:
# - one->many mapping via mapField(...)
# - ternary selection on field values
# - vec3 constructor
# - swizzle/component access from vec3 input (.x/.y)

patch "Expression Operator Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    role = "timeRoot"
    outputs {
      phaseA = [pos.refs, scale.refs]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = points.element
    }
  }

  block "InstanceDomain" "points" {
    count = 160
    outputs {
      index = layout.index
      rank = [pos.refs, scale.refs, color.h]
    }
  }

  block "ScatterUV" "layout" {

    outputs {
      uv = pos.refs
    }
  }

  block "Expression" "pos" {
    expression = <<-EXPR
      // Convert normalized phase to radians.
      // Visual: provides continuous time movement for all instances.
      global_phase = clock.phaseA * 6.2832

      // Broadcast phase to each element lane.
      // Visual: shared time signal combines with lane-local offsets.
      global_phase_field = mapField(global_phase, points.rank)

      // Lane angle around the orbit ring.
      // Visual: evenly distributes points and keeps them in motion.
      angle = points.rank * 18.8496 + global_phase_field

      // Select opposite x offsets for the two halves of the field.
      // Visual: creates mirrored left/right swirl behavior.
      side_x = points.rank > 0.5 ? 0.15 : -0.15

      // Select opposite y offsets for the two halves of the field.
      // Visual: complements x mirroring to form a braided pattern.
      side_y = points.rank > 0.5 ? -0.15 : 0.15

      // Apply local orbit displacement around layout anchors.
      // Visual: each point circles around its grid cell center.
      x = layout.uv.x + side_x * sin(angle)
      y = layout.uv.y + side_y * cos(angle)

      // Output final position.
      // Visual: keeps all motion on the 2D plane.
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Expression" "scale" {
    expression = <<-EXPR
      // Per-instance minimum scale.
      // Visual: preserves legibility even when oscillation is low.
      base_scale = 0.75

      // Oscillation amplitude.
      // Visual: controls the strength of the breathing effect.
      pulse_amount = 0.2

      // Shared time phase in radians.
      // Visual: ties scale animation to the main clock.
      global_phase = clock.phaseA * 6.2832

      // Map one phase value across lanes.
      // Visual: all points pulse on the same tempo with lane offsets.
      global_phase_field = mapField(global_phase, points.rank)

      // Lane-specific pulse phase.
      // Visual: creates traveling phase differences through the grid.
      pulse_angle = points.rank * 12.5664 + global_phase_field

      // Final scale signal.
      // Visual: results in rolling size waves across instances.
      base_scale + pulse_amount * sin(pulse_angle)
    EXPR
    outputs {
      out = render.scale
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
