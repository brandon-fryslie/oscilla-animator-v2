This is the comprehensive technical specification for **Shape Taxonomy: Type 1: The Rigid Stamp (Standard Instancing)**.  
You are moving from theory to implementation. This document defines the exact mechanical blueprint for how your engine will render thousands of static meshes efficiently. It strips away the magic and outlines the strict data contracts, memory layouts, and machine-verifiable tests required to build this foundational pillar of Oscilla v3.0.

## ---

**1\. Inputs and Outputs (The Data Contract)**

The Type 1 pipeline takes static topological data (the "Blueprint") and dynamic simulation data (the "State"), marrying them inside the GPU's rasterizer.

### **1.1 Compile-Time Inputs (CPU)**

* **Raw Geometry:** A JavaScript object containing local vertex positions (e.g., a triangulated SVG logo or a 5-point star) and index connectivity.  
* **Material Overrides:** (Optional) Default color or UV mappings.

### **1.2 Run-Time Inputs (GPU)**

* **ShapeBank (Storage Buffer):** The compiled binary representation of the Blueprint.  
* **Arena\_Read (Storage Buffer):** The SoA (Structure of Arrays) fields containing the physical state of every instance:  
  * Arena\_PosX \[f32\]  
  * Arena\_PosY \[f32\]  
  * Arena\_Rot \[f32\] (Angle in radians)  
  * Arena\_Scale \[f32\]

### **1.3 Outputs**

* **Frame N Pixels:** Rasterized fragments written to the MSAA Color Attachment and Depth Buffer.  
* **Indirect Draw Args:** The 20-byte struct written to the IndirectCommandBuffer by the Draw Prep kernel.

## ---

**2\. Data Layout and Storage Impacts**

To achieve maximum memory bandwidth, we must pack heterogeneous data (integers and floats) into strictly aligned blocks.

### **2.1 The ShapeBank Binary Packing (array\<u32\>)**

The ShapeBank acts as both the Index Buffer and the Vertex Buffer. Because WebGPU storage buffers require a single type in WGSL (we use u32), we rely on bitcast\<f32\>() to extract vertex floats.  
**Header Stride (8 Words / 32 Bytes):**  
| Offset | Type | Name | Purpose |  
| :--- | :--- | :--- | :--- |  
| 0 | u32 | IndexCount | Number of indices to draw. |  
| 1 | u32 | IndexOffset | Offset into the Payload where indices begin. |  
| 2 | u32 | VertexCount | Number of unique vertices. |  
| 3 | u32 | VertexOffset | Offset into the Payload where vertices begin. |  
| 4 | u32 | VertexStride | Number of u32 words per vertex (e.g., 6 for PosX, PosY, PosZ, NormX, NormY, NormZ). |  
| 5-7| ... | Reserved | Padding for std430 alignment / Bounding Box data. |  
**Payload Region:**

* **Indices:** Stored sequentially as u32.  
* **Vertices:** Stored as f32 but written to the Uint32Array view on the CPU.

### **2.2 The Arena SoA Layout**

The instance transforms must be perfectly aligned.

* **Impact:** If you have 1,000 instances, PosX takes 4,000 bytes. The PosY array *must* start at an address that is a multiple of 16 (preferably 256 for cache alignment).  
* **Storage Cost:** A standard 2D particle requires 16 bytes per instance ($X, Y, Rot, Scale$). 10,000 particles \= 160KB. This is trivially small.

## ---

**3\. Hard Invariants (The Unbreakable Rules)**

If an automated agent or a human developer breaks these rules, the pipeline will crash the GPU driver or render garbage.

1. **Topology Immutability:** Once a Type 1 shape is written to the ShapeBank, its IndexCount and local vertex data **cannot** change during the render loop. To deform a mesh, it must be upgraded to a Type 2 (Parametric) shape.  
2. **The Shape Sorting Mandate:** A single WebGPU drawIndexedIndirect command can only draw instances that share the exact same IndexCount and IndexOffset.  
   * *Consequence:* If a single Render block receives a Field of 5,000 Stars (ShapeID 1\) and 5,000 Circles (ShapeID 2), the Draw Prep kernel **must** split this into *two* separate DrawIndexedIndirectArgs structs. You cannot mix ShapeIDs within a single draw command unless using the degenerate geometry workaround.  
