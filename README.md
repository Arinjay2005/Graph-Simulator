# 🕸️ Graph Drawing & Traversal Simulator

A highly interactive, full-stack React application designed to visualize and teach advanced Graph Theory concepts. This tool allows users to draw graphs, sync them bidirectionally with Adjacency Matrices/Lists, execute Breadth-First Search (BFS) with real-time memory tracking, and untangle complex networks using a Force-Directed Algorithm.

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

### ➡️ BFS Visualization
* **Algorithmic Playback:** Step through Breadth-First Search frame-by-frame or play it at speed.
* **Dual-View:** The main canvas builds the final BFS Spanning Tree along with the right-hand panel highlighting evaluated, rejected, and unvisited edges on the original graph which will help in understanding how the tree is being formed.
* **Memory Tracking:** Watch the algorithmic state in real-time with a live FIFO Queue tracker and current-node processing tags.
* **Tree Export:** Once the algorithm finishes, instantly export the resulting BFS Tree as a strict Matrix or List.

### ➡️ Force-Directed Layout Engine
* **Custom Engine:** Implements the Fruchterman–Reingold force-directed graph layout algorithm to automatically untangle overlapping graphs.
* **Auto-Stabilization:** Automatically shakes the nodes to break free of messy tangles, smoothly decelerating them until the graph finds its perfect resting state.
* **Live Sandbox Controls:** Slide the controls to dynamically manipulate:
  * **Repulsion:** Coulomb's Law (Magnets) pushing nodes apart.
  * **Attraction:** Hooke's Law (Springs) pulling edges together.
  * **Edge Length:** The resting distance between vertices.

## ➡️ Tech Stack
* **Framework:** React / Next.js
* **Rendering:** HTML5 `<canvas>` API
* **Styling:** Inline CSS with dynamic state-based transitions
* **Hosting:** Vercel