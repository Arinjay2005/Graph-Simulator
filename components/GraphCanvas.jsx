import React, { useRef, useState, useEffect } from 'react';
import {
  VERTEX_RADIUS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  getGraphCanvasDimensions,
  pointToSegmentDistance,
  generateCircularLayout,
  parseMatrixInput,
  parseListInput,
  buildAdjacencyListText,
  buildAdjacencyMatrixText,
  drawGraph,
  drawGrid,
  drawGridHover,
  snapToGrid,
} from './Shared';
import {
  runBFS,
  useBfsPlayback,
  BfsControls,
  BfsStatusBox,
  BfsOriginalGraphPanel,
  drawBfsMainCanvas,
  drawBfsOriginalCanvas,
} from './Bfs';
import {
  runForceLayout,
  useForcePlayback,
  ForceDirectedControls,
  ForceReferencePanel,
} from './Force_Directed';
import {
  runRefinement,
  flattenRefinedGraph,
  useRefinementPlayback,
  RefinementControls,
  RefinementStatusBox,
  RefinementOriginalGraphPanel,
  drawRefinementMainCanvas,
  drawRefinementOriginalCanvas,
} from './Refinement';
import { checkOrthogonalSegment } from './RefinementGeometry';

// True if any vertex/bend sits outside the default canvas (with a vertex-radius margin).
const graphExceedsDefaultCanvas = (graphVertices, graphEdges) => {
  const points = [...graphVertices];
  graphEdges.forEach((edge) => (edge.bends || []).forEach((bend) => points.push(bend)));
  return points.some(
    (p) =>
      p.x < VERTEX_RADIUS || p.y < VERTEX_RADIUS ||
      p.x > CANVAS_WIDTH - VERTEX_RADIUS || p.y > CANVAS_HEIGHT - VERTEX_RADIUS
  );
};

