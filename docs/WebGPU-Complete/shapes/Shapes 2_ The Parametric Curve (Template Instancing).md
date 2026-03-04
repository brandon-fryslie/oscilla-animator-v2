This is the comprehensive technical specification for **Shape Taxonomy: Type 2: The Parametric Curve (Template Instancing)**.  
For Oscilla v3.0, specifically as you navigate the complexity audit of the cc-dump architecture and fully integrate the Naga library, this is the most mathematically demanding phase of the pipeline. Type 2 shapes abandon the safety of rigid meshes. Here, the GPU evaluates continuous mathematical functions on the fly, enabling the organic, writhing, independent motion required for high-end generative animation.

## ---

**1\. Inputs and Outputs (The Data Contract)**

In a Type 2 pipeline, the concept of a "Vertex" is split in half. The CPU defines *time* ($t$), and the GPU computes *space* ($X, Y, Z$).

### **1.1 Compile-Time Inputs (CPU)**

* **Curve Degree ($C$):** The number of control points defining the mathematical function (e.g., 4 for a Cubic Bezier, 2 for a Line).  
* **Resolution ($R$):** The number of segments to evaluate along the curve (e.g., 64 steps).  
* **2.5D Extrusion Profile:** The cross-section of the curve (e.g., a flat ribbon, a 3D tube, or a beveled strap).

### **1.2 Run-Time Inputs (GPU)**

* **ShapeBank (The Template):** A rigid 1D mesh representing the progression of $t$ from $0.0$ to $1.0$.  
* **Arena\_Read (The State):** The dynamically computed control points for *every single instance*.  
  * *Example (Cubic Bezier):* 8 separate f32 arrays (P0\_X, P0\_Y, P1\_X, P1\_Y, P2\_X, P2\_Y, P3\_X, P3\_Y).

### **1.3 Outputs**

* **Vertices:** Calculated instantaneously in the Vertex Shader and immediately consumed by the rasterizer. The final 3D coordinates are *never* written back to VRAM.  
* **Surface Normals:** Analytically derived tangents and bitangents, fed directly to the MatCap fragment shader for 2.5D lighting.

## ---

**2\. Data Layout and Storage Impacts**

Parametric instancing shifts the memory burden from the ShapeBank to the Arena.

### **2.1 The ShapeBank (Template Packing)**

Instead of storing spatial coordinates, the ShapeBank stores the topological "skeleton" of the curve.

* **Format:** A normalized array of $t$-values.  
* **Size:** Tiny. A 64-segment curve requires exactly 65 floats (260 bytes), regardless of whether you draw 10 instances or 100,000.  
* **Topology:** If rendering a 3D tube, the template contains the 2D cross-section vertices, each tagged with a $t$-value to indicate its position along the longitudinal axis.

### **2.2 The Arena (Control Point Sprawl)**

The SoA (Structure of Arrays) footprint expands linearly with the Curve Degree ($C$).

* **Storage Cost:** A Cubic Bezier requires 4 control points $\\times$ 2 dimensions \= 8 f32 values per instance.  
* **Scale:** For 10,000 curves, the Arena allocates 8 separate 40KB arrays (320KB total).  
* **Impact:** The Compute Shader must execute 8 separate offset calculations and 8 memory writes per instance. The GpuLayout offset resolver must guarantee strict 16-byte alignment between these channels to avoid driver-level read faults.

## ---

**3\. The Vertex Math (Analytical 2.5D Extrusion)**

To achieve the "wow" factor of 2.5D depth, we cannot just evaluate the position. We must evaluate the *direction* of the curve to generate a 3D mesh (a tube or ribbon) that catches light.

### **3.1 Evaluating Position**

The Vertex Shader fetches the 4 control points from the Arena and applies the Cubic Bezier polynomial:

$$B(t) \= (1-t)^3 P\_0 \+ 3(1-t)^2 t P\_1 \+ 3(1-t) t^2 P\_2 \+ t^3 P\_3$$

### **3.2 Evaluating the Tangent (The Derivative)**

To extrude a 3D skirt or bevel along the curve, we must know which way the curve is pointing at exactly $t$. We calculate the first derivative $B'(t)$:

$$B'(t) \= 3(1-t)^2 (P\_1 \- P\_0) \+ 6(1-t)t (P\_2 \- P\_1) \+ 3t^2 (P\_3 \- P\_2)$$

* **The Normal:** By normalizing $B'(t)$ and taking its cross product with the camera's Z-axis (or an arbitrary "Up" vector), we generate a perpendicular Normal vector.  
* **The Extrusion:** We multiply this Normal by the Thickness parameter to push the vertex outward, creating a solid 3D ribbon that dynamically twists and bends.

