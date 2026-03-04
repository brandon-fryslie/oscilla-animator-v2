This is the comprehensive technical specification for **Shape Taxonomy: Type 3: The Continuous Ribbon (Trails & History)**.  
As you push through the cc-dump complexity audit and finalize the Naga integration, tackling Type 3 shapes forces a confrontation with **temporal state**. Unlike Rigid Stamps (Type 1\) or Parametric Curves (Type 2\) which evaluate a snapshot of the present, a Ribbon must maintain a memory of the past. This requires shifting from a simple Structure of Arrays (SoA) layout to a **SoA Ring Buffer** architecture, generating topology dynamically based on historical telemetry.

## ---

**1\. Inputs and Outputs (The Data Contract)**

The Type 3 pipeline abandons the ShapeBank for topology. The geometry does not exist until the Vertex Shader pulls the history from the Arena and weaves it into a continuous 3D mesh.

### **1.1 Compile-Time Inputs (CPU)**

* **Maximum History Length ($H$):** The absolute cap on the number of segments (e.g., 256). This dictates the memory allocation and cannot be dynamically exceeded.  
* **Ribbon Profile:** Width, taper curve (e.g., fading thickness towards the tail), and facing mode (camera-facing "billboard" vs. fixed 3D orientation).

### **1.2 Run-Time Inputs (GPU)**

* **ShapeBank (Virtual Topology Header):** Contains virtual-topology metadata (no explicit index payload). The header flags `topologyMode = NonIndexed/Virtual` and carries the canonical vertex-count contract (`H * 2`).  
* **Arena\_Read (The State):** The history buffers. For a system with $N$ instances and history $H$, the Arena stores:  
  * Arena\_PosX \[f32\] (Size: $N \\times H$)  
  * Arena\_PosY \[f32\] (Size: $N \\times H$)  
  * Arena\_HeadIndex \[u32\] (Size: $N$) \- The current write position in the ring buffer.  
  * Arena\_ActiveCount \[u32\] (Size: $N$) \- How many frames this trail has been alive (capped at $H$).

### **1.3 Outputs**

* **Vertices:** A dynamically extruded TriangleStrip. If the active history is 50 frames, it outputs 100 vertices (2 per segment) perfectly joined.  
* **Draw Commands:** The DrawPrep kernel calculates exactly how many vertices to draw based on Arena\_ActiveCount to prevent rendering uninitialized garbage memory.

## ---

**2\. Data Layout and Storage Impacts**

The memory footprint of a Ribbon is drastically larger than a standard particle.

### **2.1 The SoA Ring Buffer (Matrix Layout)**

To maintain memory coalescing (where thread $i$ reads adjacent memory to thread $i+1$), the layout must be Channel \-\> Segment \-\> Instance or Channel \-\> Instance \-\> Segment.

* **Optimal GPU Access:** Offset \= Base\_Channel \+ (InstanceID \* H) \+ SegmentIndex.  
* **Storage Cost:** A single ribbon with 256 history points requires 1,024 bytes per dimension. 10,000 trails require $\\sim 20\\text{MB}$ of VRAM just for $X$ and $Y$. This is a massive jump from Type 1, necessitating strict lifecycle management in the CPU allocator.

### **2.2 The Compute Phase (The Writer)**

Every frame, the Physics Compute Shader must:

1. Increment the Head Index: head \= (head \+ 1\) % H.  
2. Write the new position: Arena\_PosX\[InstanceID \* H \+ head\] \= New\_X.  
3. Increment the Active Count (clamped to $H$).

## ---

**3\. The Vertex Math (Procedural Extrusion)**

The Vertex Shader executes twice for every historical point (once for the left edge, once for the right edge of the ribbon).

### **3.1 Fetching the History**

The shader must map the VertexID (e.g., 0 to 511\) to a historical segment, reading backward from the HeadIndex.

$$\\text{SegmentAge} \= \\lfloor \\frac{\\text{VertexID}}{2} \\rfloor$$

$$\\text{Side} \= \\text{VertexID} \\pmod 2 \\quad (0 \= \\text{Left}, 1 \= \\text{Right})$$

$$\\text{ReadIndex} \= (\\text{HeadIndex} \- \\text{SegmentAge} \+ H) \\pmod H$$

### **3.2 The Tangent and Miter Math**

To extrude the ribbon so it faces the camera, we need the direction of travel. We fetch three points: $P\_{current}$, $P\_{prev}$ (older), and $P\_{next}$ (newer).