const GraphCanvas = () => {
  const canvasRef = useRef(null);
  const rightCanvasRef = useRef(null);
  const refinementCanvasRef = useRef(null);

  // App Modes & Settings
  const [mode, setMode] = useState('draw');
  const [isWeighted, setIsWeighted] = useState(false);
  const [activeAlgoPanel, setActiveAlgoPanel] = useState('none');

  // State for the Weight Input Modal
  const [pendingEdge, setPendingEdge] = useState(null);
  const [weightInputVal, setWeightInputVal] = useState('');

  // Sample Graph
  const [vertices, setVertices] = useState([
    { id: 1, x: 400, y: 100 },
    { id: 2, x: 600, y: 300 },
    { id: 3, x: 400, y: 500 },
    { id: 4, x: 200, y: 300 },
  ]);
  const [edges, setEdges] = useState([
    { source: 1, target: 2, weight: 1 },
    { source: 2, target: 3, weight: 1 },
    { source: 3, target: 4, weight: 1 },
    { source: 4, target: 1, weight: 1 },
  ]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const [selectedVertexId, setSelectedVertexId] = useState(null);
  const [matrixInput, setMatrixInput] = useState('');
  const [listInput, setListInput] = useState('');
  const [error, setError] = useState('');

  // --- BFS STATE ---
  const [algoMode, setAlgoMode] = useState('idle');
  const [algoHistory, setAlgoHistory] = useState([]);
  const [algoStep, setAlgoStep] = useState(0);
  const [bfsStartNode, setBfsStartNode] = useState('1');

  // --- FORCE LAYOUT STATE ---
  const [forceAlgoMode, setForceAlgoMode] = useState('idle');
  const [forceHistory, setForceHistory] = useState([]);
  const [forceStep, setForceStep] = useState(0);
  const [jumpSize, setJumpSize] = useState(10);
  const [forceConfig, setForceConfig] = useState({
    cRep: 4000,
    cSpring: 0.35,
    idealLength: 120,
    damping: 0.85,
    epsilon: 0.1,
    maxIterations: 500,
  });

  // --- REFINEMENT / ORTHOGONAL MODE STATE ---
  const [isOrthogonalMode, setIsOrthogonalMode] = useState(false);
  const [pendingEdgePath, setPendingEdgePath] = useState(null);
  const [refinementAlgoMode, setRefinementAlgoMode] = useState('idle');
  const [refinementHistory, setRefinementHistory] = useState([]);
  const [refinementStep, setRefinementStep] = useState(0);
  const [refinementFailureInfo, setRefinementFailureInfo] = useState(null);
  const [exitRefinementChoice, setExitRefinementChoice] = useState(false);
  const [lockedCanvas, setLockedCanvas] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [isGridHoverOn, setIsGridHoverOn] = useState(false);

  const cloneGraph = (graphVertices, graphEdges) => ({
    vertices: graphVertices.map((vertex) => ({ ...vertex })),
    edges: graphEdges.map((edge) => ({ ...edge, bends: edge.bends ? edge.bends.map((bend) => ({ ...bend })) : undefined })),
  });

  const commitGraphChange = (nextVertices, nextEdges) => {
    setUndoStack((stack) => [...stack.slice(-99), cloneGraph(vertices, edges)]);
    setRedoStack([]);
    setVertices(nextVertices);
    setEdges(nextEdges);
  };

  const undoGraphChange = () => {
    if (algoMode !== 'idle' || forceAlgoMode !== 'idle' || refinementAlgoMode !== 'idle' || refinementFailureInfo) return;
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack([...redoStack, cloneGraph(vertices, edges)]);
    setUndoStack(undoStack.slice(0, -1));
    setVertices(previous.vertices);
    setEdges(previous.edges);
    setSelectedVertexId(null);
    setPendingEdge(null);
    setPendingEdgePath(null);
  };

  const redoGraphChange = () => {
    if (algoMode !== 'idle' || forceAlgoMode !== 'idle' || refinementAlgoMode !== 'idle' || refinementFailureInfo) return;
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack([...undoStack, cloneGraph(vertices, edges)].slice(-100));
    setRedoStack(redoStack.slice(0, -1));
    setVertices(next.vertices);
    setEdges(next.edges);
    setSelectedVertexId(null);
    setPendingEdge(null);
    setPendingEdgePath(null);
  };

  // --- ALGORITHM LOCK ---
  const enforceIdleMode = () => {
    if (refinementFailureInfo) { return false; }
    if (algoMode !== 'idle') { setError('Please exit the BFS algorithm first.'); return false; }
    if (forceAlgoMode !== 'idle') { setError('Please exit the Force Directed algorithm first.'); return false; }
    if (refinementAlgoMode !== 'idle') { setError('Please exit the Refinement algorithm first.'); return false; }
    return true;
  };

  // --- EXIT HANDLERS ---
  const handleExitBfs = () => {
    setAlgoMode('idle'); setAlgoHistory([]); setActiveAlgoPanel('none');
  };

  const handleExitForceAlgo = () => {
    if (forceHistory.length > 0) commitGraphChange(forceHistory[forceStep], edges);
    setForceAlgoMode('idle'); setForceHistory([]); setForceStep(0); setActiveAlgoPanel('none');
  };

  const finishExitRefinement = (choice) => {
    if (choice === 'new') {
      const finalState = refinementHistory[refinementStep];
      const flat = flattenRefinedGraph(vertices, edges, finalState);
      commitGraphChange(flat.vertices, flat.edges);
      setLockedCanvas(
        graphExceedsDefaultCanvas(flat.vertices, flat.edges)
          ? getGraphCanvasDimensions(flat.vertices, flat.edges, { fitCanvas: true })
          : null
      );
    }
    setExitRefinementChoice(false);
    setRefinementFailureInfo(null);
    setRefinementAlgoMode('idle'); setRefinementHistory([]); setRefinementStep(0); setActiveAlgoPanel('none');
  };

  // --- KEYBOARD SHORTCUTS FOR DRAWING CANCEL / UNDO ---
  const handleCancelEdge = () => {
    setPendingEdgePath(null);
    setError('');
  };

  const handleUndoBend = () => {
    if (pendingEdgePath) {
      if (pendingEdgePath.points.length > 0) {
        setPendingEdgePath({ ...pendingEdgePath, points: pendingEdgePath.points.slice(0, -1) });
        setError('');
      } else {
        setPendingEdgePath(null);
        setError('');
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      const isModifierPressed = e.ctrlKey || e.metaKey;
      if (isModifierPressed && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redoGraphChange();
        else undoGraphChange();
        return;
      }
      if (isModifierPressed && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redoGraphChange();
        return;
      }
      if (isOrthogonalMode && pendingEdgePath) {
        if (e.key === 'Escape') handleCancelEdge();
        else if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') handleUndoBend();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOrthogonalMode, pendingEdgePath, undoStack, redoStack, vertices, edges,
    algoMode, forceAlgoMode, refinementAlgoMode, refinementFailureInfo,
  ]);

  // --- ALGORITHM PANEL SELECTORS ---
  const handleSelectBfs = () => {
    setActiveAlgoPanel('bfs');
  };

  const handleSelectForce = () => {
    if (vertices.length < 2) {
      setError('Force Directed Algorithm requires at least 2 vertices to simulate forces.');
      return;
    }
    setActiveAlgoPanel('force');
    setForceAlgoMode('config'); 
    setMode('draw');
  };

  const handleSelectRefinement = () => {
    if (vertices.length === 0) {
      setError('Cannot run on an empty graph.');
      return;
    }
    setActiveAlgoPanel('refinement');
    setPendingEdgePath(null);
    setRefinementFailureInfo(null);
    try {
      const result = runRefinement(vertices, edges);
      setRefinementHistory(result.history);
      setRefinementStep(0);
      setRefinementAlgoMode('paused'); 
      setMode('draw');
      setError('');
    } catch (err) {
      if (err.failureType === 'projection') {
        setRefinementFailureInfo({ message: err.message, edges: err.failureEdges || [], state: err.failureState || null });
      } else {
        setError('Refinement Error: ' + err.message);
      }
      setActiveAlgoPanel('none');
    }
  };

  // --- ALGORITHM RUNNERS ---
  const runBfsHandler = () => {
    if (!enforceIdleMode()) return;
    const startId = parseInt(bfsStartNode, 10);
    try {
      const history = runBFS(vertices, edges, startId);
      setAlgoHistory(history); setAlgoStep(0); setAlgoMode('paused');
    } catch (err) { setError(err.message); }
  };
  useBfsPlayback(algoMode, algoHistory, setAlgoStep, setAlgoMode);

  const runForceLayoutHandler = () => {
    const history = runForceLayout(vertices, edges, forceConfig);
    setForceHistory(history); setForceStep(0); setForceAlgoMode('paused');
  };
  useForcePlayback(forceAlgoMode, forceHistory, setForceStep, setForceAlgoMode);

  useRefinementPlayback(refinementAlgoMode, refinementHistory, setRefinementStep, setRefinementAlgoMode);

  const currentRefinementState = refinementHistory[refinementStep] || null;
  const refinementDisplayState = refinementFailureInfo
    ? {
        ...(refinementFailureInfo.state || { dummyVertices: [], extendEdges: [], borderEdges: [] }),
        traversal: [],
        failureEdges: refinementFailureInfo.edges,
        showBoundingBox: false,
        activeCorner: null,
        highlightEdge: null,
        rayPreview: null,
        frontRepairEdge: null,
      }
    : currentRefinementState;
  const defaultCanvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, offsetX: 0, offsetY: 0 };
  const activeLockedCanvas = lockedCanvas && graphExceedsDefaultCanvas(vertices, edges) ? lockedCanvas : null;
  const canvasDimensions =
    refinementDisplayState && refinementDisplayState.fitCanvas
      ? getGraphCanvasDimensions(vertices, edges, refinementDisplayState)
      : activeLockedCanvas || getGraphCanvasDimensions(vertices, edges, refinementDisplayState);
  const sideCanvas = activeLockedCanvas || defaultCanvas;

  const handleExitRefinementRequest = () => {
    setRefinementAlgoMode('paused');
    setExitRefinementChoice(true);
  };

  const handleToggleWeighted = (weighted) => {
    if (!enforceIdleMode()) return;
    setIsWeighted(weighted);
    if (!weighted) {
      commitGraphChange(vertices, edges.map((e) => ({ ...e, weight: 1 })));
      if (mode === 'editWeight') setMode('draw');
    }
  };

  // --- LIVE SYNC: GRAPH TO TEXT ---
  useEffect(() => {
    if (vertices.length === 0) {
      setMatrixInput(''); setListInput('');
      return;
    }
    const sortedVertices = [...vertices].sort((a, b) => a.id - b.id);
    const nodeIds = sortedVertices.map((v) => v.id);
    setListInput(buildAdjacencyListText(nodeIds, edges, isWeighted));
    setMatrixInput(buildAdjacencyMatrixText(nodeIds, edges, isWeighted));
  }, [vertices, edges, isWeighted]);

  // --- DUAL RENDER ENGINE ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvasDimensions.offsetX, canvasDimensions.offsetY);

      const currentAlgoState = algoHistory[algoStep] || null;

      const showGrid = isOrthogonalMode || refinementAlgoMode !== 'idle';
      const gridBounds = {
        minX: -canvasDimensions.offsetX,
        minY: -canvasDimensions.offsetY,
        maxX: canvas.width - canvasDimensions.offsetX,
        maxY: canvas.height - canvasDimensions.offsetY,
      };
      if (showGrid) {
        drawGrid(ctx, canvas.width, canvas.height, GRID_SIZE, gridBounds, canvas.width / CANVAS_WIDTH);
      }

      if ((refinementAlgoMode !== 'idle' && currentRefinementState) || refinementFailureInfo) {
        drawRefinementMainCanvas(ctx, vertices, edges, refinementDisplayState);
      } else if (algoMode !== 'idle' && currentAlgoState) {
        drawBfsMainCanvas(ctx, vertices, currentAlgoState);
      } else {
        let renderVertices = vertices;
        if (forceAlgoMode !== 'idle' && forceAlgoMode !== 'config' && forceHistory.length > 0) {
          renderVertices = forceHistory[forceStep];
        }
        drawGraph(ctx, renderVertices, edges, { mode, isWeighted, selectedVertexId });

        if (pendingEdgePath) {
          const startVertex = vertices.find((v) => v.id === pendingEdgePath.startId);
          if (startVertex) {
            const chain = [startVertex, ...pendingEdgePath.points];
            ctx.save();
            ctx.strokeStyle = '#0a84ff';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            for (let i = 0; i < chain.length - 1; i++) {
              ctx.beginPath();
              ctx.moveTo(chain[i].x, chain[i].y);
              ctx.lineTo(chain[i + 1].x, chain[i + 1].y);
              ctx.stroke();
            }
            ctx.restore();
            chain.forEach((pt, i) => {
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, i === 0 ? VERTEX_RADIUS : 5, 0, 2 * Math.PI);
              ctx.fillStyle = '#0a84ff';
              ctx.fill();
            });
          }
        }
      }
      if (showGrid && isGridHoverOn && hoverPoint) {
        drawGridHover(ctx, hoverPoint, gridBounds, canvas.width / CANVAS_WIDTH);
      }
      ctx.restore();
    }

    const rightCanvas = rightCanvasRef.current;
    if (rightCanvas && algoMode !== 'idle') {
      const rightCtx = rightCanvas.getContext('2d');
      rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
      const currentAlgoState = algoHistory[algoStep] || null;
      rightCtx.save();
      rightCtx.translate(sideCanvas.offsetX, sideCanvas.offsetY);
      drawBfsOriginalCanvas(rightCtx, vertices, edges, currentAlgoState, isWeighted);
      rightCtx.restore();
    }

    const refCanvas = refinementCanvasRef.current;
    if (refCanvas && refinementAlgoMode !== 'idle') {
      const refCtx = refCanvas.getContext('2d');
      refCtx.clearRect(0, 0, refCanvas.width, refCanvas.height);
      refCtx.save();
      refCtx.translate(sideCanvas.offsetX, sideCanvas.offsetY);
      drawRefinementOriginalCanvas(refCtx, vertices, edges);
      refCtx.restore();
    }
  }, [
    vertices, edges, selectedVertexId, mode, isWeighted,
    algoHistory, algoStep, algoMode,
    forceAlgoMode, forceHistory, forceStep,
    isOrthogonalMode, pendingEdgePath,
    refinementAlgoMode, refinementHistory, refinementStep,
    refinementFailureInfo, hoverPoint, isGridHoverOn,
    canvasDimensions.width, canvasDimensions.height,
    canvasDimensions.offsetX, canvasDimensions.offsetY,
    sideCanvas.width, sideCanvas.height, sideCanvas.offsetX, sideCanvas.offsetY,
  ]);

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !isGridHoverOn || !(isOrthogonalMode || refinementAlgoMode !== 'idle')) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width) - canvasDimensions.offsetX;
    const y = (e.clientY - rect.top) * (canvas.height / rect.height) - canvasDimensions.offsetY;
    const snapped = snapToGrid(x, y);
    setHoverPoint((prev) => (prev && prev.x === snapped.x && prev.y === snapped.y ? prev : snapped));
  };

  const handleCanvasClick = (e) => {
    if (pendingEdge) return;
    if (!enforceIdleMode()) return;

    setError('');
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const x = canvasX - canvasDimensions.offsetX;
    const y = canvasY - canvasDimensions.offsetY;

    const clickedVertex = vertices.find((v) => {
      const distance = Math.sqrt(Math.pow(v.x - x, 2) + Math.pow(v.y - y, 2));
      return distance <= VERTEX_RADIUS;
    });

    if (mode === 'deleteNode') {
      if (clickedVertex) {
        commitGraphChange(
          vertices.filter((v) => v.id !== clickedVertex.id),
          edges.filter((edge) => edge.source !== clickedVertex.id && edge.target !== clickedVertex.id)
        );
      }
      return;
    }

    const distanceToEdge = (edge) => {
      const src = vertices.find((v) => v.id === edge.source);
      const tgt = vertices.find((v) => v.id === edge.target);
      if (!src || !tgt) return Infinity;
      const chain = [src, ...(edge.bends || []), tgt];
      let min = Infinity;
      for (let i = 0; i < chain.length - 1; i++) {
        const d = pointToSegmentDistance(x, y, chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y);
        if (d < min) min = d;
      }
      return min;
    };

    if (mode === 'deleteEdge') {
      let edgeToRemove = null;
      for (let edge of edges) {
        if (distanceToEdge(edge) < 12) {
          edgeToRemove = edge;
          break;
        }
      }
      if (edgeToRemove) {
        commitGraphChange(vertices, edges.filter((e) => e !== edgeToRemove));
      }
      return;
    }

    if (mode === 'editWeight') {
      let edgeToEdit = null;
      for (let edge of edges) {
        if (distanceToEdge(edge) < 12) {
          edgeToEdit = edge;
          break;
        }
      }
      if (edgeToEdit) {
        setPendingEdge({ source: edgeToEdit.source, target: edgeToEdit.target, isEdit: true, bends: edgeToEdit.bends || [] });
        setWeightInputVal(edgeToEdit.weight !== undefined ? edgeToEdit.weight.toString() : '1');
      }
      return;
    }

    if (isOrthogonalMode && mode === 'draw') {
      handleOrthogonalDrawClick(x, y);
      return;
    }

    if (clickedVertex) {
      if (selectedVertexId === null) {
        setSelectedVertexId(clickedVertex.id);
      } else {
        if (selectedVertexId !== clickedVertex.id) {
          const edgeExists = edges.some(
            (e) =>
              (e.source === selectedVertexId && e.target === clickedVertex.id) ||
              (e.source === clickedVertex.id && e.target === selectedVertexId)
          );
          if (!edgeExists) {
            if (isWeighted) {
              setPendingEdge({ source: selectedVertexId, target: clickedVertex.id });
              setWeightInputVal('');
            } else {
              commitGraphChange(vertices, [...edges, { source: selectedVertexId, target: clickedVertex.id, weight: 1 }]);
            }
          }
        }
        setSelectedVertexId(null);
      }
    } else {
      const existingIds = vertices.map((v) => v.id).sort((a, b) => a - b);
      let newId = 1;
      for (let i = 0; i < existingIds.length; i++) {
        if (existingIds[i] === newId) newId++;
        else break;
      }
      const newVertices = [...vertices, { id: newId, x, y }].sort((a, b) => a.id - b.id);
      commitGraphChange(newVertices, edges);
      setSelectedVertexId(null);
    }
  };

  const handleOrthogonalDrawClick = (rawX, rawY) => {
    const { x, y } = snapToGrid(rawX, rawY);
    const findNearVertex = (px, py) =>
      vertices.find((v) => Math.sqrt((v.x - px) ** 2 + (v.y - py) ** 2) <= VERTEX_RADIUS);
    const clickedVertex = findNearVertex(x, y);

    if (!pendingEdgePath) {
      if (clickedVertex) {
        setPendingEdgePath({ startId: clickedVertex.id, points: [] });
      } else {
        const existingIds = vertices.map((v) => v.id).sort((a, b) => a - b);
        let newId = 1;
        for (let i = 0; i < existingIds.length; i++) {
          if (existingIds[i] === newId) newId++;
          else break;
        }
        commitGraphChange([...vertices, { id: newId, x, y }].sort((a, b) => a.id - b.id), edges);
      }
      return;
    }

    const startVertex = vertices.find((v) => v.id === pendingEdgePath.startId);
    const lastPoint = pendingEdgePath.points.length > 0
      ? pendingEdgePath.points[pendingEdgePath.points.length - 1]
      : { x: startVertex.x, y: startVertex.y };

    if (clickedVertex && clickedVertex.id === pendingEdgePath.startId && pendingEdgePath.points.length === 0) {
      setPendingEdgePath(null);
      return;
    }

    const targetPoint = clickedVertex ? { x: clickedVertex.x, y: clickedVertex.y } : { x, y };

    const conflict = checkOrthogonalSegment(
      lastPoint,
      targetPoint,
      vertices,
      edges,
      [{ x: startVertex.x, y: startVertex.y }, ...pendingEdgePath.points]
    );
    if (conflict) {
      setError(conflict);
      return;
    }

    if (clickedVertex && clickedVertex.id !== pendingEdgePath.startId) {
      const edgeExists = edges.some(
        (e) =>
          (e.source === pendingEdgePath.startId && e.target === clickedVertex.id) ||
          (e.source === clickedVertex.id && e.target === pendingEdgePath.startId)
      );
      if (edgeExists) {
        setError('An edge already connects these two vertices.');
        return;
      }
      const bends = pendingEdgePath.points;
      if (isWeighted) {
        setPendingEdge({ source: pendingEdgePath.startId, target: clickedVertex.id, bends });
        setWeightInputVal('');
      } else {
        commitGraphChange(vertices, [...edges, { source: pendingEdgePath.startId, target: clickedVertex.id, weight: 1, bends }]);
        setPendingEdgePath(null);
      }
      return;
    }

    if (clickedVertex) {
      setError('Cannot route a bend through an existing vertex — pick an empty grid point.');
      return;
    }

    setPendingEdgePath({ ...pendingEdgePath, points: [...pendingEdgePath.points, targetPoint] });
  };

  const handleSaveWeight = () => {
    if (String(weightInputVal).includes('.')) { setError('Decimal weight not possible.'); return; }
    const w = parseInt(weightInputVal, 10);
    if (!isNaN(w)) {
      if (w === 0) { setError('0 weight not possible.'); return; }
      if (pendingEdge.isEdit) {
        commitGraphChange(vertices, edges.map((e) => {
          if ((e.source === pendingEdge.source && e.target === pendingEdge.target) || (e.source === pendingEdge.target && e.target === pendingEdge.source)) {
            return { ...e, weight: w };
          }
          return e;
        }));
      } else {
        commitGraphChange(vertices, [...edges, { source: pendingEdge.source, target: pendingEdge.target, weight: w, bends: pendingEdge.bends || [] }]);
      }
    } else {
      if (pendingEdge.isEdit) {
        commitGraphChange(vertices, edges.map((e) => {
          if ((e.source === pendingEdge.source && e.target === pendingEdge.target) || (e.source === pendingEdge.target && e.target === pendingEdge.source)) {
            return { ...e, weight: 1 };
          }
          return e;
        }));
      } else {
        commitGraphChange(vertices, [...edges, { source: pendingEdge.source, target: pendingEdge.target, weight: 1, bends: pendingEdge.bends || [] }]);
      }
    }
    setPendingEdge(null); setPendingEdgePath(null);
  };

  const handleFileUpload = (e, setInputState) => {
    if (!enforceIdleMode()) { e.target.value = null; return; }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => { setInputState(event.target.result); setError(''); };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleExport = (content, filename) => {
    if (!content.trim()) { setError(`Cannot download an empty ${filename}.`); return; }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url); setError('');
  };

  const handleExportBFSTree = (format) => {
    const finalState = algoHistory[algoHistory.length - 1];
    if (!finalState) return;
    const treeNodes = Array.from(finalState.discovered).sort((a, b) => a - b);
    const treeEdges = finalState.treeEdges;
    if (format === 'list') {
      handleExport(buildAdjacencyListText(treeNodes, treeEdges, isWeighted), 'bfs_tree_list.txt');
    } else if (format === 'matrix') {
      handleExport(buildAdjacencyMatrixText(treeNodes, treeEdges, isWeighted), 'bfs_tree_matrix.txt');
    }
  };

  const getMappingText = () => {
    if (vertices.length === 0) return '';
    const ids = vertices.map((v) => v.id).sort((a, b) => a - b);
    if (ids.length <= 5) return `[${ids.join(', ')}]`;
    return `[${ids.slice(0, 5).join(', ')}, ...]`;
  };

  const handleMatrixSubmit = () => {
    if (!enforceIdleMode()) return;
    try {
      const { nodeIds, edges: newEdges } = parseMatrixInput(matrixInput);
      commitGraphChange(generateCircularLayout(nodeIds), newEdges);
      setSelectedVertexId(null); setMode('draw'); setError('');
    } catch (err) { setError('Matrix Error: ' + err.message); }
  };

  const handleListSubmit = () => {
    if (!enforceIdleMode()) return;
    try {
      const { nodeIds, edges: newEdges } = parseListInput(listInput);
      commitGraphChange(generateCircularLayout(nodeIds), newEdges);
      setSelectedVertexId(null); setMode('draw'); setError('');
    } catch (err) { setError('List Error: ' + err.message); }
  };

  const handleClear = () => {
    if (!enforceIdleMode()) return;
    commitGraphChange([], []); setSelectedVertexId(null);
    setMatrixInput(''); setListInput(''); setError('');
    setAlgoMode('idle'); setAlgoHistory([]); setAlgoStep(0);
    setForceAlgoMode('idle'); setForceHistory([]); setForceStep(0);
    setRefinementAlgoMode('idle'); setRefinementHistory([]); setRefinementStep(0);
    setRefinementFailureInfo(null);
    setPendingEdgePath(null); setActiveAlgoPanel('none');
    setLockedCanvas(null);
  };

  const styles = {
    container: { display: 'flex', flexWrap: 'nowrap', gap: '20px', padding: '40px', boxSizing: 'border-box', width: 'max-content', minWidth: '100%', fontFamily: '"Segoe UI", Roboto, sans-serif', backgroundColor: '#0f172a', color: '#eaeaea', minHeight: '100vh', justifyContent: 'flex-start', alignItems: 'flex-start', position: 'relative' },
    leftToolbar: { display: 'flex', flex: '0 0 150px', width: '180px', boxSizing: 'border-box', flexDirection: 'column', gap: '10px', justifyContent: 'flex-start' },
    algoPanel: { backgroundColor: '#1e293b', border: '2px solid #0a84ff', padding: '15px', borderRadius: '12px', marginTop: '10px', boxShadow: '0 4px 12px rgba(10, 132, 255, 0.2)' },
    toggleContainer: { backgroundColor: '#1e293b', borderRadius: '8px', padding: '5px', display: 'flex', gap: '5px', marginBottom: '5px', border: '1px solid #334155' },
    btnToggle: (isActive) => ({ flex: 1, padding: '10px', backgroundColor: isActive ? '#0a84ff' : 'transparent', color: isActive ? '#fff' : '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }),
    btnTool: (isActive) => ({ backgroundColor: isActive ? '#34c759' : '#1e293b', color: '#fff', border: isActive ? '2px solid #28a745' : '1px solid #334155', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', boxShadow: isActive ? '0 0 10px rgba(52, 199, 89, 0.4)' : 'none' }),
    btnDanger: { backgroundColor: '#ff3b30', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' },
    mainArea: { display: 'flex', flex: `0 0 ${CANVAS_WIDTH}px`, width: `${CANVAS_WIDTH}px`, minWidth: `${CANVAS_WIDTH}px`, flexDirection: 'column' },
    title: { margin: '0 0 5px 0', fontSize: '28px', color: '#ffffff' },
    subtitle: { margin: '0 0 20px 0', color: '#94a3b8', fontSize: '15px' },
    canvas: { width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, display: 'block', border: 'none', borderRadius: '12px', cursor: (algoMode !== 'idle' || forceAlgoMode !== 'idle' || refinementAlgoMode !== 'idle') ? 'not-allowed' : (mode === 'draw' ? 'crosshair' : 'pointer'), backgroundColor: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },

    statusBox: { width: '100%', minWidth: 0, boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '15px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '80px', overflowWrap: 'anywhere' },
    queuePill: { backgroundColor: '#34d399', color: '#0f172a', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', display: 'inline-block', marginRight: '5px' },
    activePill: { backgroundColor: '#ff9f0a', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', display: 'inline-block' },

    rightCol: { display: 'flex', flex: `0 0 ${(algoMode === 'idle' && forceAlgoMode === 'idle' && refinementAlgoMode === 'idle') ? 420 : 500}px`, flexDirection: 'column', gap: '25px', width: (algoMode === 'idle' && forceAlgoMode === 'idle' && refinementAlgoMode === 'idle') ? '420px' : '500px', minWidth: (algoMode === 'idle' && forceAlgoMode === 'idle' && refinementAlgoMode === 'idle') ? '420px' : '500px', maxWidth: (algoMode === 'idle' && forceAlgoMode === 'idle' && refinementAlgoMode === 'idle') ? '420px' : '500px', transition: 'all 0.3s ease' },
    panel: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', position: 'relative' },
    panelTitle: { margin: '0 0 5px 0', fontSize: '18px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' },

    textArea: { width: '100%', backgroundColor: '#0f172a', color: '#34d399', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '15px', resize: 'vertical', marginBottom: '15px', boxSizing: 'border-box', fontWeight: '500', whiteSpace: 'pre', overflowX: 'auto' },

    btnPrimary: { backgroundColor: '#0a84ff', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: '15px', transition: 'all 0.2s' },
    btnAction: { backgroundColor: '#334155', color: '#fff', border: '1px solid #475569', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', width: '100%' },

    fileBtnCluster: { display: 'flex', gap: '8px', alignItems: 'center', position: 'absolute', top: '25px', right: '25px' },
    btnFile: { backgroundColor: '#334155', color: '#fff', border: '1px solid #475569', padding: '0 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', whiteSpace: 'nowrap', gap: '6px' },
    hiddenInput: { display: 'none' },

    headerRow: { marginBottom: '15px', paddingRight: '150px' },
    mappingLabel: { fontSize: '12px', color: '#94a3b8', marginTop: '4px', display: 'block' },

    modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    errorBox: { backgroundColor: '#ff3b30', color: '#fff', padding: '30px 40px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', maxWidth: '500px', textAlign: 'center', border: '2px solid #ff453a' },
    weightBox: { backgroundColor: '#1e293b', color: '#fff', padding: '30px 40px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', textAlign: 'center', border: '1px solid #334155' },
    modalTitle: { margin: '0 0 15px 0', fontSize: '20px' },
    weightInput: { width: '100px', padding: '10px', fontSize: '18px', textAlign: 'center', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#fff', marginBottom: '15px' },
  };

  const currentAlgoState = algoHistory[algoStep] || null;

  return (
    <div style={styles.container}>
      {error && (
        <div style={{ ...styles.modalOverlay, zIndex: 2000, cursor: 'pointer' }} onClick={() => setError('')}>
          <div style={styles.errorBox}>
            <h3 style={{ ...styles.modalTitle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>⚠️ Input Error</h3>
            <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>{error}</p>
            <p style={{ margin: '20px 0 0 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Click anywhere to dismiss</p>
          </div>
        </div>
      )}

      {refinementFailureInfo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '500px',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 2000,
            cursor: 'pointer',
          }}
          onClick={() => setRefinementFailureInfo(null)}
        >
          <div style={{ ...styles.errorBox, width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ ...styles.modalTitle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>⚠️ Refinement Error</h3>
            <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>{refinementFailureInfo.message}</p>
            {refinementFailureInfo.edges.some((e) => e && e.segment) && (
              <div style={{ marginTop: '14px', fontSize: '13px', lineHeight: '1.6', textAlign: 'left', display: 'inline-block' }}>
                <div><span style={{ display: 'inline-block', width: '22px', height: '6px', backgroundColor: '#f59e0b', marginRight: '8px', verticalAlign: 'middle', border: '1px solid #fff' }}></span>e′ — the edge being extended</div>
                <div><span style={{ display: 'inline-block', width: '22px', height: '6px', backgroundColor: '#dc2626', marginRight: '8px', verticalAlign: 'middle', border: '1px solid #fff' }}></span>front(e) — the edge it could not safely reach</div>
                {refinementFailureInfo.state && (
                  <div style={{ opacity: 0.85, marginTop: '4px' }}>Graph shown as it was when the algorithm got stuck (earlier shifts included).</div>
                )}
              </div>
            )}
            <p style={{ margin: '20px 0 0 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Click anywhere to dismiss</p>
          </div>
        </div>
      )}

      {pendingEdge && (
        <div style={styles.modalOverlay}>
          <div style={styles.weightBox}>
            <h3 style={styles.modalTitle}>Enter Edge Weight</h3>
            <p style={{ marginBottom: '15px', color: '#94a3b8', fontSize: '14px' }}>
              {pendingEdge.isEdit ? 'Editing Edge from ' : 'Connecting '} Node {pendingEdge.source} to Node {pendingEdge.target}
            </p>
            <input type="number" autoFocus style={styles.weightInput} value={weightInputVal} onChange={(e) => setWeightInputVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveWeight()} />
            <br />
            <button onClick={handleSaveWeight} style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 30px' }}>Save Weight</button>
          </div>
        </div>
      )}

      {/* --- LEFT TOOLBAR --- */}
      <div style={styles.leftToolbar}>
        
        <div style={styles.toggleContainer}>
          <button style={styles.btnToggle(!isWeighted)} onClick={() => handleToggleWeighted(false)}>Unweighted</button>
          <button style={styles.btnToggle(isWeighted)} onClick={() => handleToggleWeighted(true)}>Weighted</button>
        </div>

        <button
          onClick={() => { if (enforceIdleMode()) { setIsOrthogonalMode(!isOrthogonalMode); setPendingEdgePath(null); } }}
          style={{ ...styles.btnTool(isOrthogonalMode), marginBottom: '5px' }}
          disabled={activeAlgoPanel !== 'none' && activeAlgoPanel !== 'refinement'}
        >
          {isOrthogonalMode ? '📐 Orthogonal: ON' : '📐 Orthogonal: OFF'}
        </button>

        <button
          onClick={() => { setIsGridHoverOn(!isGridHoverOn); setHoverPoint(null); }}
          style={{ ...styles.btnTool(isGridHoverOn), marginBottom: '5px' }}
          title="Highlight the X / Y coordinates of the grid point under the cursor (shown when the grid is visible)"
        >
          {isGridHoverOn ? '🎯 Grid Hover: ON' : '🎯 Grid Hover: OFF'}
        </button>

        {/* Undo/Cancel Edge Drawing Controls UI */}
        {isOrthogonalMode && pendingEdgePath && (
          <div style={{ ...styles.toggleContainer, flexDirection: 'column', gap: '5px', padding: '10px' }}>
            <span style={{ fontSize: '12px', color: '#ff9f0a', textAlign: 'center', fontWeight: 'bold' }}>Drawing Edge...</span>
            <button style={{ ...styles.btnAction, padding: '8px' }} onClick={handleUndoBend}>↩️ Undo Bend</button>
            <button style={{ ...styles.btnAction, padding: '8px' }} onClick={handleCancelEdge}>❌ Cancel Edge</button>
          </div>
        )}

        <button style={styles.btnTool(mode === 'draw')} onClick={() => { if (enforceIdleMode()) setMode('draw'); }}>✏️ Draw</button>
        <button style={styles.btnTool(mode === 'deleteNode')} onClick={() => { if (enforceIdleMode()) setMode('deleteNode'); }}>🗑️ Del Vertex</button>
        <button style={styles.btnTool(mode === 'deleteEdge')} onClick={() => { if (enforceIdleMode()) setMode('deleteEdge'); }}>✂️ Del Edge</button>

        {isWeighted && (
          <button style={styles.btnTool(mode === 'editWeight')} onClick={() => { if (enforceIdleMode()) setMode('editWeight'); }}>✍️ Edit Weight</button>
        )}

        <button onClick={handleClear} style={styles.btnDanger}>❌ Clear Data</button>

        {/* --- Algorithms Selector Container --- */}
        {activeAlgoPanel === 'none' && (
          <div style={{ ...styles.toggleContainer, flexDirection: 'column', gap: '5px', padding: '10px', marginTop: '15px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', fontWeight: 'bold' }}>Algorithms</span>
            <button style={{ ...styles.btnAction, padding: '10px' }} onClick={handleSelectBfs}>BFS Tree</button>
            <button style={{ ...styles.btnAction, padding: '10px' }} onClick={handleSelectForce}>Force Layout</button>
            <button style={{ ...styles.btnAction, padding: '10px' }} onClick={handleSelectRefinement}>Refinement</button>
          </div>
        )}

        {/* Conditionally render individual algorithm controls */}
        {activeAlgoPanel === 'force' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {forceAlgoMode === 'config' && (
              <button style={{ ...styles.btnAction, backgroundColor: '#475569', marginBottom: '5px' }} onClick={() => { setForceAlgoMode('idle'); setActiveAlgoPanel('none'); }}>
                ← Back to Algorithms
              </button>
            )}
            <ForceDirectedControls
              forceAlgoMode={forceAlgoMode} setForceAlgoMode={setForceAlgoMode} forceConfig={forceConfig} setForceConfig={setForceConfig}
              forceStep={forceStep} setForceStep={setForceStep} forceHistory={forceHistory} jumpSize={jumpSize} setJumpSize={setJumpSize}
              onLaunch={handleSelectForce} onRunForceLayout={runForceLayoutHandler} onExitForceAlgo={handleExitForceAlgo} styles={styles}
            />
          </div>
        )}

        {activeAlgoPanel === 'bfs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {algoMode === 'idle' && (
              <button style={{ ...styles.btnAction, backgroundColor: '#475569', marginBottom: '5px' }} onClick={() => setActiveAlgoPanel('none')}>
                ← Back to Algorithms
              </button>
            )}
            <BfsControls
              algoMode={algoMode} setAlgoMode={setAlgoMode} bfsStartNode={bfsStartNode} setBfsStartNode={setBfsStartNode}
              algoStep={algoStep} setAlgoStep={setAlgoStep} algoHistory={algoHistory} setAlgoHistory={setAlgoHistory}
              onRunBfs={runBfsHandler} onExit={handleExitBfs} styles={styles}
            />
          </div>
        )}

        {activeAlgoPanel === 'refinement' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <RefinementControls
              refinementAlgoMode={refinementAlgoMode} setRefinementAlgoMode={setRefinementAlgoMode}
              refinementStep={refinementStep} setRefinementStep={setRefinementStep} refinementHistory={refinementHistory}
              onLaunch={handleSelectRefinement} onExit={handleExitRefinementRequest} styles={styles}
            />
          </div>
        )}
      </div>

      <div style={styles.mainArea}>
        <h2 style={styles.title}>
          {refinementAlgoMode !== 'idle' ? 'Refinement Algorithm' : algoMode === 'idle' ? (forceAlgoMode !== 'idle' ? 'Force Layout Playground' : 'Graph Drawing Simulator') : 'BFS Tree Generation'}
        </h2>
        <p style={styles.subtitle}>
          {refinementAlgoMode !== 'idle' ? 'Algorithm Visualization Active. Interactive editing disabled.' : (
            algoMode !== 'idle' ? 'Algorithm Visualization Active. Interactive editing disabled.' : (
              forceAlgoMode !== 'idle' ? 'Force simulation active. Adjust playback on the left.' : (
                <>
                  {mode === 'draw' && !isOrthogonalMode && 'Tap space to draw vertex. Tap two sequentially for edge.'}
                  {mode === 'draw' && isOrthogonalMode && !pendingEdgePath && 'Orthogonal Mode: tap empty grid point for vertex, or tap vertex to start an edge.'}
                  {mode === 'draw' && isOrthogonalMode && pendingEdgePath && 'Tap to bend. Use (Backspace) to undo a bend, (Esc) to cancel edge.'}
                  {mode === 'deleteNode' && 'Tap any vertex to permanently delete it and its edges.'}
                  {mode === 'deleteEdge' && 'Tap directly on any line to cut that edge.'}
                  {mode === 'editWeight' && "Tap directly on any edge's line to edit its weight."}
                </>
              )
            )
          )}
        </p>

        <canvas ref={canvasRef} width={canvasDimensions.width} height={canvasDimensions.height} onClick={handleCanvasClick} onMouseMove={handleCanvasMouseMove} onMouseLeave={() => setHoverPoint(null)} style={styles.canvas} />

        <BfsStatusBox algoMode={algoMode} currentAlgoState={currentAlgoState} onExportBfsTree={handleExportBFSTree} styles={styles} />
        <RefinementStatusBox refinementAlgoMode={refinementAlgoMode} currentState={refinementHistory[refinementStep] || null} styles={styles} />
      </div>

      <div style={styles.rightCol}>
        <div style={{ display: (algoMode === 'idle' && forceAlgoMode === 'idle' && refinementAlgoMode === 'idle') ? 'flex' : 'none', flexDirection: 'column', gap: '25px' }}>
          <div style={styles.panel}>
            <div style={styles.headerRow}>
              <div>
                <h3 style={styles.panelTitle}>Adjacency Matrix</h3>
                {vertices.length > 0 && (
                  <span style={styles.mappingLabel}>
                    Rows/Cols map to IDs: <strong>{getMappingText()}</strong>
                  </span>
                )}
              </div>
              <div style={styles.fileBtnCluster}>
                <input type="file" id="matrix-upload" accept=".txt" onChange={(e) => handleFileUpload(e, setMatrixInput)} style={styles.hiddenInput} />
                <label htmlFor="matrix-upload" style={styles.btnFile}>📁 Upload</label>
                <button onClick={() => handleExport(matrixInput, 'adjacency_matrix.txt')} style={styles.btnFile}>💾 Download</button>
              </div>
            </div>
            <textarea rows={6} style={styles.textArea} value={matrixInput} onChange={(e) => setMatrixInput(e.target.value)} placeholder={isWeighted ? '0 5 12\n5 0 0\n12 0 0' : '0 1 1\n1 0 0\n1 0 0'} />
            <button onClick={handleMatrixSubmit} style={styles.btnPrimary}>Draw from Matrix</button>
          </div>

          <div style={styles.panel}>
            <div style={styles.headerRow}>
              <div>
                <h3 style={styles.panelTitle}>Adjacency List</h3>
              </div>
              <div style={styles.fileBtnCluster}>
                <input type="file" id="list-upload" accept=".txt" onChange={(e) => handleFileUpload(e, setListInput)} style={styles.hiddenInput} />
                <label htmlFor="list-upload" style={styles.btnFile}>📁 Upload</label>
                <button onClick={() => handleExport(listInput, 'adjacency_list.txt')} style={styles.btnFile}>💾 Download</button>
              </div>
            </div>
            <textarea rows={6} style={styles.textArea} value={listInput} onChange={(e) => setListInput(e.target.value)} placeholder={isWeighted ? '1: 2(5), 3(12)\n2: 1(5)\n3: 1(12)' : '1: 2, 3\n2: 1\n3: 1'} />
            <button onClick={handleListSubmit} style={styles.btnPrimary}>Draw from List</button>
          </div>
        </div>

        <div style={{ display: algoMode !== 'idle' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <BfsOriginalGraphPanel rightCanvasRef={rightCanvasRef} canvasWidth={sideCanvas.width} canvasHeight={sideCanvas.height} styles={styles} />
        </div>

        <div style={{ display: forceAlgoMode !== 'idle' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <ForceReferencePanel styles={styles} />
        </div>

        <div style={{ display: refinementAlgoMode !== 'idle' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <RefinementOriginalGraphPanel rightCanvasRef={refinementCanvasRef} canvasWidth={sideCanvas.width} canvasHeight={sideCanvas.height} styles={styles} />
        </div>
      </div>

      {exitRefinementChoice && (
        <div style={styles.modalOverlay}>
          <div style={styles.weightBox}>
            <h3 style={styles.modalTitle}>Exit Refinement</h3>
            <p style={{ marginBottom: '20px', color: '#94a3b8', fontSize: '14px' }}>
              What should the main canvas hold afterward?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => finishExitRefinement('new')} style={{ ...styles.btnPrimary, backgroundColor: '#34c759' }}>
                Copy the refined graph (dummy vertices + extend edges)
              </button>
              <button onClick={() => finishExitRefinement('original')} style={styles.btnAction}>
                Keep the original graph as-is
              </button>
              <button onClick={() => setExitRefinementChoice(false)} style={{ ...styles.btnAction, backgroundColor: '#334155' }}>
                Cancel — go back to playback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphCanvas;