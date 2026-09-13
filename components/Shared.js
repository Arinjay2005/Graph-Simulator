// ================================================================
// CONSTANTS
// ================================================================
export const VERTEX_RADIUS = 18;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// ================================================================
// GEOMETRY — hit-testing helpers
// ================================================================

// Shortest distance from point (px, py) to the segment (x1,y1)-(x2,y2).`
// Used to detect clicks on edges (delete-edge / edit-weight modes).
export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.sqrt(Math.pow(px - projX, 2) + Math.pow(py - projY, 2));
}

// ================================================================
// GRAPH PARSING — text <-> graph conversions
// (matrix / adjacency-list input parsing + export text builders)
// ================================================================

// Lays vertices out evenly around a circle. Used whenever a graph is
// (re)generated from matrix/list input, since raw input has no coordinates.
export function generateCircularLayout(nodeIds, width = CANVAS_WIDTH, height = CANVAS_HEIGHT) {
  const newVertices = [];
  const numVertices = nodeIds.length;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) - 80;
  for (let i = 0; i < numVertices; i++) {
    const theta = (2 * Math.PI * i) / numVertices - (Math.PI / 2);
    newVertices.push({
      id: nodeIds[i],
      x: Math.round(centerX + radius * Math.cos(theta)),
      y: Math.round(centerY + radius * Math.sin(theta)),
    });
  }
  return newVertices;
}

// Parses an NxN adjacency-matrix text block. Throws Error with a
// human-readable message on any validation failure.
// Returns { nodeIds, edges }.
export function parseMatrixInput(matrixInput) {
  if (!matrixInput.trim()) throw new Error('Matrix is empty.');
  const rows = matrixInput
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((row) => row.trim().split(/\s+/).map(Number));
  const numVertices = rows.length;
  if (rows.some((row) => row.length !== numVertices)) {
    throw new Error('Matrix must be strictly NxN (square).');
  }

  for (let i = 0; i < numVertices; i++) {
    for (let j = 0; j < numVertices; j++) {
      if (!Number.isInteger(rows[i][j])) {
        throw new Error(`Decimal weight not possible (Node ${i + 1} to Node ${j + 1}).`);
      }
      if (rows[i][j] !== rows[j][i]) {
        if (rows[i][j] === 0 || rows[j][i] === 0) {
          const source = rows[i][j] !== 0 ? i + 1 : j + 1;
          const target = rows[i][j] !== 0 ? j + 1 : i + 1;
          throw new Error(
            `Node ${source} connects to Node ${target}, but Node ${target} does not connect back to Node ${source}.`
          );
        } else {
          throw new Error(
            `Weight mismatch: Node ${i + 1}->${j + 1} is ${rows[i][j]}, but Node ${j + 1}->${i + 1} is ${rows[j][i]}.`
          );
        }
      }
    }
  }

  const nodeIds = Array.from({ length: numVertices }, (_, i) => i + 1);
  const edges = [];
  for (let i = 0; i < numVertices; i++) {
    for (let j = i + 1; j < numVertices; j++) {
      if (rows[i][j] !== 0) edges.push({ source: i + 1, target: j + 1, weight: rows[i][j] });
    }
  }
  return { nodeIds, edges };
}

// Parses "id: target(weight), target(weight)" style adjacency-list text.
// Throws Error with a human-readable message on any validation failure.
// Returns { nodeIds, edges }.
export function parseListInput(listInput) {
  if (!listInput.trim()) throw new Error('List is empty.');
  const lines = listInput.trim().split('\n').filter((line) => line.trim() !== '');
  const parsedGraph = {};
  const uniqueIds = new Set();

  lines.forEach((line) => {
    if (!line.includes(':')) return;
    const [sourceStr, targetsStr] = line.split(':');
    const sourceId = parseInt(sourceStr.trim(), 10);
    if (isNaN(sourceId)) return;
    uniqueIds.add(sourceId);
    if (!parsedGraph[sourceId]) parsedGraph[sourceId] = new Map();

    if (targetsStr && targetsStr.trim() !== '') {
      const targets = targetsStr.split(',');
      targets.forEach((targetRaw) => {
        const match = targetRaw.trim().match(/(\d+)(?:\(([^)]+)\))?/);
        if (match) {
          const targetId = parseInt(match[1], 10);
          let weight = 1;
          if (match[2]) {
            if (match[2].includes('.')) {
              throw new Error(`Decimal weight not possible (Edge from Node ${sourceId} to Node ${targetId}).`);
            }
            weight = parseInt(match[2], 10);
            if (isNaN(weight)) {
              throw new Error(`Invalid weight provided (Edge from Node ${sourceId} to Node ${targetId}).`);
            }
          }
          if (weight === 0) {
            throw new Error(`0 weight not possible (Edge from Node ${sourceId} to Node ${targetId}).`);
          }
          uniqueIds.add(targetId);
          parsedGraph[sourceId].set(targetId, weight);
        }
      });
    }
  });

  if (uniqueIds.size === 0) throw new Error('Could not detect any valid vertices.');

  const edges = [];
  for (const [sourceStr, targetMap] of Object.entries(parsedGraph)) {
    const sourceId = parseInt(sourceStr, 10);
    for (const [targetId, weight] of targetMap.entries()) {
      if (!parsedGraph[targetId] || !parsedGraph[targetId].has(sourceId)) {
        throw new Error(
          `Node ${sourceId} connects to Node ${targetId}, but Node ${targetId} does not connect back to Node ${sourceId}.`
        );
      }
      if (parsedGraph[targetId].get(sourceId) !== weight) {
        throw new Error(
          `Weight mismatch: Node ${sourceId}->${targetId} is ${weight}, but Node ${targetId}->Node ${sourceId} is ${parsedGraph[targetId].get(sourceId)}.`
        );
      }
      if (sourceId < targetId) edges.push({ source: sourceId, target: targetId, weight });
    }
  }
  const nodeIds = Array.from(uniqueIds).sort((a, b) => a - b);
  return { nodeIds, edges };
}

