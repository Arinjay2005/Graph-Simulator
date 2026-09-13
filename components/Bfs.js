import React, { useEffect } from 'react';
import { drawEdgeLine, drawWeightLabel, drawVertexShape } from './Shared';

// ================================================================
// ALGORITHM — pure BFS logic, no React/DOM.
// Returns an array of "history" snapshots, one per visualized step,
// so the UI can scrub forward/back through the traversal.
// ================================================================

export function runBFS(vertices, edges, startId) {
  if (!vertices.some((v) => v.id === startId)) {
    throw new Error(`Node ${startId} does not exist in the graph.`);
  }

  const adj = {};
  vertices.forEach((v) => (adj[v.id] = []));
  edges.forEach((e) => {
    adj[e.source].push(e.target);
    adj[e.target].push(e.source);
  });
  for (let key in adj) adj[key].sort((a, b) => a - b);

  const history = [];
  const discovered = new Set([startId]);
  const visited = new Set();
  const queue = [startId];
  const treeEdges = [];
  const checkedEdges = [];

  history.push({
    discovered: new Set(discovered),
    visited: new Set(visited),
    queue: [...queue],
    currentNode: null,
    treeEdges: [...treeEdges],
    checkedEdges: [...checkedEdges],
    message: `Initialized BFS. Node ${startId} appears and is added to the Queue.`,
  });

  while (queue.length > 0) {
    const current = queue.shift();

    history.push({
      discovered: new Set(discovered),
      visited: new Set(visited),
      queue: [...queue],
      currentNode: current,
      treeEdges: [...treeEdges],
      checkedEdges: [...checkedEdges],
      message: `Processing Node ${current}. Exploring its edges.`,
    });

    for (let neighbor of adj[current]) {
      const originalEdge = edges.find(
        (e) => (e.source === current && e.target === neighbor) || (e.source === neighbor && e.target === current)
      );

      if (!checkedEdges.includes(originalEdge)) {
        checkedEdges.push(originalEdge);
      }

      if (!discovered.has(neighbor)) {
        discovered.add(neighbor);
        queue.push(neighbor);
        treeEdges.push(originalEdge);

        history.push({
          discovered: new Set(discovered),
          visited: new Set(visited),
          queue: [...queue],
          currentNode: current,
          treeEdges: [...treeEdges],
          checkedEdges: [...checkedEdges],
          message: `Traversed edge to discover Node ${neighbor}. Node appears and is added to Queue.`,
        });
      } else {
        history.push({
          discovered: new Set(discovered),
          visited: new Set(visited),
          queue: [...queue],
          currentNode: current,
          treeEdges: [...treeEdges],
          checkedEdges: [...checkedEdges],
          message: `Checked edge to Node ${neighbor}, but it was already discovered.`,
        });
      }
    }

    visited.add(current);
    history.push({
      discovered: new Set(discovered),
      visited: new Set(visited),
      queue: [...queue],
      currentNode: null,
      treeEdges: [...treeEdges],
      checkedEdges: [...checkedEdges],
      message: `Finished processing Node ${current}.`,
    });
  }

  history.push({
    discovered: new Set(discovered),
    visited: new Set(visited),
    queue: [],
    currentNode: null,
    treeEdges: [...treeEdges],
    checkedEdges: [...checkedEdges],
    message: `Queue is empty. BFS Traversal Complete!`,
  });

  return history;
}

// ================================================================
// RENDERING — draws the BFS-in-progress state onto a canvas.
// Two variants: the main canvas (only discovered nodes/tree edges) and
// the "original graph" overlay canvas (full graph, edges color-coded by
// tree/checked/unevaluated status).
// ================================================================

export function drawBfsMainCanvas(ctx, vertices, algoState) {
  const renderVertices = vertices.filter((v) => algoState.discovered.has(v.id));
  const renderEdges = algoState.treeEdges;

  renderEdges.forEach((edge) => {
    const source = renderVertices.find((v) => v.id === edge.source);
    const target = renderVertices.find((v) => v.id === edge.target);
    if (source && target) {
      drawEdgeLine(ctx, source.x, source.y, target.x, target.y, '#34d399', 4);
    }
  });

  renderVertices.forEach((vertex) => {
    let fillColor = '#0a84ff';
    if (algoState.currentNode === vertex.id) fillColor = '#ff9f0a';
    else if (algoState.visited.has(vertex.id)) fillColor = '#34d399';
    drawVertexShape(ctx, vertex.x, vertex.y, vertex.id, fillColor, algoState.currentNode === vertex.id);
  });
}

export function drawBfsOriginalCanvas(ctx, vertices, edges, algoState, isWeighted) {
  edges.forEach((edge) => {
    const source = vertices.find((v) => v.id === edge.source);
    const target = vertices.find((v) => v.id === edge.target);
    if (!source || !target) return;

    let edgeColor = '#64748b';
    let edgeWidth = 2;
    if (algoState) {
      if (algoState.treeEdges.includes(edge)) {
        edgeColor = '#34d399';
        edgeWidth = 4;
      } else if (algoState.checkedEdges.includes(edge)) {
        edgeColor = '#0a84ff';
        edgeWidth = 4;
      }
    }
    drawEdgeLine(ctx, source.x, source.y, target.x, target.y, edgeColor, edgeWidth);

    if (isWeighted && edge.weight !== undefined) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const labelColor = edgeColor === '#64748b' ? '#94a3b8' : edgeColor;
      drawWeightLabel(ctx, midX, midY, edge.weight, '#1e293b', labelColor);
    }
  });

  vertices.forEach((vertex) => {
    let fillColor = '#64748b';
    if (algoState) {
      if (algoState.currentNode === vertex.id) fillColor = '#ff9f0a';
      else if (algoState.visited.has(vertex.id)) fillColor = '#34d399';
      else if (algoState.discovered.has(vertex.id)) fillColor = '#0a84ff';
    }
    drawVertexShape(ctx, vertex.x, vertex.y, vertex.id, fillColor, algoState && algoState.currentNode === vertex.id);
  });
}

