import React, { useRef, useState, useEffect } from 'react';
import {
  VERTEX_RADIUS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  pointToSegmentDistance,
  generateCircularLayout,
  parseMatrixInput,
  parseListInput,
  buildAdjacencyListText,
  buildAdjacencyMatrixText,
  drawGraph,
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
const GraphCanvas = () => {
  const canvasRef = useRef(null);
  const rightCanvasRef = useRef(null);

  // App Modes & Settings
  const [mode, setMode] = useState('draw');
  const [isWeighted, setIsWeighted] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

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

  const [selectedVertexId, setSelectedVertexId] = useState(null);
  const [matrixInput, setMatrixInput] = useState('');
  const [listInput, setListInput] = useState('');
  const [error, setError] = useState('');

  // --- BFS STATE ---
  const [algoMode, setAlgoMode] = useState('idle'); // 'idle', 'running', 'paused', 'finished'
  const [algoHistory, setAlgoHistory] = useState([]);
  const [algoStep, setAlgoStep] = useState(0);
  const [bfsStartNode, setBfsStartNode] = useState('1');

  // --- FORCE LAYOUT STATE ---
  const [forceAlgoMode, setForceAlgoMode] = useState('idle'); // 'idle', 'config', 'running', 'paused', 'finished'
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

  // --- ALGORITHM LOCK ---
  const enforceIdleMode = () => {
    if (algoMode !== 'idle') {
      setError('Please exit the BFS algorithm first.');
      return false;
    }
    if (forceAlgoMode !== 'idle') {
      setError('Please exit the Force Directed algorithm first.');
      return false;
    }
    return true;
  };

  // --- BFS RUN + PLAYBACK ---
  const runBfsHandler = () => {
    if (!enforceIdleMode()) return;
    const startId = parseInt(bfsStartNode, 10);
    try {
      const history = runBFS(vertices, edges, startId);
      setAlgoHistory(history);
      setAlgoStep(0);
      setAlgoMode('paused');
    } catch (err) {
      setError(err.message);
    }
  };
  useBfsPlayback(algoMode, algoHistory, setAlgoStep, setAlgoMode);

  // --- FORCE LAYOUT RUN + PLAYBACK ---
  const runForceLayoutHandler = () => {
    const history = runForceLayout(vertices, edges, forceConfig);
    setForceHistory(history);
    setForceStep(0);
    setForceAlgoMode('paused');
  };
  useForcePlayback(forceAlgoMode, forceHistory, setForceStep, setForceAlgoMode);

  const handleLaunchForceLayout = () => {
    if (algoMode !== 'idle') {
      setError('Please exit the BFS algorithm first.');
      return;
    }
    if (vertices.length === 0) {
      setError('Cannot run Force Directed Algorithm on an empty graph.');
      return;
    }
    if (vertices.length === 1) {
      setError('Force Directed Algorithm requires at least 2 vertices to simulate forces.');
      return;
    }
    if (forceAlgoMode === 'idle') {
      setForceAlgoMode('config');
      setMode('draw');
    }
  };

  const handleExitForceAlgo = () => {
    if (forceHistory.length > 0) {
      setVertices(forceHistory[forceStep]);
    }
    setForceAlgoMode('idle');
    setForceHistory([]);
    setForceStep(0);
  };

  const handleToggleWeighted = (weighted) => {
    if (!enforceIdleMode()) return;
    setIsWeighted(weighted);
    if (!weighted) {
      setEdges(edges.map((e) => ({ ...e, weight: 1 })));
      if (mode === 'editWeight') setMode('draw');
    }
  };

  // --- LIVE SYNC: GRAPH TO TEXT ---
  useEffect(() => {
    if (vertices.length === 0) {
      setMatrixInput('');
      setListInput('');
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

      const currentAlgoState = algoHistory[algoStep] || null;

      if (algoMode !== 'idle' && currentAlgoState) {
        drawBfsMainCanvas(ctx, vertices, currentAlgoState);
      } else {
        let renderVertices = vertices;
        if (forceAlgoMode !== 'idle' && forceAlgoMode !== 'config' && forceHistory.length > 0) {
          renderVertices = forceHistory[forceStep];
        }
        drawGraph(ctx, renderVertices, edges, { mode, isWeighted, selectedVertexId });
      }
    }

    const rightCanvas = rightCanvasRef.current;
    if (rightCanvas && algoMode !== 'idle') {
      const rightCtx = rightCanvas.getContext('2d');
      rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
      const currentAlgoState = algoHistory[algoStep] || null;
      drawBfsOriginalCanvas(rightCtx, vertices, edges, currentAlgoState, isWeighted);
    }
  }, [vertices, edges, selectedVertexId, mode, isWeighted, algoHistory, algoStep, algoMode, forceAlgoMode, forceHistory, forceStep]);

  const handleCanvasClick = (e) => {
    if (pendingEdge) return;
    if (!enforceIdleMode()) return;

    setError('');
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedVertex = vertices.find((v) => {
      const distance = Math.sqrt(Math.pow(v.x - x, 2) + Math.pow(v.y - y, 2));
      return distance <= VERTEX_RADIUS;
    });

    if (mode === 'deleteNode') {
      if (clickedVertex) {
        setVertices(vertices.filter((v) => v.id !== clickedVertex.id));
        setEdges(edges.filter((edge) => edge.source !== clickedVertex.id && edge.target !== clickedVertex.id));
      }
      return;
    }

    if (mode === 'deleteEdge') {
      let edgeToRemove = null;
      for (let edge of edges) {
        const src = vertices.find((v) => v.id === edge.source);
        const tgt = vertices.find((v) => v.id === edge.target);
        if (src && tgt) {
          const dist = pointToSegmentDistance(x, y, src.x, src.y, tgt.x, tgt.y);
          if (dist < 12) {
            edgeToRemove = edge;
            break;
          }
        }
      }
      if (edgeToRemove) {
        setEdges(edges.filter((e) => e !== edgeToRemove));
      }
      return;
    }

    if (mode === 'editWeight') {
      let edgeToEdit = null;
      for (let edge of edges) {
        const src = vertices.find((v) => v.id === edge.source);
        const tgt = vertices.find((v) => v.id === edge.target);
        if (src && tgt) {
          const dist = pointToSegmentDistance(x, y, src.x, src.y, tgt.x, tgt.y);
          if (dist < 12) {
            edgeToEdit = edge;
            break;
          }
        }
      }
      if (edgeToEdit) {
        setPendingEdge({ source: edgeToEdit.source, target: edgeToEdit.target, isEdit: true });
        setWeightInputVal(edgeToEdit.weight !== undefined ? edgeToEdit.weight.toString() : '1');
      }
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
              setEdges([...edges, { source: selectedVertexId, target: clickedVertex.id, weight: 1 }]);
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
      setVertices(newVertices);
      setSelectedVertexId(null);
    }
  };

  const handleSaveWeight = () => {
    if (String(weightInputVal).includes('.')) {
      setError('Decimal weight not possible.');
      return;
    }
    const w = parseInt(weightInputVal, 10);

    if (!isNaN(w)) {
      if (w === 0) {
        setError('0 weight not possible.');
        return;
      }
      if (pendingEdge.isEdit) {
        setEdges(
          edges.map((e) => {
            if (
              (e.source === pendingEdge.source && e.target === pendingEdge.target) ||
              (e.source === pendingEdge.target && e.target === pendingEdge.source)
            ) {
              return { ...e, weight: w };
            }
            return e;
          })
        );
      } else {
        setEdges([...edges, { source: pendingEdge.source, target: pendingEdge.target, weight: w }]);
      }
    } else {
      if (pendingEdge.isEdit) {
        setEdges(
          edges.map((e) => {
            if (
              (e.source === pendingEdge.source && e.target === pendingEdge.target) ||
              (e.source === pendingEdge.target && e.target === pendingEdge.source)
            ) {
              return { ...e, weight: 1 };
            }
            return e;
          })
        );
      } else {
        setEdges([...edges, { source: pendingEdge.source, target: pendingEdge.target, weight: 1 }]);
      }
    }
    setPendingEdge(null);
  };

  const handleFileUpload = (e, setInputState) => {
    if (!enforceIdleMode()) {
      e.target.value = null;
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setInputState(event.target.result);
      setError('');
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleExport = (content, filename) => {
    if (!content.trim()) {
      setError(`Cannot download an empty ${filename}.`);
      return;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setError('');
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
      setVertices(generateCircularLayout(nodeIds));
      setEdges(newEdges);
      setSelectedVertexId(null);
      setMode('draw');
      setError('');
    } catch (err) {
      setError('Matrix Error: ' + err.message);
    }
  };

  const handleListSubmit = () => {
    if (!enforceIdleMode()) return;
    try {
      const { nodeIds, edges: newEdges } = parseListInput(listInput);
      setVertices(generateCircularLayout(nodeIds));
      setEdges(newEdges);
      setSelectedVertexId(null);
      setMode('draw');
      setError('');
    } catch (err) {
      setError('List Error: ' + err.message);
    }
  };

  const handleClear = () => {
    if (!enforceIdleMode()) return;
    setVertices([]);
    setEdges([]);
    setSelectedVertexId(null);
    setMatrixInput('');
    setListInput('');
    setError('');
    setAlgoMode('idle');
    setAlgoHistory([]);
    setAlgoStep(0);
    setForceAlgoMode('idle');
    setForceHistory([]);
    setForceStep(0);
  };

  const styles = {
    container: { display: 'flex', gap: '20px', padding: '40px', fontFamily: '"Segoe UI", Roboto, sans-serif', backgroundColor: '#0f172a', color: '#eaeaea', minHeight: '100vh', justifyContent: 'center', position: 'relative' },
    leftToolbar: { display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center', minWidth: '130px' },
    algoPanel: { backgroundColor: '#1e293b', border: '2px solid #0a84ff', padding: '15px', borderRadius: '12px', marginTop: '10px', boxShadow: '0 4px 12px rgba(10, 132, 255, 0.2)' },
    toggleContainer: { backgroundColor: '#1e293b', borderRadius: '8px', padding: '5px', display: 'flex', gap: '5px', marginBottom: '5px', border: '1px solid #334155' },
    btnToggle: (isActive) => ({ flex: 1, padding: '10px', backgroundColor: isActive ? '#0a84ff' : 'transparent', color: isActive ? '#fff' : '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }),
    btnTool: (isActive) => ({ backgroundColor: isActive ? '#34c759' : '#1e293b', color: '#fff', border: isActive ? '2px solid #28a745' : '1px solid #334155', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', boxShadow: isActive ? '0 0 10px rgba(52, 199, 89, 0.4)' : 'none' }),
    btnDanger: { backgroundColor: '#ff3b30', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' },
    mainArea: { display: 'flex', flexDirection: 'column' },
    title: { margin: '0 0 5px 0', fontSize: '28px', color: '#ffffff' },
    subtitle: { margin: '0 0 20px 0', color: '#94a3b8', fontSize: '15px' },
    canvas: { border: 'none', borderRadius: '12px', cursor: (algoMode !== 'idle' || forceAlgoMode !== 'idle') ? 'not-allowed' : (mode === 'draw' ? 'crosshair' : 'pointer'), backgroundColor: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },

    statusBox: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '15px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '80px' },
    queuePill: { backgroundColor: '#34d399', color: '#0f172a', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', display: 'inline-block', marginRight: '5px' },
    activePill: { backgroundColor: '#ff9f0a', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', display: 'inline-block' },

    rightCol: {
      display: 'flex',
      flexDirection: 'column',
      gap: '25px',
      width: (algoMode === 'idle' && forceAlgoMode === 'idle') ? '420px' : '500px',
      minWidth: (algoMode === 'idle' && forceAlgoMode === 'idle') ? '420px' : '500px',
      maxWidth: (algoMode === 'idle' && forceAlgoMode === 'idle') ? '420px' : '500px',
      transition: 'all 0.3s ease',
    },

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

      {pendingEdge && (
        <div style={styles.modalOverlay}>
          <div style={styles.weightBox}>
            <h3 style={styles.modalTitle}>Enter Edge Weight</h3>
            <p style={{ marginBottom: '15px', color: '#94a3b8', fontSize: '14px' }}>
              {pendingEdge.isEdit ? 'Editing Edge from ' : 'Connecting '} Node {pendingEdge.source} to Node {pendingEdge.target}
            </p>
            <input
              type="number"
              autoFocus
              style={styles.weightInput}
              value={weightInputVal}
              onChange={(e) => setWeightInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveWeight()}
            />
            <br />
            <button onClick={handleSaveWeight} style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 30px' }}>Save Weight</button>
          </div>
        </div>
      )}

      <div style={styles.leftToolbar}>
        <div style={styles.toggleContainer}>
          <button style={styles.btnToggle(!isWeighted)} onClick={() => handleToggleWeighted(false)}>Unweighted</button>
          <button style={styles.btnToggle(isWeighted)} onClick={() => handleToggleWeighted(true)}>Weighted</button>
        </div>

        <button style={styles.btnTool(mode === 'draw')} onClick={() => { if (enforceIdleMode()) setMode('draw'); }}>✏️ Draw</button>
        <button style={styles.btnTool(mode === 'deleteNode')} onClick={() => { if (enforceIdleMode()) setMode('deleteNode'); }}>🗑️ Del Vertex</button>
        <button style={styles.btnTool(mode === 'deleteEdge')} onClick={() => { if (enforceIdleMode()) setMode('deleteEdge'); }}>✂️ Del Edge</button>

        {isWeighted && (
          <button style={styles.btnTool(mode === 'editWeight')} onClick={() => { if (enforceIdleMode()) setMode('editWeight'); }}>✍️ Edit Weight</button>
        )}

        <button onClick={handleClear} style={styles.btnDanger}>❌ Clear Data</button>

        <ForceDirectedControls
          forceAlgoMode={forceAlgoMode}
          setForceAlgoMode={setForceAlgoMode}
          forceConfig={forceConfig}
          setForceConfig={setForceConfig}
          forceStep={forceStep}
          setForceStep={setForceStep}
          forceHistory={forceHistory}
          jumpSize={jumpSize}
          setJumpSize={setJumpSize}
          onLaunch={handleLaunchForceLayout}
          onRunForceLayout={runForceLayoutHandler}
          onExitForceAlgo={handleExitForceAlgo}
          styles={styles}
        />

        <BfsControls
          algoMode={algoMode}
          setAlgoMode={setAlgoMode}
          bfsStartNode={bfsStartNode}
          setBfsStartNode={setBfsStartNode}
          algoStep={algoStep}
          setAlgoStep={setAlgoStep}
          algoHistory={algoHistory}
          setAlgoHistory={setAlgoHistory}
          onRunBfs={runBfsHandler}
          styles={styles}
        />
      </div>

      <div style={styles.mainArea}>
        <h2 style={styles.title}>{algoMode === 'idle' ? (forceAlgoMode !== 'idle' ? 'Force Layout Playground' : 'Graph Drawing Simulator') : 'BFS Tree Generation'}</h2>
        <p style={styles.subtitle}>
          {algoMode !== 'idle' ? 'Algorithm Visualization Active. Interactive editing disabled.' : (
            forceAlgoMode !== 'idle' ? 'Force simulation active. Adjust playback on the left.' : (
              <>
                {mode === 'draw' && 'Tap space to draw vertex. Tap two sequentially for edge.'}
                {mode === 'deleteNode' && 'Tap any vertex to permanently delete it and its edges.'}
                {mode === 'deleteEdge' && 'Tap directly on any line to cut that edge.'}
                {mode === 'editWeight' && "Tap directly on any edge's line to edit its weight."}
              </>
            )
          )}
        </p>

        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onClick={handleCanvasClick} style={styles.canvas} />

        <BfsStatusBox algoMode={algoMode} currentAlgoState={currentAlgoState} onExportBfsTree={handleExportBFSTree} styles={styles} />
      </div>

      <div style={styles.rightCol}>
        <div style={{ display: (algoMode === 'idle' && forceAlgoMode === 'idle') ? 'flex' : 'none', flexDirection: 'column', gap: '25px' }}>
          {/* --- MATRIX INPUT PANEL --- */}
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
            <textarea
              rows={6}
              style={styles.textArea}
              value={matrixInput}
              onChange={(e) => setMatrixInput(e.target.value)}
              placeholder={isWeighted ? '0 5 12\n5 0 0\n12 0 0' : '0 1 1\n1 0 0\n1 0 0'}
            />
            <button onClick={handleMatrixSubmit} style={styles.btnPrimary}>Draw from Matrix</button>
          </div>

          {/* --- LIST INPUT PANEL --- */}
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
            <textarea
              rows={6}
              style={styles.textArea}
              value={listInput}
              onChange={(e) => setListInput(e.target.value)}
              placeholder={isWeighted ? '1: 2(5), 3(12)\n2: 1(5)\n3: 1(12)' : '1: 2, 3\n2: 1\n3: 1'}
            />
            <button onClick={handleListSubmit} style={styles.btnPrimary}>Draw from List</button>
          </div>
        </div>

        <div style={{ display: algoMode !== 'idle' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <BfsOriginalGraphPanel rightCanvasRef={rightCanvasRef} canvasWidth={CANVAS_WIDTH} canvasHeight={CANVAS_HEIGHT} styles={styles} />
        </div>

        <div style={{ display: forceAlgoMode !== 'idle' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <ForceReferencePanel styles={styles} />
        </div>
      </div>
    </div>
  );
};

export default GraphCanvas;