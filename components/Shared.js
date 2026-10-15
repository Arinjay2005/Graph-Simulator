// CONSTANTS
export const VERTEX_RADIUS = 18;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const GRID_SIZE = 40;

export function getGraphCanvasDimensions(vertices, edges, state) {
  if (!state || !state.fitCanvas) {
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, offsetX: 0, offsetY: 0 };
  }

  const positions = state && state.pointPositions ? state.pointPositions : {};
  const points = vertices.map((vertex) => positions[String(vertex.id)] || vertex);
  Object.values(positions).forEach((point) => points.push(point));
  edges.forEach((edge, edgeIdx) => {
    (edge.bends || []).forEach((bend, bendIdx) => {
      points.push(positions[`d${edgeIdx}_${bendIdx}`] || bend);
    });
  });

  if (state) {
    (state.dummyVertices || []).forEach((point) => points.push(point));
    (state.extendEdges || []).forEach((edge) => points.push(edge.from, edge.to));
    (state.borderEdges || []).forEach((edge) => points.push(edge.from, edge.to));
    if (state.showBoundingBox) {
      (state.boundingBoxSegments || []).forEach((segment) => points.push(segment.a, segment.b));
    }
  }

  if (points.length === 0) {
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, offsetX: 0, offsetY: 0 };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const margin = GRID_SIZE;
  const contentWidth = maxX - minX + margin * 2;
  const contentHeight = maxY - minY + margin * 2;
  const width = Math.ceil(Math.max(CANVAS_WIDTH, contentWidth, contentHeight * (4 / 3)) / 4) * 4;
  const height = width * (3 / 4);

  return {
    width,
    height,
    offsetX: margin + (width - contentWidth) / 2 - minX,
    offsetY: margin + (height - contentHeight) / 2 - minY,
  };
}

export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.sqrt(Math.pow(px - projX, 2) + Math.pow(py - projY, 2));
}

