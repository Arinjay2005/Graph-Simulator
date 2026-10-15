# 🕸️ Graph Drawing & Traversal Simulator

A highly interactive, full-stack React / Next.js application designed to visualize and teach advanced Graph Theory and Computational Geometry concepts. This tool allows users to draw arbitrary or orthogonal planar graphs, sync them bidirectionally with Adjacency Matrices/Lists, execute Breadth-First Search (BFS) with real-time memory tracking, untangle complex networks using a Force-Directed Algorithm, and decompose orthogonal embeddings using Tamassia's Rectangular Refinement algorithm.

**Live Demo:** https://graphsimulator.vercel.app/

## ✨ Key Features

### ➡️ Interactive Drawing Canvas
* **Freehand Editing:** Click to drop vertices. Sequentially click nodes to bind them with edges.
* **Granular Controls:** Switch between dedicated modes to delete specific nodes, snip edges, or toggle between Weighted and Unweighted graph modes.
* **Dynamic Weights:** Click directly on edges to assign or edit custom weights via an integrated modal.

### ➡️ Bidirectional Data Syncing
* **Live Adjacency Sync:** As you draw on the canvas, the Adjacency Matrix and Adjacency List automatically update in real-time.
* **Reverse Rendering:** Upload a `.txt` file or manually type a complex $N \times N$ matrix or list, and the canvas will instantly parse the text and will create and draw the mathematical graph.
* **Data Export:** Download the raw mathematical representations of your graph with a single click.

### ➡️ Orthogonal Mode & Grid Engine
* **Grid Snapping & Hover:** Vertices and bends snap to a 40px rectilinear grid, with an optional interactive crosshair displaying real-time coordinate badges under the cursor.
* **Multi-Bend Routing:** Draw orthogonal edges with intermediate $90^\circ$ bends, protected by real-time planarity and segment validation.
* **Drawing Shortcuts:** Use `Backspace` or `Z` to remove recent bends, and `Escape` to cancel an in-progress edge.

### ➡️ BFS Visualization
* **Algorithmic Playback:** Step through Breadth-First Search frame-by-frame or play it at speed.
* **Dual-View:** The main canvas builds the final BFS Spanning Tree along with the right-hand panel highlighting evaluated, rejected, and unvisited edges on the original graph which will help in understanding how the tree is being formed.
* **Memory Tracking:** Watch the algorithmic state in real-time with a live FIFO Queue tracker and current-node processing tags.
* **Tree Export:** Once the algorithm finishes, instantly export the resulting BFS Tree as a strict Matrix or List.

### ➡️ Force-Directed Layout Engine
* **Force Model:** Each iteration computes a displacement vector $F_u$ per node as the sum of repulsive forces $f_\text{rep}(u,v) = c_\text{rep} / \|p_v - p_u\|^2$ from all other nodes, and attractive forces $f_\text{attr}(u,v) = f_\text{spring}(u,v) - f_\text{rep}(u,v)$ along each edge, where $f_\text{spring}(u,v) = c_\text{spring} \cdot \log(\|p_v - p_u\| / \ell)$.
* **Velocity-Damping Convergence:** Nodes accumulate velocity each iteration, decayed by a damping factor, until the max force magnitude falls below an epsilon threshold or the iteration cap is hit.
* **Frame-by-Frame Playback:** The full simulation is pre-computed into a history of snapshots which you can play, pause, or move through step by step.
* **Configurable Parameters:** Tune Repulsion ($c_\text{rep}$), Spring stiffness ($c_\text{spring}$), Ideal Edge Length ($\ell$), Damping, and Max Iterations before running.

### ➡️ Rectangular Refinement (Tamassia's Algorithm)
* **Face Decomposition & Turn Labeling:** Traces boundary cycles for inner faces and the outer face ($f_0$), classifying corner turn angles ($+1$ convex, $-1$ reflex, $0$ collinear) to identify faces needing refinement.
* **Opposite Wall (front(e)) & Ray Projection:** For each reflex corner ($270^\circ$), walks the boundary until accumulated turns $\sum \text{turn}(e) = +1$ to locate the opposite wall, casting an orthogonal ray to insert a dummy T-junction vertex and extension edge.
* **Tamassia Shifting Approach:** If a projected ray lands within $40\text{px}$ of a wall endpoint, safely translates the far-side subgraph along the wall axis to extend $\text{front}(e)$ without breaking planarity.
* **Outer Face Bounding Rectangle:** Surrounds the graph with an adaptive bounding box to handle outer-face projections where $\text{front}(e)$ is undefined, converting the boundary into real border edges.
* **Dual-View Playback & Inspection:** Step through the refinement animation alongside the original graph, inspect failure diagnostics with highlighted error edges if refinement is blocked, and copy the refined graph back to the canvas.

## ➡️ Tech Stack
* **Framework:** React / Next.js
* **Rendering:** HTML5 `<canvas>` API
* **Styling:** Inline CSS with dynamic state-based transitions
* **Hosting:** Vercel