// Builds "id: target(weight), ..." text for a given node/edge set.
// Used both for the live matrix/list sync and for BFS-tree export.
export function buildAdjacencyListText(nodeIds, edges, isWeighted) {
  let listStr = '';
  nodeIds.forEach((id) => {
    const connected = [];
    edges.forEach((e) => {
      if (e.source === id) connected.push({ target: e.target, weight: e.weight });
      if (e.target === id) connected.push({ target: e.source, weight: e.weight });
    });
    connected.sort((a, b) => a.target - b.target);
    if (connected.length > 0) {
      const edgeStrings = connected.map((c) => (isWeighted ? `${c.target}(${c.weight || 1})` : `${c.target}`));
      listStr += `${id}: ${edgeStrings.join(', ')}\n`;
    } else {
      listStr += `${id}:\n`;
    }
  });
  return listStr.trim();
}

// Builds NxN adjacency-matrix text for a given node/edge set.
// Used both for the live matrix/list sync and for BFS-tree export.
export function buildAdjacencyMatrixText(nodeIds, edges, isWeighted) {
  const idToIndex = {};
  nodeIds.forEach((id, idx) => { idToIndex[id] = idx; });
  const n = nodeIds.length;
  const matrix = Array(n).fill(0).map(() => Array(n).fill(0));

  edges.forEach((e) => {
    const i = idToIndex[e.source];
    const j = idToIndex[e.target];
    if (i !== undefined && j !== undefined) {
      const w = isWeighted ? (e.weight || 1) : 1;
      matrix[i][j] = w;
      matrix[j][i] = w;
    }
  });

  return matrix.map((row) => row.join(' ')).join('\n');
}

// ================================================================
// CANVAS DRAWING PRIMITIVES
// (low-level shapes; algorithm-specific coloring lives in bfs.js /
// force-directed.js, which call into these)
// ================================================================

export function drawEdgeLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawWeightLabel(ctx, midX, midY, weight, bgColor, textColor) {
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  const textWidth = ctx.measureText(weight).width;
  ctx.fillStyle = bgColor;
  ctx.fillRect(midX - textWidth / 2 - 4, midY - 10, textWidth + 8, 20);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(weight, midX, midY);
}

export function drawVertexShape(ctx, x, y, id, fillColor, highlighted) {
  ctx.beginPath();
  ctx.arc(x, y, VERTEX_RADIUS, 0, 2 * Math.PI);
  ctx.fillStyle = fillColor;
  ctx.fill();

  if (highlighted) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.fillText(id, x, y);
}

// Generic "plain" graph render — used for the default draw/edit view and
// for the force-directed simulation (which has no special node coloring,
// just different positions per frame).
export function drawGraph(ctx, vertices, edges, { mode, isWeighted, selectedVertexId } = {}) {
  edges.forEach((edge) => {
    const source = vertices.find((v) => v.id === edge.source);
    const target = vertices.find((v) => v.id === edge.target);
    if (!source || !target) return;

    const edgeColor = mode === 'deleteEdge' ? '#ff453a' : mode === 'editWeight' ? '#ff9f0a' : '#888';
    drawEdgeLine(ctx, source.x, source.y, target.x, target.y, edgeColor, 3);

    if (isWeighted && edge.weight !== undefined) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      drawWeightLabel(ctx, midX, midY, edge.weight, '#0f172a', '#34d399');
    }
  });

  vertices.forEach((vertex) => {
    let fillColor = vertex.id === selectedVertexId ? '#ff3b30' : '#0a84ff';
    if (mode === 'deleteNode') fillColor = '#ff453a';
    drawVertexShape(ctx, vertex.x, vertex.y, vertex.id, fillColor, false);
  });
}