// Faint dotted/dashed grid background for Orthogonal Mode.
export function drawGrid(ctx, width, height, gridSize = GRID_SIZE, bounds = null, labelScale = 1) {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const minX = bounds ? Math.floor(bounds.minX / gridSize) * gridSize : 0;
  const maxX = bounds ? Math.ceil(bounds.maxX / gridSize) * gridSize : width;
  const minY = bounds ? Math.floor(bounds.minY / gridSize) * gridSize : 0;
  const maxY = bounds ? Math.ceil(bounds.maxY / gridSize) * gridSize : height;

  const viewLeft = bounds ? bounds.minX : 0;
  const viewTop = bounds ? bounds.minY : 0;

  for (let x = minX; x <= maxX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
    ctx.stroke();
  }
  for (let y = minY; y <= maxY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(71, 85, 105, 0.9)';
  ctx.font = `${11 * labelScale}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const xTickCount = Math.floor((maxX - minX) / gridSize) + 1;
  for (let tick = 0; tick < xTickCount; tick++) {
    const x = minX + tick * gridSize;
    ctx.textAlign = tick === 0 ? 'left' : tick === xTickCount - 1 ? 'right' : 'center';
    ctx.fillText(`X ${x}`, tick === 0 ? x + 3 * labelScale : tick === xTickCount - 1 ? x - 3 * labelScale : x, viewTop + 5 * labelScale);
  }
  
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  const yTickCount = Math.floor((maxY - minY) / gridSize) + 1;
  for (let tick = 0; tick < yTickCount; tick++) {
    const y = minY + tick * gridSize;
    const labelY = tick === 0 ? y + 7 * labelScale : tick === yTickCount - 1 ? y - 7 * labelScale : y;
    ctx.fillText(`Y ${y}`, viewLeft + 5 * labelScale, labelY);
  }

  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
  for (let x = minX; x <= maxX; x += gridSize) {
    for (let y = minY; y <= maxY; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Grid Point Highlighter
export function drawGridHover(ctx, hover, bounds, labelScale = 1) {
  if (!hover || !bounds) return;
  const accent = '#0a84ff';
  ctx.save();

  ctx.setLineDash([6 * labelScale, 4 * labelScale]);
  ctx.strokeStyle = 'rgba(10, 132, 255, 0.55)';
  ctx.lineWidth = 1.5 * labelScale;
  ctx.beginPath();
  ctx.moveTo(hover.x, bounds.minY);
  ctx.lineTo(hover.x, bounds.maxY);
  ctx.moveTo(bounds.minX, hover.y);
  ctx.lineTo(bounds.maxX, hover.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(hover.x, hover.y, 6 * labelScale, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(10, 132, 255, 0.25)';
  ctx.fill();
  ctx.lineWidth = 2 * labelScale;
  ctx.strokeStyle = accent;
  ctx.stroke();

  const pill = (x, y, w, h, text) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4 * labelScale);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + labelScale * 0.5);
  };

  ctx.font = `bold ${12 * labelScale}px "Segoe UI", sans-serif`;
  const h = 18 * labelScale;
  const pad = 10 * labelScale;
  const xText = `X ${hover.x}`;
  const yText = `Y ${hover.y}`;
  const xw = ctx.measureText(xText).width + pad;
  const yw = ctx.measureText(yText).width + pad;
  const xLeft = Math.max(bounds.minX + 2 * labelScale, Math.min(bounds.maxX - xw - 2 * labelScale, hover.x - xw / 2));
  const yTop = Math.max(bounds.minY + h + 4 * labelScale, Math.min(bounds.maxY - h - 2 * labelScale, hover.y - h / 2));
  pill(xLeft, bounds.minY + 2 * labelScale, xw, h, xText);
  pill(bounds.minX + 2 * labelScale, yTop, yw, h, yText);

  ctx.restore();
}

// Rounds a raw canvas coordinate to the nearest grid intersection.
export function snapToGrid(x, y, gridSize = GRID_SIZE) {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

// Orientation of the turn +1 = counter-clockwise, -1 = clockwise, 0 = collinear.
export function orientation(p, q, r) {
  const val = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : -1;
}

function onSegmentCollinear(p, q, r) {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-6 &&
    q.x >= Math.min(p.x, r.x) - 1e-6 &&
    q.y <= Math.max(p.y, r.y) + 1e-6 &&
    q.y >= Math.min(p.y, r.y) - 1e-6
  );
}

const samePoint = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

// True if `point` lies essentially ON the segment (p1,p2)
export function isPointOnSegment(point, p1, p2, epsilon = 0.75) {
  return pointToSegmentDistance(point.x, point.y, p1.x, p1.y, p2.x, p2.y) <= epsilon;
}

export function doLineSegmentsIntersect(p1, q1, p2, q2) {
  const sharesEndpoint =
    samePoint(p1, p2) || samePoint(p1, q2) || samePoint(q1, p2) || samePoint(q1, q2);

  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return !sharesEndpoint;
  }

  if (o1 === 0 && onSegmentCollinear(p1, p2, q1)) return !sharesEndpoint;
  if (o2 === 0 && onSegmentCollinear(p1, q2, q1)) return !sharesEndpoint;
  if (o3 === 0 && onSegmentCollinear(p2, p1, q2)) return !sharesEndpoint;
  if (o4 === 0 && onSegmentCollinear(p2, q1, q2)) return !sharesEndpoint;

  return false;
}

// GRAPH PARSING — text <-> graph conversions
// (matrix / adjacency-list input parsing + export text builders)
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

export function drawGraph(ctx, vertices, edges, { mode, isWeighted, selectedVertexId } = {}) {
  edges.forEach((edge) => {
    const source = vertices.find((v) => v.id === edge.source);
    const target = vertices.find((v) => v.id === edge.target);
    if (!source || !target) return;

    const edgeColor = mode === 'deleteEdge' ? '#ff453a' : mode === 'editWeight' ? '#ff9f0a' : '#888';
    const chain = [source, ...(edge.bends || []), target];
    for (let i = 0; i < chain.length - 1; i++) {
      drawEdgeLine(ctx, chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y, edgeColor, 3);
    }

    if (edge.bends && edge.bends.length > 0) {
      edge.bends.forEach((b) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = edgeColor;
        ctx.fill();
      });
    }

    if (isWeighted && edge.weight !== undefined) {
      const mid = chain[Math.floor((chain.length - 1) / 2)];
      const midNext = chain[Math.floor((chain.length - 1) / 2) + 1];
      const midX = (mid.x + midNext.x) / 2;
      const midY = (mid.y + midNext.y) / 2;
      drawWeightLabel(ctx, midX, midY, edge.weight, '#0f172a', '#34d399');
    }
  });

  vertices.forEach((vertex) => {
    let fillColor = vertex.id === selectedVertexId ? '#ff3b30' : '#0a84ff';
    if (mode === 'deleteNode') fillColor = '#ff453a';
    drawVertexShape(ctx, vertex.x, vertex.y, vertex.id, fillColor, false);
  });
}