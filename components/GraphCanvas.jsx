import React, { useRef, useState, useEffect } from 'react';

const GraphCanvas = () => {
  const canvasRef = useRef(null);
  const rightCanvasRef = useRef(null); 
  
  // App Modes & Settings
  const [mode, setMode] = useState('draw'); 
  const [isWeighted, setIsWeighted] = useState(false); 
  
  // State for the Weight Input Modal
  const [pendingEdge, setPendingEdge] = useState(null);
  const [weightInputVal, setWeightInputVal] = useState('');

  // Sample Graph
  const [vertices, setVertices] = useState([
    { id: 1, x: 400, y: 100 }, 
    { id: 2, x: 600, y: 300 }, 
    { id: 3, x: 400, y: 500 }, 
    { id: 4, x: 200, y: 300 }  
  ]);
  const [edges, setEdges] = useState([
    { source: 1, target: 2, weight: 1 },
    { source: 2, target: 3, weight: 1 },
    { source: 3, target: 4, weight: 1 },
    { source: 4, target: 1, weight: 1 }
  ]);
  
  const [selectedVertexId, setSelectedVertexId] = useState(null);
  const [matrixInput, setMatrixInput] = useState('');
  const [listInput, setListInput] = useState('');
  const [error, setError] = useState('');

  // --- ALGORITHM STATE ---
  const [algoMode, setAlgoMode] = useState('idle'); // 'idle', 'running', 'paused', 'finished'
  const [algoHistory, setAlgoHistory] = useState([]);
  const [algoStep, setAlgoStep] = useState(0);
  const [bfsStartNode, setBfsStartNode] = useState('1');

  const VERTEX_RADIUS = 18;
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  // --- BFS ALGORITHM ENGINE ---
  const runBFS = () => {
    const startId = parseInt(bfsStartNode, 10);
    if (!vertices.some(v => v.id === startId)) {
      setError(`Node ${startId} does not exist in the graph.`);
      return;
    }

    const adj = {};
    vertices.forEach(v => adj[v.id] = []);
    edges.forEach(e => {
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
      message: `Initialized BFS. Node ${startId} appears and is added to the Queue.`
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
        message: `Processing Node ${current}. Exploring its edges.`
      });

      for (let neighbor of adj[current]) {
        const originalEdge = edges.find(e => (e.source === current && e.target === neighbor) || (e.source === neighbor && e.target === current));
        
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
            message: `Traversed edge to discover Node ${neighbor}. Node appears and is added to Queue.`
          });
        } else {
           history.push({
            discovered: new Set(discovered),
            visited: new Set(visited),
            queue: [...queue],
            currentNode: current,
            treeEdges: [...treeEdges],
            checkedEdges: [...checkedEdges],
            message: `Checked edge to Node ${neighbor}, but it was already discovered.`
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
        message: `Finished processing Node ${current}.`
      });
    }

    history.push({
      discovered: new Set(discovered),
      visited: new Set(visited),
      queue: [],
      currentNode: null,
      treeEdges: [...treeEdges],
      checkedEdges: [...checkedEdges],
      message: `Queue is empty. BFS Traversal Complete!`
    });

    setAlgoHistory(history);
    setAlgoStep(0);
    setAlgoMode('paused'); 
  };

  // --- ALGORITHM PLAYBACK ---
  useEffect(() => {
    let timer;
    if (algoMode === 'running') {
      timer = setInterval(() => {
        setAlgoStep(prev => {
          if (prev >= algoHistory.length - 1) {
            setAlgoMode('finished');
            return prev;
          }
          return prev + 1;
        });
      }, 1500); 
    }
    return () => clearInterval(timer);
  }, [algoMode, algoHistory]);


  const handleToggleWeighted = (weighted) => {
    setIsWeighted(weighted);
    if (!weighted) {
      setEdges(edges.map(e => ({ ...e, weight: 1 })));
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

    let listStr = '';
    sortedVertices.forEach(v => {
      const connected = [];
      edges.forEach(e => {
        if (e.source === v.id) connected.push({ target: e.target, weight: e.weight });
        if (e.target === v.id) connected.push({ target: e.source, weight: e.weight });
      });
      connected.sort((a, b) => a.target - b.target);
      if (connected.length > 0) {
        const edgeStrings = connected.map(c => isWeighted ? `${c.target}(${c.weight || 1})` : `${c.target}`);
        listStr += `${v.id}: ${edgeStrings.join(', ')}\n`;
      } else {
        listStr += `${v.id}:\n`; 
      }
    });
    setListInput(listStr.trim());

    const idToIndex = {};
    sortedVertices.forEach((v, idx) => { idToIndex[v.id] = idx; }); 
    const n = sortedVertices.length;
    const matrix = Array(n).fill(0).map(() => Array(n).fill(0));
    
    edges.forEach(e => {
      const i = idToIndex[e.source];
      const j = idToIndex[e.target];
      if (i !== undefined && j !== undefined) {
        const w = isWeighted ? (e.weight || 1) : 1;
        matrix[i][j] = w;
        matrix[j][i] = w; 
      }
    });
    
    const matrixStr = matrix.map(row => row.join(' ')).join('\n');
    setMatrixInput(matrixStr);

  }, [vertices, edges, isWeighted]);

  // --- DUAL RENDER ENGINE ---
  useEffect(() => {
    // 1. Render Main Canvas (Draw Mode or BFS Tree Mode)
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentAlgoState = algoHistory[algoStep] || null;
      
      let renderVertices = vertices;
      let renderEdges = edges;

      if (algoMode !== 'idle' && currentAlgoState) {
         renderVertices = vertices.filter(v => currentAlgoState.discovered.has(v.id));
         renderEdges = currentAlgoState.treeEdges;
      }

      ctx.lineWidth = 3;
      renderEdges.forEach(edge => {
        const source = vertices.find(v => v.id === edge.source);
        const target = vertices.find(v => v.id === edge.target);
        if (source && target) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          
          let edgeColor = mode === 'deleteEdge' ? '#ff453a' : (mode === 'editWeight' ? '#ff9f0a' : '#888');
          let edgeWidth = 3;

          if (algoMode !== 'idle') {
            edgeColor = '#34d399'; 
            edgeWidth = 4; 
          }

          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = edgeWidth;
          ctx.stroke();

          if (isWeighted && edge.weight !== undefined) {
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            const textWidth = ctx.measureText(edge.weight).width;
            ctx.fillStyle = '#0f172a'; 
            ctx.fillRect(midX - textWidth/2 - 4, midY - 10, textWidth + 8, 20);
            ctx.fillStyle = '#34d399'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(edge.weight, midX, midY);
          }
        }
      });

      renderVertices.forEach(vertex => {
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, VERTEX_RADIUS, 0, 2 * Math.PI);
        
        let fillColor = vertex.id === selectedVertexId ? '#ff3b30' : '#0a84ff';
        if (mode === 'deleteNode') fillColor = '#ff453a';

        if (algoMode !== 'idle' && currentAlgoState) {
          if (currentAlgoState.currentNode === vertex.id) fillColor = '#ff9f0a'; 
          else if (currentAlgoState.visited.has(vertex.id)) fillColor = '#34d399'; 
          else fillColor = '#0a84ff'; 
        }

        ctx.fillStyle = fillColor;
        ctx.fill();

        if (algoMode !== 'idle' && currentAlgoState && currentAlgoState.currentNode === vertex.id) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.fillText(vertex.id, vertex.x, vertex.y);
      });
    }

    // 2. Render Right Canvas (Original Graph Traversal Overlay)
    const rightCanvas = rightCanvasRef.current;
    if (rightCanvas && algoMode !== 'idle') {
      const rightCtx = rightCanvas.getContext('2d');
      rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);

      const currentAlgoState = algoHistory[algoStep] || null;

      rightCtx.lineWidth = 3;
      edges.forEach(edge => {
        const source = vertices.find(v => v.id === edge.source);
        const target = vertices.find(v => v.id === edge.target);
        if (source && target) {
          rightCtx.beginPath();
          rightCtx.moveTo(source.x, source.y);
          rightCtx.lineTo(target.x, target.y);
          
          let edgeColor = '#64748b'; 
          let edgeWidth = 2;

          if (currentAlgoState) {
            if (currentAlgoState.treeEdges.includes(edge)) {
              edgeColor = '#34d399'; 
              edgeWidth = 4;
            } else if (currentAlgoState.checkedEdges.includes(edge)) {
              edgeColor = '#0a84ff'; 
              edgeWidth = 4;
            }
          }

          rightCtx.strokeStyle = edgeColor;
          rightCtx.lineWidth = edgeWidth;
          rightCtx.stroke();

          if (isWeighted && edge.weight !== undefined) {
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            rightCtx.font = 'bold 16px "Segoe UI", sans-serif';
            const textWidth = rightCtx.measureText(edge.weight).width;
            rightCtx.fillStyle = '#1e293b'; 
            rightCtx.fillRect(midX - textWidth/2 - 4, midY - 10, textWidth + 8, 20);
            rightCtx.fillStyle = edgeColor === '#64748b' ? '#94a3b8' : edgeColor; 
            rightCtx.textAlign = 'center';
            rightCtx.textBaseline = 'middle';
            rightCtx.fillText(edge.weight, midX, midY);
          }
        }
      });

      vertices.forEach(vertex => {
        rightCtx.beginPath();
        rightCtx.arc(vertex.x, vertex.y, VERTEX_RADIUS, 0, 2 * Math.PI);
        
        let fillColor = '#64748b'; 
        
        if (currentAlgoState) {
          if (currentAlgoState.currentNode === vertex.id) fillColor = '#ff9f0a'; 
          else if (currentAlgoState.visited.has(vertex.id)) fillColor = '#34d399'; 
          else if (currentAlgoState.discovered.has(vertex.id)) fillColor = '#0a84ff';
        }

        rightCtx.fillStyle = fillColor;
        rightCtx.fill();

        if (currentAlgoState && currentAlgoState.currentNode === vertex.id) {
          rightCtx.lineWidth = 4;
          rightCtx.strokeStyle = '#ffffff';
          rightCtx.stroke();
        }
        
        rightCtx.fillStyle = '#ffffff';
        rightCtx.textAlign = 'center';
        rightCtx.textBaseline = 'middle';
        rightCtx.font = 'bold 14px "Segoe UI", sans-serif';
        rightCtx.fillText(vertex.id, vertex.x, vertex.y);
      });
    }

  }, [vertices, edges, selectedVertexId, mode, isWeighted, algoHistory, algoStep, algoMode]);

  const pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
    const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.sqrt(Math.pow(px - projX, 2) + Math.pow(py - projY, 2));
  };

  const handleCanvasClick = (e) => {
    if (pendingEdge || algoMode !== 'idle') return;

    setError(''); 
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedVertex = vertices.find(v => {
      const distance = Math.sqrt(Math.pow(v.x - x, 2) + Math.pow(v.y - y, 2));
      return distance <= VERTEX_RADIUS;
    });

    if (mode === 'deleteNode') {
      if (clickedVertex) {
        setVertices(vertices.filter(v => v.id !== clickedVertex.id));
        setEdges(edges.filter(edge => edge.source !== clickedVertex.id && edge.target !== clickedVertex.id));
      }
      return;
    }

    if (mode === 'deleteEdge') {
      let edgeToRemove = null;
      for (let edge of edges) {
        const src = vertices.find(v => v.id === edge.source);
        const tgt = vertices.find(v => v.id === edge.target);
        if (src && tgt) {
          const dist = pointToSegmentDistance(x, y, src.x, src.y, tgt.x, tgt.y);
          if (dist < 12) { 
            edgeToRemove = edge;
            break;
          }
        }
      }
      if (edgeToRemove) {
        setEdges(edges.filter(e => e !== edgeToRemove));
      }
      return;
    }

    if (mode === 'editWeight') {
      let edgeToEdit = null;
      for (let edge of edges) {
        const src = vertices.find(v => v.id === edge.source);
        const tgt = vertices.find(v => v.id === edge.target);
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
            e => (e.source === selectedVertexId && e.target === clickedVertex.id) ||
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
      const existingIds = vertices.map(v => v.id).sort((a, b) => a - b);
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
      setError("Decimal weight not possible.");
      return;
    }
    const w = parseInt(weightInputVal, 10);
    
    if (!isNaN(w)) {
      if (w === 0) { setError("0 weight not possible."); return; }
      
      if (pendingEdge.isEdit) {
        setEdges(edges.map(e => {
          if ((e.source === pendingEdge.source && e.target === pendingEdge.target) || 
              (e.source === pendingEdge.target && e.target === pendingEdge.source)) {
            return { ...e, weight: w };
          }
          return e;
        }));
      } else {
        setEdges([...edges, { source: pendingEdge.source, target: pendingEdge.target, weight: w }]);
      }
    } else {
      if (pendingEdge.isEdit) {
        setEdges(edges.map(e => {
          if ((e.source === pendingEdge.source && e.target === pendingEdge.target) || 
              (e.source === pendingEdge.target && e.target === pendingEdge.source)) {
            return { ...e, weight: 1 };
          }
          return e;
        }));
      } else {
        setEdges([...edges, { source: pendingEdge.source, target: pendingEdge.target, weight: 1 }]);
      }
    }
    setPendingEdge(null);
  };

  const generateCircularLayout = (nodeIds) => {
    const newVertices = [];
    const numVertices = nodeIds.length;
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const radius = Math.min(centerX, centerY) - 80; 
    for (let i = 0; i < numVertices; i++) {
      const theta = (2 * Math.PI * i) / numVertices - (Math.PI / 2);
      newVertices.push({ id: nodeIds[i], x: Math.round(centerX + radius * Math.cos(theta)), y: Math.round(centerY + radius * Math.sin(theta)) });
    }
    return newVertices;
  };

  const handleFileUpload = (e, setInputState) => {
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
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    setError('');
  };

  // --- BFS TREE EXPORT LOGIC ---
  const handleExportBFSTree = (format) => {
    const finalState = algoHistory[algoHistory.length - 1];
    if (!finalState) return;

    const treeNodes = Array.from(finalState.discovered).sort((a, b) => a - b);
    const treeEdges = finalState.treeEdges;

    if (format === 'list') {
      let listStr = '';
      treeNodes.forEach(nodeId => {
        const connected = [];
        treeEdges.forEach(e => {
          if (e.source === nodeId) connected.push({ target: e.target, weight: e.weight });
          if (e.target === nodeId) connected.push({ target: e.source, weight: e.weight });
        });
        connected.sort((a, b) => a.target - b.target);
        if (connected.length > 0) {
          const edgeStrings = connected.map(c => isWeighted ? `${c.target}(${c.weight || 1})` : `${c.target}`);
          listStr += `${nodeId}: ${edgeStrings.join(', ')}\n`;
        } else {
          listStr += `${nodeId}:\n`;
        }
      });
      handleExport(listStr.trim(), 'bfs_tree_list.txt');
    } else if (format === 'matrix') {
      const n = treeNodes.length;
      const idToIndex = {};
      treeNodes.forEach((id, idx) => { idToIndex[id] = idx; });
      const matrix = Array(n).fill(0).map(() => Array(n).fill(0));

      treeEdges.forEach(e => {
        const i = idToIndex[e.source];
        const j = idToIndex[e.target];
        if (i !== undefined && j !== undefined) {
          const w = isWeighted ? (e.weight || 1) : 1;
          matrix[i][j] = w;
          matrix[j][i] = w;
        }
      });

      const matrixStr = matrix.map(row => row.join(' ')).join('\n');
      handleExport(matrixStr, 'bfs_tree_matrix.txt');
    }
  };

  // --- STRING TRUNCATOR FOR MAPPING LABEL ---
  const getMappingText = () => {
    if (vertices.length === 0) return '';
    const ids = vertices.map(v => v.id).sort((a, b) => a - b);
    if (ids.length <= 5) return `[${ids.join(', ')}]`;
    return `[${ids.slice(0, 5).join(', ')}, ...]`;
  };

  const handleMatrixSubmit = () => {
    try {
      if (!matrixInput.trim()) throw new Error("Matrix is empty.");
      const rows = matrixInput.trim().split('\n').filter(line => line.trim() !== '').map(row => row.trim().split(/\s+/).map(Number));
      const numVertices = rows.length;
      if (rows.some(row => row.length !== numVertices)) throw new Error("Matrix must be strictly NxN (square).");

      for (let i = 0; i < numVertices; i++) {
        for (let j = 0; j < numVertices; j++) {
          if (!Number.isInteger(rows[i][j])) throw new Error(`Decimal weight not possible (Node ${i+1} to Node ${j+1}).`);
          if (rows[i][j] !== rows[j][i]) {
            if (rows[i][j] === 0 || rows[j][i] === 0) {
              const source = rows[i][j] !== 0 ? i + 1 : j + 1;
              const target = rows[i][j] !== 0 ? j + 1 : i + 1;
              throw new Error(`Node ${source} connects to Node ${target}, but Node ${target} does not connect back to Node ${source}.`);
            } else {
              throw new Error(`Weight mismatch: Node ${i+1}->${j+1} is ${rows[i][j]}, but Node ${j+1}->${i+1} is ${rows[j][i]}.`);
            }
          }
        }
      }

      const nodeIds = Array.from({length: numVertices}, (_, i) => i + 1);
      const newEdges = [];
      for (let i = 0; i < numVertices; i++) {
        for (let j = i + 1; j < numVertices; j++) { 
          if (rows[i][j] !== 0) newEdges.push({ source: i + 1, target: j + 1, weight: rows[i][j] });
        }
      }
      setVertices(generateCircularLayout(nodeIds)); setEdges(newEdges); setSelectedVertexId(null); setMode('draw'); setError('');
    } catch (err) { setError("Matrix Error: " + err.message); }
  };

  const handleListSubmit = () => {
    try {
      if (!listInput.trim()) throw new Error("List is empty.");
      const lines = listInput.trim().split('\n').filter(line => line.trim() !== '');
      const parsedGraph = {}; const uniqueIds = new Set(); 

      lines.forEach(line => {
        if (!line.includes(':')) return;
        const [sourceStr, targetsStr] = line.split(':');
        const sourceId = parseInt(sourceStr.trim(), 10);
        if (isNaN(sourceId)) return;
        uniqueIds.add(sourceId);
        if (!parsedGraph[sourceId]) parsedGraph[sourceId] = new Map(); 

        if (targetsStr && targetsStr.trim() !== "") {
          const targets = targetsStr.split(',');
          targets.forEach(targetRaw => {
            const match = targetRaw.trim().match(/(\d+)(?:\(([^)]+)\))?/);
            if (match) {
              const targetId = parseInt(match[1], 10);
              let weight = 1; 
              if (match[2]) {
                if (match[2].includes('.')) throw new Error(`Decimal weight not possible (Edge from Node ${sourceId} to Node ${targetId}).`);
                weight = parseInt(match[2], 10);
                if (isNaN(weight)) throw new Error(`Invalid weight provided (Edge from Node ${sourceId} to Node ${targetId}).`);
              }
              if (weight === 0) throw new Error(`0 weight not possible (Edge from Node ${sourceId} to Node ${targetId}).`);
              uniqueIds.add(targetId);
              parsedGraph[sourceId].set(targetId, weight);
            }
          });
        }
      });

      if (uniqueIds.size === 0) throw new Error("Could not detect any valid vertices.");

      const newEdges = [];
      for (const [sourceStr, targetMap] of Object.entries(parsedGraph)) {
        const sourceId = parseInt(sourceStr, 10);
        for (const [targetId, weight] of targetMap.entries()) {
          if (!parsedGraph[targetId] || !parsedGraph[targetId].has(sourceId)) throw new Error(`Node ${sourceId} connects to Node ${targetId}, but Node ${targetId} does not connect back to Node ${sourceId}.`);
          if (parsedGraph[targetId].get(sourceId) !== weight) throw new Error(`Weight mismatch: Node ${sourceId}->${targetId} is ${weight}, but Node ${targetId}->Node ${sourceId} is ${parsedGraph[targetId].get(sourceId)}.`);
          if (sourceId < targetId) newEdges.push({ source: sourceId, target: targetId, weight });
        }
      }
      const nodeIds = Array.from(uniqueIds).sort((a, b) => a - b);
      setVertices(generateCircularLayout(nodeIds)); setEdges(newEdges); setSelectedVertexId(null); setMode('draw'); setError('');
    } catch (err) { setError("List Error: " + err.message); }
  };

  const handleClear = () => {
    setVertices([]); setEdges([]); setSelectedVertexId(null); setMatrixInput(''); setListInput(''); setError('');
    setAlgoMode('idle'); setAlgoHistory([]); setAlgoStep(0);
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
    canvas: { border: 'none', borderRadius: '12px', cursor: algoMode !== 'idle' ? 'not-allowed' : (mode === 'draw' ? 'crosshair' : 'pointer'), backgroundColor: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
    
    statusBox: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '15px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '80px' },
    queuePill: { backgroundColor: '#34d399', color: '#0f172a', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', display: 'inline-block', marginRight: '5px' },
    activePill: { backgroundColor: '#ff9f0a', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', display: 'inline-block' },

    rightCol: { 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '25px', 
      width: algoMode === 'idle' ? '420px' : '500px',
      minWidth: algoMode === 'idle' ? '420px' : '500px', 
      maxWidth: algoMode === 'idle' ? '420px' : '500px',
      transition: 'all 0.3s ease' 
    },
    
    panel: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', position: 'relative' },
    panelTitle: { margin: '0 0 5px 0', fontSize: '18px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' },
    
    textArea: { width: '100%', backgroundColor: '#0f172a', color: '#34d399', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '15px', resize: 'vertical', marginBottom: '15px', boxSizing: 'border-box', fontWeight: '500', whiteSpace: 'pre', overflowX: 'auto' },
    
    btnPrimary: { backgroundColor: '#0a84ff', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: '15px' },
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
    weightInput: { width: '100px', padding: '10px', fontSize: '18px', textAlign: 'center', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#fff', marginBottom: '15px' }
  };

  const currentAlgoState = algoHistory[algoStep] || null;

  return (
    <div style={styles.container}>
      
      {error && (
        <div style={{...styles.modalOverlay, zIndex: 2000, cursor: 'pointer'}} onClick={() => setError('')}>
          <div style={styles.errorBox}>
            <h3 style={{...styles.modalTitle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}}>⚠️ Input Error</h3>
            <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>{error}</p>
            <p style={{ margin: '20px 0 0 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Click anywhere to dismiss</p>
          </div>
        </div>
      )}

      {pendingEdge && (
        <div style={styles.modalOverlay}>
          <div style={styles.weightBox}>
            <h3 style={styles.modalTitle}>Enter Edge Weight</h3>
            <p style={{marginBottom: '15px', color: '#94a3b8', fontSize: '14px'}}>
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
            <button onClick={handleSaveWeight} style={{...styles.btnPrimary, width: 'auto', padding: '10px 30px'}}>Save Weight</button>
          </div>
        </div>
      )}

      <div style={styles.leftToolbar}>
        <div style={styles.toggleContainer}>
          <button style={styles.btnToggle(!isWeighted)} onClick={() => handleToggleWeighted(false)}>Unweighted</button>
          <button style={styles.btnToggle(isWeighted)} onClick={() => handleToggleWeighted(true)}>Weighted</button>
        </div>

        <button style={styles.btnTool(mode === 'draw')} onClick={() => {setMode('draw'); setAlgoMode('idle');}}>✏️ Draw</button>
        <button style={styles.btnTool(mode === 'deleteNode')} onClick={() => {setMode('deleteNode'); setAlgoMode('idle');}}>🗑️ Del Vertex</button>
        <button style={styles.btnTool(mode === 'deleteEdge')} onClick={() => {setMode('deleteEdge'); setAlgoMode('idle');}}>✂️ Del Edge</button>
        
        {isWeighted && (
          <button style={styles.btnTool(mode === 'editWeight')} onClick={() => {setMode('editWeight'); setAlgoMode('idle');}}>✍️ Edit Weight</button>
        )}

        <button onClick={handleClear} style={styles.btnDanger}>❌ Clear Data</button>

        {/* ALGORITHM CONTROLS */}
        <div style={styles.algoPanel}>
          <h3 style={{margin: '0 0 10px 0', fontSize: '15px', color: '#0a84ff', textAlign: 'center'}}>BFS Visualization</h3>
          {algoMode === 'idle' ? (
            <>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px'}}>
                <span style={{fontSize: '13px', color: '#94a3b8'}}>Start Node:</span>
                <input 
                  type="number" 
                  value={bfsStartNode} 
                  onChange={(e) => setBfsStartNode(e.target.value)} 
                  style={{width: '50px', padding: '5px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#fff'}}
                />
              </div>
              <button onClick={runBFS} style={styles.btnPrimary}>▶️ Initialize BFS</button>
            </>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <div style={{display: 'flex', gap: '5px'}}>
                <button onClick={() => setAlgoMode('running')} style={{...styles.btnAction, backgroundColor: algoMode==='running'?'#34c759':'#334155', flex: 1}}>▶️ Play</button>
                <button onClick={() => setAlgoMode('paused')} style={{...styles.btnAction, backgroundColor: algoMode==='paused'?'#ff9f0a':'#334155', flex: 1}}>⏸️ Pause</button>
              </div>
              <div style={{display: 'flex', gap: '5px'}}>
                <button onClick={() => setAlgoStep(Math.max(0, algoStep-1))} disabled={algoStep === 0} style={{...styles.btnAction, opacity: algoStep===0?0.5:1}}>⏮️ Prev</button>
                <button onClick={() => setAlgoStep(Math.min(algoHistory.length-1, algoStep+1))} disabled={algoStep === algoHistory.length-1} style={{...styles.btnAction, opacity: algoStep===algoHistory.length-1?0.5:1}}>Next ⏭️</button>
              </div>
              <button onClick={() => { setAlgoStep(algoHistory.length-1); setAlgoMode('finished'); }} style={styles.btnAction}>⏭️ Skip to End</button>
              <button onClick={() => { setAlgoMode('idle'); setAlgoHistory([]); }} style={{...styles.btnAction, backgroundColor: '#ff3b30', borderColor: '#ff3b30', marginTop: '10px'}}>⏹️ Exit BFS</button>
            </div>
          )}
        </div>
      </div>

      <div style={styles.mainArea}>
        <h2 style={styles.title}>{algoMode === 'idle' ? "Graph Drawing Simulator" : "BFS Tree Generation"}</h2>
        <p style={styles.subtitle}>
          {algoMode !== 'idle' ? "Algorithm Visualization Active. Interactive editing disabled." : (
            <>
              {mode === 'draw' && "Tap space to draw vertex. Tap two sequentially for edge."}
              {mode === 'deleteNode' && "Tap any vertex to permanently delete it and its edges."}
              {mode === 'deleteEdge' && "Tap directly on any line to cut that edge."}
              {mode === 'editWeight' && "Tap directly on any edge's line to edit its weight."}
            </>
          )}
        </p>
        
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onClick={handleCanvasClick} style={styles.canvas} />
        
        {algoMode !== 'idle' && currentAlgoState && (
          <div style={styles.statusBox}>
            <div style={{color: '#fff', fontSize: '15px'}}>{currentAlgoState.message}</div>
            
            <div style={{display: 'flex', gap: '20px', alignItems: 'flex-start'}}>
              {currentAlgoState.currentNode !== null && (
                <div>
                  <span style={{color: '#94a3b8', fontSize: '13px', marginRight: '8px'}}>Processing:</span>
                  <span style={styles.activePill}>Node {currentAlgoState.currentNode}</span>
                </div>
              )}
              
              <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px'}}>
                <span style={{color: '#94a3b8', fontSize: '13px', marginRight: '8px'}}>Queue [FIFO]:</span>
                {currentAlgoState.queue.length === 0 ? (
                  <span style={{color: '#64748b', fontStyle: 'italic'}}>Empty</span>
                ) : (
                  currentAlgoState.queue.map((qId, i) => (
                    <span key={i} style={{...styles.queuePill, opacity: 1 - (i * 0.15)}}>{qId}</span>
                  ))
                )}
              </div>
            </div>

            {algoMode === 'finished' && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{color: '#ffffff', fontSize: '16px', fontWeight: 'bold', marginRight: '8px'}}>Download BFS Tree:</span>
                <button onClick={() => handleExportBFSTree('matrix')} style={{...styles.btnAction, width: 'auto', padding: '6px 12px'}}>💾 As Matrix</button>
                <button onClick={() => handleExportBFSTree('list')} style={{...styles.btnAction, width: 'auto', padding: '6px 12px'}}>💾 As List</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.rightCol}>
        <div style={{ display: algoMode === 'idle' ? 'flex' : 'none', flexDirection: 'column', gap: '25px' }}>
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
            <textarea rows={6} style={styles.textArea} value={matrixInput} onChange={(e) => setMatrixInput(e.target.value)} placeholder={isWeighted ? "0 5 12\n5 0 0\n12 0 0" : "0 1 1\n1 0 0\n1 0 0"} />
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
            <textarea rows={6} style={styles.textArea} value={listInput} onChange={(e) => setListInput(e.target.value)} placeholder={isWeighted ? "1: 2(5), 3(12)\n2: 1(5)\n3: 1(12)" : "1: 2, 3\n2: 1\n3: 1"} />
            <button onClick={handleListSubmit} style={styles.btnPrimary}>Draw from List</button>
          </div>
        </div>

        {/* ORIGINAL GRAPH OVERLAY DURING ALGORITHM */}
        <div style={{ ...styles.panel, display: algoMode !== 'idle' ? 'flex' : 'none', flexDirection: 'column', height: '100%', padding: '15px' }}>
          <h3 style={{...styles.panelTitle, fontSize: '20px', marginBottom: '10px'}}>Original Graph Traversal</h3>
          <p style={{color: '#94a3b8', fontSize: '14px', margin: '0 0 15px 0'}}>Watch the algorithm evaluate every edge.</p>
          
          <div style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
            <canvas ref={rightCanvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{width: '100%', height: 'auto', display: 'block'}} />
          </div>

          <div style={{marginTop: '15px', fontSize: '15px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '16px', height: '4px', backgroundColor: '#34d399'}}></div> <strong>Tree Edge:</strong> Found a new node.</div>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '16px', height: '4px', backgroundColor: '#0a84ff'}}></div> <strong>Rejected Edge:</strong> Node already visited.</div>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '16px', height: '4px', backgroundColor: '#64748b'}}></div> <strong>Unevaluated Edge.</strong></div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default GraphCanvas;