## ---

**4\. Hard Invariants (The Unbreakable Rules)**

1. **Uniform Resolution Mandate:** Hardware instancing (drawIndexedIndirect) dictates that every instance of a specific draw call processes the exact same IndexCount. You cannot have Instance 0 evaluate 10 segments and Instance 1 evaluate 100 segments. Resolution is globally locked per block.  
2. **The Register Ceiling:** The maximum number of control points $C$ evaluated in a single WGSL shader must be strictly capped (e.g., $C \\le 16$).  
   * *Why:* GPUs have a limited number of ultra-fast hardware registers per thread. If a user tries to evaluate a 256-point spline parametrically, the shader will "spill" those variables into slow VRAM. Performance will instantly drop by 90%.  
3. **Template Immutability:** The $t$-value progression in the ShapeBank must remain static during the render pass.

## ---

**5\. Pitfalls to Look Out For**

* **The "Constant Arc-Length" Illusion:** In Bezier math, stepping $t$ by $0.1$ does *not* mean you travel 10% of the physical distance along the curve. If control points are clustered, the curve moves slowly; if they are far apart, it accelerates.  
  * *Consequence:* If you map a texture (UVs) or apply a dashed-line pattern using raw $t$, the texture will violently stretch and squash. For V1, accept this as a quirk of parametric math. For V2, you must implement Arc-Length Parameterization (a numerical integration step) to evenly distribute vertices.  
* **Collinear Tangent Failure:** If $P\_0, P\_1, P\_2, P\_3$ perfectly overlap or form a straight line, the derivative $B'(t)$ can become a zero vector.  
  * *Consequence:* Normalizing a zero vector results in NaN. The 3D extrusion will explode, causing a visual black hole or screen flash.  
  * *Fix:* Always add a microscopic epsilon to the tangent before normalization: normalize(tangent \+ vec2(0.00001)).  
* **The "Twist" (Frenet-Serret Frame):** When extruding a 3D tube along a 3D curve, the local "Up" vector can flip wildly when the curve crosses the Z-axis, causing the tube to pinch or twist inside out. You must implement parallel transport (e.g., Bishop Frame) rather than a naive cross-product.

## ---

**6\. Machine Verifiable Acceptance Criteria (AC)**

To guarantee the Naga lowering pipeline and memory architecture are bulletproof, an automated agent must verify the following:

### **Phase 1: Memory & Layout Verification**

* **AC 1.1 (SoA Channel Allocation):**  
  * *Test:* Compile a graph with a CubicBezier block set to 1,000 instances.  
  * *Assert:* The GpuLayout must register exactly 8 sequential scalar offsets. Offset(P0\_Y) \- Offset(P0\_X) must equal exactly 1000 \* 4 bytes (plus any padding required for 16-byte alignment).  
* **AC 1.2 (Template Generation):**  
  * *Test:* Instantiate a Type 2 shape with Resolution \= 4\.  
  * *Assert:* The ShapeBank payload must contain exactly 5 f32 values (bit-cast to u32): \[0.0, 0.25, 0.5, 0.75, 1.0\].

### **Phase 2: Compute & Math Verification**

* **AC 2.1 (Headless Analytical Validation):**  
  * *Test:* Execute a headless WebGPU pipeline. Inject Arena control points: $P\_0(0,0)$, $P\_1(0,1)$, $P\_2(1,1)$, $P\_3(1,0)$. Query the Vertex Shader output at $t=0.5$.  
  * *Assert:* The computed $X, Y$ coordinate must strictly equal (0.5, 0.75) within standard floating-point epsilon ($1e-6$).  
* **AC 2.2 (NaN Guardrail Test):**  
  * *Test:* Inject collapsed control points: $P\_0 \= P\_1 \= P\_2 \= P\_3 \= (0,0)$.  
  * *Assert:* The output clip\_position must resolve to (0,0,0,1). The shader must not emit NaN or Infinity in its normal or position calculations.

### **Phase 3: Naga Shader Generation**

* **AC 3.1 (Loop Unrolling / Static Indexing):**  
  * *Test:* Analyze the JSON IR emitted to the Naga WASM shim.  
  * *Assert:* The Vertex Shader must not contain dynamic array indexing for control points. The Naga AST must explicitly construct variables via direct offset reads (e.g., Read(Arena, Base \+ Lane), Read(Arena, Base \+ Offset1 \+ Lane)).

By strictly adhering to these invariants, Type 2 shapes will operate with the predictability of rigid meshes while offering the infinite topological flexibility of organic math.  
Would you like to move on to the architectural details for **Type 3: The Continuous Ribbon (History Trails)**, or would you like to explore the DrawPrep sorting algorithms?