3. **Local Origin Constraint:** All vertex data in the ShapeBank must be centered around (0,0,0). Transforms are strictly applied via the Arena instance data.

## ---

**4\. Pitfalls to Look Out For**

* **The "Fat Vertex" Trap:** Adding too many attributes (UVs, Tangents, Vertex Colors) to the ShapeBank payload increases the VertexStride. Fetching these in the Vertex Shader causes register spilling. Keep Type 1 vertices lean (Position \+ Normal).  
* **bitcast Endianness:** JavaScript Float32Array and Uint32Array share underlying endianness when mapped over the same ArrayBuffer. Ensure you do not manually manipulate the bytes; just use a DataView or typed arrays sharing a buffer to write the floats into the u32 storage.  
* **The Gimbal Lock (Rotation):** For 2D, passing a single f32 rotation angle is fine. If you move to full 3D rigid bodies later, do not pass Euler angles (vec3) in the Arena. Pass Quaternions (vec4\<f32\>). Euler angles will cause gimbal lock and complex matrix reconstruction in the shader.

## ---

**5\. Machine Verifiable Acceptance Criteria (AC)**

An AI agent implementing this phase must write unit and integration tests that prove the following conditions pass *before* merging the code.

### **Phase 1: Compiler & Memory Layout AC**

* **AC 1.1 (Buffer Alignment):**  
  * *Test:* Instantiate a ShapeAllocator. Allocate a Shape with 3 vertices and 3 indices.  
  * *Assert:* The VertexOffset returned in the header must be strictly aligned to a 4-byte boundary. The total size of the ShapeBank Uint32Array must be a multiple of 4\.  
* **AC 1.2 (Float-to-Int Casting):**  
  * *Test:* Write a vertex position \[-1.5, 2.75, 0.0\] via the ShapeAllocator. Read the memory back through a Uint32Array view, then bit-cast it back to float in a JS test.  
  * *Assert:* extracted\_float \=== \-1.5 (Exact bitwise match).  
* **AC 1.3 (Draw Prep Grouping):**
  * *Test:* Provide a Field of ShapeIDs to the Compiler Simulator: \[1, 1, 2, 1, 2\].
  * *Assert:* Compiler-emitted sink metadata plus the canonical static draw-prep kernel must produce exactly **2** indexed indirect records (one for ID 1 with `instanceCount = 3`, one for ID 2 with `instanceCount = 2`).

### **Phase 2: Shader Execution AC**

* **AC 2.1 (WGSL Syntax Validation):**  
  * *Test:* Pass the generated uber\_shader.wgsl string to the naga-wasm validator.  
  * *Assert:* result.is\_valid \=== true. No compilation warnings regarding bitcast or out-of-bounds array access.  
* **AC 2.2 (The Transformation Matrix):**  
  * *Test:* Run a headless compute test. Given an Arena with PosX \= 10.0, PosY \= 0.0, Rot \= 1.57079 (90 deg), Scale \= 2.0, and a local vertex (1.0, 0.0).  
  * *Assert:* The Vertex Shader calculation must output world\_pos.x \== 10.0 and world\_pos.y \== 2.0 (allowing for standard floating-point epsilon).  
  * *WGSL Math to verify:*  
    $$\\text{world\\\_pos} \= \\begin{bmatrix} \\cos(\\theta) & \-\\sin(\\theta) \\\\ \\sin(\\theta) & \\cos(\\theta) \\end{bmatrix} \\cdot \\left( \\text{local\\\_pos} \\times \\text{scale} \\right) \+ \\text{arena\\\_pos}$$

---

Implementing this specific taxonomy unlocks the "game engine" tier of performance for your graph.  
Should we map out the exact Acceptance Criteria and memory layouts for **Type 2: The Parametric Curve** next, or would you prefer to outline the strategy for the Draw Prep kernel's sorting logic?
