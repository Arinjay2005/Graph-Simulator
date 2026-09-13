import React, { useEffect } from 'react';
import { VERTEX_RADIUS, CANVAS_WIDTH, CANVAS_HEIGHT } from './Shared';

// ================================================================
// ALGORITHM — pure force-directed layout simulation, no React/DOM.
// Returns an array of vertex-position snapshots (one per iteration)
// so the UI can scrub through the simulation.
//
// NOTE ON RENDERING: unlike BFS, the simulation has no special node/edge
// coloring — each frame is just the graph at new vertex positions — so it
// reuses shared.drawGraph() directly instead of needing its own draw fn.
// ================================================================

export function runForceLayout(vertices, edges, config) {
  const vertexMap = new Map();
  let currentVertices = vertices.map((v) => ({ ...v, vx: 0, vy: 0 }));

  const history = [];
  history.push(currentVertices.map((v) => ({ ...v })));

  let iteration = 0;
  let maxForceMagnitude = Infinity;

  while (iteration < config.maxIterations && maxForceMagnitude > config.epsilon) {
    const forces = new Map();
    currentVertices.forEach((v) => forces.set(v.id, { x: 0, y: 0 }));
    currentVertices.forEach((v) => vertexMap.set(v.id, v));

    // Repulsive forces (every pair of vertices pushes apart)
    for (let i = 0; i < currentVertices.length; i++) {
      for (let j = i + 1; j < currentVertices.length; j++) {
        const u = currentVertices[i];
        const v = currentVertices[j];
        let dx = v.x - u.x;
        let dy = v.y - u.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.1) dist = 0.1;
        const ux = dx / dist;
        const uy = dy / dist;

        const repulsive = config.cRep / (dist * dist);
        const fx = repulsive * ux;
        const fy = repulsive * uy;

        forces.get(u.id).x -= fx; forces.get(u.id).y -= fy;
        forces.get(v.id).x += fx; forces.get(v.id).y += fy;
      }
    }

    // Attractive (spring) forces along edges
    edges.forEach((edge) => {
      const u = vertexMap.get(edge.source);
      const v = vertexMap.get(edge.target);
      if (!u || !v) return;

      let dx = v.x - u.x;
      let dy = v.y - u.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1) dist = 0.1;
      const ux = dx / dist;
      const uy = dy / dist;

      const springForce = config.cSpring * Math.log(dist / config.idealLength);
      const repulsiveForce = config.cRep / (dist * dist);
      const attractiveForce = springForce - repulsiveForce;
      const fx = attractiveForce * ux;
      const fy = attractiveForce * uy;

      forces.get(u.id).x += fx; forces.get(u.id).y += fy;
      forces.get(v.id).x -= fx; forces.get(v.id).y -= fy;
    });

    maxForceMagnitude = 0;
    currentVertices = currentVertices.map((v) => {
      const force = forces.get(v.id);
      const magnitude = Math.sqrt(force.x * force.x + force.y * force.y);
      maxForceMagnitude = Math.max(maxForceMagnitude, magnitude);

      let dampedForceX = force.x * config.damping;
      let dampedForceY = force.y * config.damping;
      let vx = v.vx + dampedForceX;
      let vy = v.vy + dampedForceY;
      let x = Math.max(VERTEX_RADIUS, Math.min(CANVAS_WIDTH - VERTEX_RADIUS, v.x + vx));
      let y = Math.max(VERTEX_RADIUS, Math.min(CANVAS_HEIGHT - VERTEX_RADIUS, v.y + vy));

      return { ...v, x, y, vx, vy };
    });

    history.push(currentVertices.map((v) => ({ ...v })));
    iteration++;
  }

  return history;
}

// ================================================================
// PANEL / UI — playback hook + the two UI fragments GraphCanvas
// composes: the left-side toolbar button/config/playback controls,
// and the right-side static reference-image panel.
// ================================================================

// Drives forceStep forward automatically while forceAlgoMode === 'running'.
export function useForcePlayback(forceAlgoMode, forceHistory, setForceStep, setForceAlgoMode) {
  useEffect(() => {
    let timer;
    if (forceAlgoMode === 'running') {
      timer = setInterval(() => {
        setForceStep((prev) => {
          if (prev >= forceHistory.length - 1) {
            setForceAlgoMode('finished');
            return prev;
          }
          return prev + 1;
        });
      }, 60);
    }
    return () => clearInterval(timer);
  }, [forceAlgoMode, forceHistory, setForceStep, setForceAlgoMode]);
}

