Yes, you absolutely must support both. They represent the classic engineering trade-off between **throughput** and **flexibility**.

* **Standard Instancing (Rigid Shapes):** You use this when you want 500,000 tiny glowing dust motes. The vertex shader is incredibly "dumb" and fast. It just adds Local\_Position \+ Arena\_Position.  
* **Template Instancing (Parametric Shapes):** You use this when you want 10,000 writhing tentacles. The vertex shader is "smart" and computationally heavy, calculating cubic polynomials on the fly.

If you forced dust motes to run through the parametric pipeline, you'd waste massive amounts of GPU ALU (Arithmetic Logic Unit) cycles. If you forced tentacles into the rigid pipeline, you'd have to update half a million vertices on the CPU every frame. You need both.  
Beyond those two, to have a truly complete generative 2D engine, there are **two more fundamental "types" of shapes** you must support. They require completely different memory access patterns in the GPU.  
Here is the complete taxonomy of shape types for your architecture.

### ---

**Type 1: The Rigid Stamp (Standard Instancing)**

* **What it is:** A fixed mesh (Triangle, Star, imported SVG logo).  
* **Arena Storage:** 1 vec2 (Position) per instance.  
* **Bank Storage:** Literal local coordinates and indices (e.g., (0,1), (1,-1), (-1,-1)).  
* **Vertex Logic:** ClipPos \= Local\_Vertex\_From\_Bank \+ Arena\_Position\[InstanceID\].  
* **Use Case:** Particle systems, boids, scatter effects.

### **Type 2: The Parametric Curve (Template Instancing)**

* **What it is:** A mathematical curve driven by animated control points.  
* **Arena Storage:** N vec2s (Control Points P0, P1, P2...) per instance.  
* **Bank Storage:** A 1D array of interpolation steps ($t$-values: 0.0, 0.1, 0.2...).  
* **Vertex Logic:** Read $t$ from Bank. Read P0...PN from Arena. Calculate final position using Bezier/Spline math.  
* **Use Case:** Audio waveforms, organic distortion, physics-driven ropes.

### ---

**Type 3: The Continuous Ribbon (Trails & History)**

This is the most glaring omission from standard instancing. A "Trail" is not a collection of separate instances; it is a single, continuous, connected mesh that grows over time.

* **The Problem:** You cannot draw a smooth ribbon by instancing 1,000 circles very close together. If you apply opacity to them, the overlapping edges will multiply and create dark banding artifacts. You need a single continuous triangle strip.  
* **What it is:** A dynamically generated mesh based on the historical positions of a single point.  
* **Arena Storage:** A Ring Buffer. If your trail is 100 frames long, the Arena stores the last 100 vec2 positions of the generator.  
* **Bank Storage:** Nothing, or a simple "Line Strip" virtual topology flag.  
* **Vertex Logic:**  
  * The Draw Prep kernel tells the renderer to draw VertexCount \= HistoryLength \* 2\.  
  * The Vertex Shader uses VertexID to look backward in the Arena ring buffer.  
  * It reads Pos\[t\] and Pos\[t-1\], calculates the tangent vector between them, and extrudes vertices perpendicular to the tangent to create "Thickness."  
* **Use Case:** "Light painting," Tron bikes, fluid sim streamlines.

### ---

**Type 4: The Procedural Volume (SDFs / Fragment-Driven)**

This turns the traditional rendering pipeline inside out. Instead of the Vertex Shader defining the shape, the **Fragment (Pixel) Shader** defines it.

* **The Problem:** If you draw a perfect circle using polygons (Type 1), zooming in 100x will reveal the flat, jagged edges of the triangles.  
* **What it is:** A mathematical equation evaluated per-pixel.  
* **Arena Storage:** 1 vec2 (Position) per instance, plus parameters (e.g., Radius, Fuzziness).  
* **Bank Storage:** A simple Quad (4 vertices).  
* **Vertex Logic:** It just draws a square bounding box around the Arena\_Position. It passes the local UV coordinates (from \-1.0 to 1.0) to the Fragment Shader.  
* **Fragment Logic:**  
  * The pixel asks: "How far am I from the center?" (length(uv)).  
  * "Am I inside the radius?" (if distance \< radius return White, else discard).  
* **Use Case:** Flawless, infinite-resolution circles, rings, soft-edged glowing orbs, and complex boolean shapes (e.g., a circle with a square cut out of it).

### ---

**The Text/Glyph Hybrid (The Special Case)**

You will inevitably need to render Text. Text is notoriously difficult on the GPU.  
In a modern 2D engine, Text does not get its own "Type." It is usually implemented as a hybrid of **Type 1** and **Type 4**.

1. **CPU:** Parses the string, applies kerning, and allocates instances in the Arena (one instance per letter).  
2. **Arena:** Stores the Position of each letter, and a GlyphIndex (which letter it is).  
3. **Bank / Texture:** You don't store the vector curves of the letter 'A'. You store a **Multi-Channel Signed Distance Field (MSDF) Texture Atlas**.  
4. **Render:** It draws as Type 1 (Rigid Quads), but the Fragment Shader uses the MSDF texture to render infinitely crisp typography at any scale (Type 4).

### **Summary for your V1 Architecture**

If you structure your RenderAssembler to handle these four memory access patterns, your engine will be functionally complete for 2D generative graphics:

1. **Read Local Vertices** (Rigid)  
2. **Read T-Values \+ Control Points** (Parametric)  
3. **Read Historical Ring Buffers** (Trails)  
4. **Draw Quads \+ Pixel Math** (SDFs)

Any block a user wants to create will cleanly compile down into one of these four paradigms.