// ================================================================
// PANEL / UI — playback hook + the three UI fragments GraphCanvas
// composes: left-side controls, the status box under the main canvas,
// and the right-side "original graph" reference panel.
// ================================================================

// Drives algoStep forward automatically while algoMode === 'running'.
export function useBfsPlayback(algoMode, algoHistory, setAlgoStep, setAlgoMode) {
  useEffect(() => {
    let timer;
    if (algoMode === 'running') {
      timer = setInterval(() => {
        setAlgoStep((prev) => {
          if (prev >= algoHistory.length - 1) {
            setAlgoMode('finished');
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [algoMode, algoHistory, setAlgoStep, setAlgoMode]);
}

export function BfsControls({
  algoMode,
  setAlgoMode,
  bfsStartNode,
  setBfsStartNode,
  algoStep,
  setAlgoStep,
  algoHistory,
  setAlgoHistory,
  onRunBfs,
  styles,
}) {
  return (
    <div style={styles.algoPanel}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#0a84ff', textAlign: 'center' }}>
        BFS Visualization
      </h3>
      {algoMode === 'idle' ? (
        <>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Start Node:</span>
            <input
              type="number"
              value={bfsStartNode}
              onChange={(e) => setBfsStartNode(e.target.value)}
              style={{ width: '50px', padding: '5px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#fff' }}
            />
          </div>
          <button onClick={onRunBfs} style={styles.btnPrimary}>▶️ Initialize BFS</button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => setAlgoMode('running')} style={{ ...styles.btnAction, backgroundColor: algoMode === 'running' ? '#34c759' : '#334155', flex: 1 }}>▶️ Play</button>
            <button onClick={() => setAlgoMode('paused')} style={{ ...styles.btnAction, backgroundColor: algoMode === 'paused' ? '#ff9f0a' : '#334155', flex: 1 }}>⏸️ Pause</button>
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => setAlgoStep(Math.max(0, algoStep - 1))} disabled={algoStep === 0} style={{ ...styles.btnAction, opacity: algoStep === 0 ? 0.5 : 1 }}>⏮️ Prev</button>
            <button onClick={() => setAlgoStep(Math.min(algoHistory.length - 1, algoStep + 1))} disabled={algoStep === algoHistory.length - 1} style={{ ...styles.btnAction, opacity: algoStep === algoHistory.length - 1 ? 0.5 : 1 }}>Next ⏭️</button>
          </div>
          <button onClick={() => { setAlgoStep(algoHistory.length - 1); setAlgoMode('finished'); }} style={styles.btnAction}>⏭️ Skip to End</button>
          <button onClick={() => { setAlgoMode('idle'); setAlgoHistory([]); }} style={{ ...styles.btnAction, backgroundColor: '#ff3b30', borderColor: '#ff3b30', marginTop: '10px' }}>⏹️ Exit BFS</button>
        </div>
      )}
    </div>
  );
}

export function BfsStatusBox({ algoMode, currentAlgoState, onExportBfsTree, styles }) {
  if (!(algoMode !== 'idle' && currentAlgoState)) return null;
  return (
    <div style={styles.statusBox}>
      <div style={{ color: '#fff', fontSize: '15px' }}>{currentAlgoState.message}</div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {currentAlgoState.currentNode !== null && (
          <div>
            <span style={{ color: '#94a3b8', fontSize: '13px', marginRight: '8px' }}>Processing:</span>
            <span style={styles.activePill}>Node {currentAlgoState.currentNode}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px' }}>
          <span style={{ color: '#94a3b8', fontSize: '13px', marginRight: '8px' }}>Queue [FIFO]:</span>
          {currentAlgoState.queue.length === 0 ? (
            <span style={{ color: '#64748b', fontStyle: 'italic' }}>Empty</span>
          ) : (
            currentAlgoState.queue.map((qId, i) => (
              <span key={i} style={{ ...styles.queuePill, opacity: 1 - i * 0.15 }}>{qId}</span>
            ))
          )}
        </div>
      </div>

      {algoMode === 'finished' && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 'bold', marginRight: '8px' }}>Download BFS Tree:</span>
          <button onClick={() => onExportBfsTree('matrix')} style={{ ...styles.btnAction, width: 'auto', padding: '6px 12px' }}>💾 As Matrix</button>
          <button onClick={() => onExportBfsTree('list')} style={{ ...styles.btnAction, width: 'auto', padding: '6px 12px' }}>💾 As List</button>
        </div>
      )}
    </div>
  );
}

export function BfsOriginalGraphPanel({ rightCanvasRef, canvasWidth, canvasHeight, styles }) {
  return (
    <div style={{ ...styles.panel, display: 'flex', flexDirection: 'column', height: '100%', padding: '15px' }}>
      <h3 style={{ ...styles.panelTitle, fontSize: '20px', marginBottom: '10px' }}>Original Graph Traversal</h3>
      <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 15px 0' }}>Watch the algorithm evaluate every edge.</p>

      <div style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
        <canvas ref={rightCanvasRef} width={canvasWidth} height={canvasHeight} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>

      <div style={{ marginTop: '15px', fontSize: '15px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', backgroundColor: '#34d399' }}></div> <strong>Tree Edge:</strong> Found a new node.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', backgroundColor: '#0a84ff' }}></div> <strong>Rejected Edge:</strong> Node already visited.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', backgroundColor: '#64748b' }}></div> <strong>Unevaluated Edge.</strong></div>
      </div>
    </div>
  );
}