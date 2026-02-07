# Path Field Demo
#
# Simple demo showing PathField extracting positions from a star shape.
# Uses Array to create renderable instances and CircleLayout for positioning.
#
# This demonstrates that PathField compiles correctly with proper cardinality
# propagation from ProceduralStar.

patch "Path Field Demo" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
    outputs {
      phaseA = hue-rainbow.t
    }
  }

  # Create the star shape
  block "ProceduralStar" "star" {
    points = 5
    outerRadius = 0.25
    innerRadius = 0.1
    outputs {
      controlPoints = path-field.controlPoints
    }
  }

  # Extract per-point properties from the star's control points
  block "PathField" "path-field" {
    # For a 5-point star, there are 10 control points (alternating outer/inner)
    # PathField extracts: position, index, tangent, arcLength
    # (outputs not connected for now - just testing compilation)
  }

  # Create 10 instances with ellipse markers (matching star control point count)
  block "Ellipse" "marker" {
    rx = 0.015
    ry = 0.015
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 10
    outputs {
      elements = layout.elements
    }
  }

  # Use CircleLayout for positioning
  block "CircleLayoutUV" "layout" {
    radius = 0.3
    outputs {
      position = render.pos
    }
  }

  # Cycling rainbow color (signal-level, broadcast to field)
  block "HueRainbow" "hue-rainbow" {
    outputs {
      out = color-field.signal
    }
  }

  block "Broadcast" "color-field" {
    outputs {
      field = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