1. **Calculate Direction:** $D \= \\text{normalize}(P\_{next} \- P\_{prev})$.  
2. **Calculate Perpendicular (Normal):** In 2D, if $D \= (x, y)$, the normal is $N \= (-y, x)$.  
3. **Extrude:**  
   $$\\text{Vertex}\_{\\text{left}} \= P\_{current} \+ (N \\times \\text{Thickness})$$  
   $$\\text{Vertex}\_{\\text{right}} \= P\_{current} \- (N \\times \\text{Thickness})$$

*Note on 2.5D:* To give the ribbon a 3D bevel or tube shape, you assign a Z-offset based on the Side and generate smooth normals pointing outward from the core.

## ---

**4\. Hard Invariants (The Unbreakable Rules)**

1. **The Continuity Mandate (No Teleportation):** If the generator point instantly teleports from $(0,0)$ to $(100,100)$, the history buffer will connect those points, creating a massive, ugly streak across the screen.  
   * *Rule:* Any block that forces a position jump must write a special "Break" flag (e.g., NaN or a dedicated u32 mask) into the ring buffer. The Vertex Shader must detect this break and output degenerate vertices (scale \= 0\) to sever the mesh.  
2. **Strict Ring Modulo:** The DrawPrep and Vertex shaders must perfectly agree on the modulo math. If DrawPrep instructs the renderer to draw 50 segments, but the Vertex shader reads index 51, it will fetch a stale position from a previous lifecycle, causing the tail of the ribbon to wildly snap to a random location.

## ---

**5\. Pitfalls to Look Out For**

* **The Bow-Tie Artifact (Miter Folding):** If the generator makes a sharp 180-degree turn and the ribbon thickness is larger than the turn radius, the left and right vertices will cross over each other, turning the ribbon inside out.  
  * *Mitigation:* Cap the maximum thickness relative to the curve's derivative, or implement a more expensive miter-joint algorithm that detects sharp angles and inserts a bevel vertex.  
* **The "Zero Velocity" Collapse:** If $P\_{current}$ and $P\_{prev}$ are the exact same coordinate (the generator stopped moving), the direction vector $D$ is $(0,0)$. Normalizing this yields NaN, causing the entire ribbon to disappear or flash black.  
  * *Mitigation:* Always check length(D) \< 0.0001 and fallback to the previous valid tangent.  
* **Initialization Garbage:** When a trail is newly born (Active Count \= 2), the ring buffer holds 254 empty slots of 0.0. If DrawPrep fails to constrain VertexCount, the renderer will draw a thick line from the particle straight to the origin $(0,0)$.

## ---

**6\. Machine Verifiable Acceptance Criteria (AC)**

To guarantee the Naga lowering pipeline correctly orchestrates this temporal architecture, an automated agent must verify the following:

### **Phase 1: Memory Layout & Modulo AC**

* **AC 1.1 (Ring Buffer Allocation):**  
  * *Test:* Compile a graph with a Trail block set to $H=100$, Instances=10.  
  * *Assert:* The GpuLayout offset resolver must allocate exactly 1,000 floats for the $X$ channel and 1,000 for $Y$, ensuring no overlap with other fields.  
* **AC 1.2 (Head Index Wrapping):**  
  * *Test:* Run the Compute Simulator for $H+5$ frames. Query the Arena\_HeadIndex.  
  * *Assert:* The index must strictly equal 4 (since it wrapped at $H-1$).

### **Phase 2: Compute & Shader Generation AC**

* **AC 2.1 (DrawPrep Dynamic Counting):**  
  * *Test:* Inject an Arena\_ActiveCount of 15 into the DrawPrep uniform buffer.  
  * *Assert:* The generated `DrawIndirectArgs` record must output `vertexCount = 30` (15 segments $\\times$ 2 vertices) and `instanceCount = 1`\.  
* **AC 2.2 (NaN Tangent Guardrail):**  
  * *Test:* Execute a headless Vertex Shader pass with a simulated ring buffer where $P\_0, P\_1, P\_2$ all equal $(5.0, 5.0)$.  
  * *Assert:* The output clip\_position must not contain NaN. The shader must safely fallback to a default width or degenerate the triangle.  
* **AC 2.3 (Naga IR Loop Avoidance):**  
  * *Test:* Analyze the JSON IR emitted to the Naga WASM shim.  
  * *Assert:* The Vertex Shader must *not* use a for loop to search the ring buffer. It must resolve the read index using pure modular arithmetic (O(1) complexity).

---

By locking down this architecture, you gain the ability to render everything from fluid simulation streamlines to long-exposure light trails, fully isolated from CPU intervention.  
Would you like to move on to the mathematical deep dive for **Type 4: The Procedural Volume (SDFs)**, or should we examine how the RenderAssembler orchestrates the final composite?