export function ForceDirectedControls({
  forceAlgoMode,
  setForceAlgoMode,
  forceConfig,
  setForceConfig,
  forceStep,
  setForceStep,
  forceHistory,
  jumpSize,
  setJumpSize,
  onLaunch,
  onRunForceLayout,
  onExitForceAlgo,
  styles,
}) {
  return (
    <>
      <button
        onClick={onLaunch}
        style={{
          ...styles.btnPrimary,
          backgroundColor: forceAlgoMode !== 'idle' ? '#6366f1' : '#0a84ff',
          color: '#fff',
          marginTop: '15px',
          boxShadow: forceAlgoMode !== 'idle' ? '0 0 12px rgba(99, 102, 241, 0.4)' : '0 4px 12px rgba(10, 132, 255, 0.3)',
        }}
      >
        Force Directed Algo
      </button>

      {forceAlgoMode !== 'idle' && (
        <div style={styles.algoPanel}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#818cf8', textAlign: 'center' }}>Force Layout</h3>

          {forceAlgoMode === 'config' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>Repulsion: <input type="number" value={forceConfig.cRep} onChange={(e) => setForceConfig({ ...forceConfig, cRep: Number(e.target.value) })} style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569' }} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>Spring: <input type="number" step="0.05" value={forceConfig.cSpring} onChange={(e) => setForceConfig({ ...forceConfig, cSpring: Number(e.target.value) })} style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569' }} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>Ideal Len: <input type="number" value={forceConfig.idealLength} onChange={(e) => setForceConfig({ ...forceConfig, idealLength: Number(e.target.value) })} style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569' }} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>Damping: <input type="number" step="0.05" value={forceConfig.damping} onChange={(e) => setForceConfig({ ...forceConfig, damping: Number(e.target.value) })} style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569' }} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>Max Iters: <input type="number" value={forceConfig.maxIterations} onChange={(e) => setForceConfig({ ...forceConfig, maxIterations: Number(e.target.value) })} style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569' }} /></label>

              <button onClick={onRunForceLayout} style={{ ...styles.btnPrimary, backgroundColor: '#6366f1', color: '#fff', marginTop: '5px' }}>▶️ Generate</button>
              <button onClick={() => setForceAlgoMode('idle')} style={{ ...styles.btnAction, marginTop: '2px' }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#fff', marginBottom: '5px' }}>
                Iteration: {forceStep} / {Math.max(0, forceHistory.length - 1)}
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => setForceAlgoMode('running')} style={{ ...styles.btnAction, backgroundColor: forceAlgoMode === 'running' ? '#34c759' : '#334155', color: '#fff', flex: 1 }}>▶️ Play</button>
                <button onClick={() => setForceAlgoMode('paused')} style={{ ...styles.btnAction, backgroundColor: forceAlgoMode === 'paused' ? '#6366f1' : '#334155', color: '#fff', flex: 1 }}>⏸️ Pause</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', margin: '5px 0' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Jump Size:</span>
                <input
                  type="number"
                  value={jumpSize}
                  onChange={(e) => setJumpSize(Math.max(1, Number(e.target.value)))}
                  style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '2px', textAlign: 'center' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => setForceStep(Math.max(0, forceStep - jumpSize))} style={styles.btnAction}>⏮️ Prev</button>
                <button onClick={() => setForceStep(Math.min(forceHistory.length - 1, forceStep + jumpSize))} style={styles.btnAction}>Next ⏭️</button>
              </div>
              <button onClick={() => { setForceStep(Math.max(0, forceHistory.length - 1)); setForceAlgoMode('finished'); }} style={styles.btnAction}>⏭️ Skip to End</button>
              <button onClick={onExitForceAlgo} style={{ ...styles.btnAction, backgroundColor: '#ff3b30', borderColor: '#ff3b30', marginTop: '10px' }}>
                ⏹️ Exit Force Algo
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function ForceReferencePanel({ styles }) {
  return (
    <div style={{ ...styles.panel, display: 'flex', flexDirection: 'column', height: '100%', padding: '25px', overflowY: 'auto' }}>
      <h3 style={{ ...styles.panelTitle, fontSize: '20px', marginBottom: '15px' }}>Algorithm Reference</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', flex: 1 }}>
        <img src="/F1.png" alt="Concept F1" style={{ width: '100%', borderRadius: '8px', border: '1px solid #334155' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
        <p style={{ display: 'none', color: '#ff453a', fontSize: '12px', margin: 0 }}>F1 image not found</p>

        <img src="/F2.png" alt="Concept F2" style={{ width: '100%', borderRadius: '8px', border: '1px solid #334155' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
        <p style={{ display: 'none', color: '#ff453a', fontSize: '12px', margin: 0 }}>F2 image not found</p>
      </div>
    </div>
  );
}