import { orientation, doLineSegmentsIntersect, isPointOnSegment, pointToSegmentDistance } from './Shared';

const COMPASS = ['N', 'E', 'S', 'W'];
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

export const samePointish = (a, b, eps = 0.5) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

function dirBetween(a, b) {
  if (Math.abs(a.x - b.x) < 0.5) return b.y > a.y ? 'S' : 'N';
  return b.x > a.x ? 'E' : 'W';
}

function rayDirVector(dir) {
  switch (dir) {
    case 'N': return { dx: 0, dy: -1 };
    case 'S': return { dx: 0, dy: 1 };
    case 'E': return { dx: 1, dy: 0 };
    case 'W': return { dx: -1, dy: 0 };
    default: return { dx: 0, dy: 0 };
  }
}

function shoelaceArea(corners) {
  let sum = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}


export function buildPointGraph(vertices, edges) {
  const points = new Map();

  vertices.forEach((v) => {
    points.set(String(v.id), {
      id: String(v.id),
      realId: v.id,
      x: v.x,
      y: v.y,
      isDummy: false,
      neighbors: { N: null, E: null, S: null, W: null },
      edgeRef: { N: null, E: null, S: null, W: null },
    });
  });

  const link = (a, b, edge) => {
    const dir = dirBetween(a, b);
    if (a.neighbors[dir]) {
      throw new Error(`Point at (${Math.round(a.x)}, ${Math.round(a.y)}) already has two edges going ${dir} — overlapping edges.`);
    }
    a.neighbors[dir] = b.id;
    a.edgeRef[dir] = edge;
    const back = OPPOSITE[dir];
    if (b.neighbors[back]) {
      throw new Error(`Point at (${Math.round(b.x)}, ${Math.round(b.y)}) already has two edges going ${back} — overlapping edges.`);
    }
    b.neighbors[back] = a.id;
    b.edgeRef[back] = edge;
  };

  edges.forEach((edge, edgeIdx) => {
    const src = points.get(String(edge.source));
    const tgt = points.get(String(edge.target));
    if (!src || !tgt) return;

    const chain = [src];
    (edge.bends || []).forEach((b, bIdx) => {
      const id = `d${edgeIdx}_${bIdx}`;
      const bp = {
        id,
        realId: null,
        x: b.x,
        y: b.y,
        isDummy: true,
        neighbors: { N: null, E: null, S: null, W: null },
        edgeRef: { N: null, E: null, S: null, W: null },
      };
      points.set(id, bp);
      chain.push(bp);
    });
    chain.push(tgt);

    for (let i = 0; i < chain.length - 1; i++) link(chain[i], chain[i + 1], edge);
  });

  return points;
}

export function linkPoints(points, aId, bId, edgeRef = null) {
  const a = points.get(aId);
  const b = points.get(bId);
  const dir = dirBetween(a, b);
  const back = OPPOSITE[dir];
  if (a.neighbors[dir]) {
    throw new Error(`Point at (${Math.round(a.x)}, ${Math.round(a.y)}) already has an edge going ${dir}.`);
  }
  if (b.neighbors[back]) {
    throw new Error(`Point at (${Math.round(b.x)}, ${Math.round(b.y)}) already has an edge going ${back}.`);
  }
  a.neighbors[dir] = bId;
  a.edgeRef[dir] = edgeRef;
  b.neighbors[back] = aId;
  b.edgeRef[back] = edgeRef;
}

export function splitSegmentAt(points, fromId, dir, newPoint) {
  const a = points.get(fromId);
  const toId = a.neighbors[dir];
  const b = points.get(toId);
  const edgeRef = a.edgeRef[dir];
  const backDir = OPPOSITE[dir];

  newPoint.neighbors = { N: null, E: null, S: null, W: null };
  newPoint.edgeRef = { N: null, E: null, S: null, W: null };
  points.set(newPoint.id, newPoint);

  a.neighbors[dir] = newPoint.id;
  a.edgeRef[dir] = edgeRef;
  newPoint.neighbors[backDir] = fromId;
  newPoint.edgeRef[backDir] = edgeRef;

  newPoint.neighbors[dir] = toId;
  newPoint.edgeRef[dir] = edgeRef;
  b.neighbors[backDir] = newPoint.id;
  b.edgeRef[backDir] = edgeRef;

  return newPoint;
}

// VALIDATION

export function validateOrthogonalGraph(vertices, edges) {
  if (vertices.length === 0) {
    return { valid: false, message: 'Draw a graph first — the canvas is empty.' };
  }

  for (const edge of edges) {
    const src = vertices.find((v) => v.id === edge.source);
    const tgt = vertices.find((v) => v.id === edge.target);
    if (!src || !tgt) continue;
    const chain = [src, ...(edge.bends || []), tgt];
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > 0.5 && dy > 0.5) {
        return { valid: false, message: `Edge ${edge.source}→${edge.target} has a diagonal segment — every segment must be strictly horizontal or vertical.` };
      }
      if (dx <= 0.5 && dy <= 0.5) {
        return { valid: false, message: `Edge ${edge.source}→${edge.target} has a zero-length segment.` };
      }
    }
  }

  let points;
  try {
    points = buildPointGraph(vertices, edges);
  } catch (err) {
    return { valid: false, message: err.message };
  }

  const allSegments = [];
  edges.forEach((edge) => {
    const src = vertices.find((v) => v.id === edge.source);
    const tgt = vertices.find((v) => v.id === edge.target);
    if (!src || !tgt) return;
    const chain = [src, ...(edge.bends || []), tgt];
    for (let i = 0; i < chain.length - 1; i++) {
      allSegments.push({ a: chain[i], b: chain[i + 1], label: `${edge.source}→${edge.target}` });
    }
  });

  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const s1 = allSegments[i];
      const s2 = allSegments[j];
      if (doLineSegmentsIntersect(s1.a, s1.b, s2.a, s2.b)) {
        return { valid: false, message: `Edges ${s1.label} and ${s2.label} cross — the drawing must be planar.` };
      }
    }
  }

  for (const seg of allSegments) {
    for (const v of vertices) {
      if (samePointish(v, seg.a) || samePointish(v, seg.b)) continue;
      if (isPointOnSegment(v, seg.a, seg.b)) {
        return { valid: false, message: `Edge ${seg.label} passes through vertex ${v.id} without connecting to it.` };
      }
    }
  }

  const startId = points.keys().next().value;
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const cur = points.get(queue.shift());
    COMPASS.forEach((d) => {
      const nb = cur.neighbors[d];
      if (nb && !seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    });
  }
  if (seen.size !== points.size) {
    return { valid: false, message: 'The graph must be fully connected — every vertex/bend needs a path to every other.' };
  }

  for (const v of vertices) {
    const p = points.get(String(v.id));
    const degree = COMPASS.filter((d) => p.neighbors[d]).length;
    if (degree < 2 || degree > 4) {
      return { valid: false, message: `Vertex ${v.id} has degree ${degree} — every vertex needs degree 2, 3, or 4 (no dangling edges).` };
    }
  }

  return { valid: true, points };
}

// FACE TRACING

export function traceFaceFromSeed(points, fromId, dir) {
  const corners = [];
  let curFromId = fromId;
  let curDir = dir;
  let curToId = points.get(fromId).neighbors[dir];
  if (!curToId) throw new Error(`Face trace seed (${fromId}, ${dir}) is no longer valid.`);
  const startKey = `${curFromId}->${curToId}`;
  let guard = 0;

  do {
    const toPoint = points.get(curToId);
    corners.push({
      pointId: curToId,
      x: toPoint.x,
      y: toPoint.y,
      isDummy: toPoint.isDummy,
      arrivingDir: curDir,
      edgeRef: points.get(curFromId).edgeRef[curDir],
    });

    const backDir = OPPOSITE[curDir];
    const startIdx = (COMPASS.indexOf(backDir) + 1) % 4;
    let nextDir = null;
    for (let i = 0; i < 4; i++) {
      const cand = COMPASS[(startIdx + i) % 4];
      if (toPoint.neighbors[cand]) {
        nextDir = cand;
        break;
      }
    }
    if (!nextDir) throw new Error(`Dead end while tracing a face at point (${Math.round(toPoint.x)}, ${Math.round(toPoint.y)}).`);

    curFromId = curToId;
    curDir = nextDir;
    curToId = toPoint.neighbors[nextDir];

    guard++;
    if (guard > points.size * 4 + 20) throw new Error('Face trace failed to close — check graph validity.');
  } while (`${curFromId}->${curToId}` !== startKey);

  return corners;
}

export function traceFaces(points) {
  const visited = new Set();
  const faces = [];

  for (const u of points.values()) {
    for (const d of COMPASS) {
      const vId = u.neighbors[d];
      if (!vId) continue;
      const startKey = `${u.id}->${vId}`;
      if (visited.has(startKey)) continue;

      const corners = traceFaceFromSeed(points, u.id, d);

      let prevId = u.id;
      corners.forEach((c) => {
        visited.add(`${prevId}->${c.pointId}`);
        prevId = c.pointId;
      });

      faces.push({ corners, seedFromId: u.id, seedDir: d });
    }
  }

  return faces;
}

export function computeTurns(faceCorners) {
  const n = faceCorners.length;

  return faceCorners.map((corner, i) => {
    const prev = faceCorners[(i - 1 + n) % n];
    const next = faceCorners[(i + 1) % n];
    const raw = orientation(prev, corner, next);
    
    let turn = 0;
    if (raw !== 0) turn = raw === -1 ? 1 : -1; 
    
    return { ...corner, turn };
  });
}

export function identifyOuterFace(faces) {
  let outerIdx = 0;
  let minSum = Infinity;

  faces.forEach((f, i) => {
    const turns = computeTurns(f.corners);
    const sum = turns.reduce((acc, corner) => acc + corner.turn, 0);

    if (sum < minSum) {
      minSum = sum;
      outerIdx = i;
    }
  });

  return outerIdx;
}

export function castRayToSegments(origin, dir, cornersCycle) {
  const { dx, dy } = rayDirVector(dir);
  if (dx === 0 && dy === 0) return null;
  const n = cornersCycle.length;
  let best = null;

  for (let i = 0; i < n; i++) {
    const a = cornersCycle[i];
    const b = cornersCycle[(i + 1) % n];
    const segIsVertical = Math.abs(a.x - b.x) < 0.5;
    const rayIsVertical = dx === 0;
    if (segIsVertical === rayIsVertical) continue;

    if (rayIsVertical) {
      const segY = a.y;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      if (origin.x < minX - 0.5 || origin.x > maxX + 0.5) continue;
      const ahead = (segY - origin.y) * dy;
      if (ahead <= 0.5) continue;
      const dist = Math.abs(segY - origin.y);
      if (!best || dist < best.dist) best = { x: origin.x, y: segY, dist, segIndex: i };
    } else {
      const segX = a.x;
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (origin.y < minY - 0.5 || origin.y > maxY + 0.5) continue;
      const ahead = (segX - origin.x) * dx;
      if (ahead <= 0.5) continue;
      const dist = Math.abs(segX - origin.x);
      if (!best || dist < best.dist) best = { x: segX, y: origin.y, dist, segIndex: i };
    }
  }

  return best;
}

export function findFrontIndex(corners, i) {
  const n = corners.length;
  let sum = 0;
  for (let steps = 0; steps < n; steps++) {
    const k = (i + steps) % n;
    sum += corners[k].turn;
    if (sum === 1) return (k + 1) % n;
  }
  return null;
}

export function projectRayOntoLine(corner, dir, segA, segB) {
  const { dx, dy } = rayDirVector(dir);
  if (dx === 0 && dy === 0) return null;
  const segIsVertical = Math.abs(segA.x - segB.x) < 0.5;
  const rayIsVertical = dx === 0;
  if (segIsVertical === rayIsVertical) return null;

  if (rayIsVertical) {
    const segY = segA.y;
    const ahead = (segY - corner.y) * dy;
    if (ahead <= 0.5) return null;
    return { x: corner.x, y: segY };
  }

  const segX = segA.x;
  const ahead = (segX - corner.x) * dx;
  if (ahead <= 0.5) return null;
  return { x: segX, y: corner.y };
}

export function addBoundingBoxToGraph(points, boxCorners) {
  const mk = (id, pt) => ({
    id, x: pt.x, y: pt.y, isDummy: true,
    neighbors: { N: null, E: null, S: null, W: null },
    edgeRef: { N: null, E: null, S: null, W: null },
  });
  const tl = mk('bx_tl', boxCorners.tl);
  const tr = mk('bx_tr', boxCorners.tr);
  const br = mk('bx_br', boxCorners.br);
  const bl = mk('bx_bl', boxCorners.bl);
  [tl, tr, br, bl].forEach((p) => points.set(p.id, p));

  linkPoints(points, 'bx_tl', 'bx_tr');
  linkPoints(points, 'bx_tr', 'bx_br');
  linkPoints(points, 'bx_br', 'bx_bl');
  linkPoints(points, 'bx_bl', 'bx_tl');

  return { seedFromId: 'bx_tl', seedDir: 'E' };
}

export function computeBoundingBoxSegments(vertices, edges, margin = 40) {
  const allPts = [...vertices];
  edges.forEach((e) => (e.bends || []).forEach((b) => allPts.push(b)));
  if (allPts.length === 0) return { segments: [], corners: null };

  const minX = Math.min(...allPts.map((p) => p.x)) - margin;
  const maxX = Math.max(...allPts.map((p) => p.x)) + margin;
  const minY = Math.min(...allPts.map((p) => p.y)) - margin;
  const maxY = Math.max(...allPts.map((p) => p.y)) + margin;

  const corners = {
    tl: { x: minX, y: minY },
    tr: { x: maxX, y: minY },
    br: { x: maxX, y: maxY },
    bl: { x: minX, y: maxY },
  };
  const segments = [
    { a: corners.tl, b: corners.tr },
    { a: corners.tr, b: corners.br },
    { a: corners.br, b: corners.bl },
    { a: corners.bl, b: corners.tl },
  ];
  return { segments, corners };
}

// ORTHOGONAL-MODE DRAW-TIME VALIDATION

export function checkOrthogonalSegment(a, b, vertices, edges, inProgressPoints = []) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx > 0.5 && dy > 0.5) return 'Segment must be strictly horizontal or vertical.';
  if (dx <= 0.5 && dy <= 0.5) return 'That point is the same as the last one.';

  const existingSegments = [];
  edges.forEach((edge) => {
    const src = vertices.find((v) => v.id === edge.source);
    const tgt = vertices.find((v) => v.id === edge.target);
    if (!src || !tgt) return;
    const chain = [src, ...(edge.bends || []), tgt];
    for (let i = 0; i < chain.length - 1; i++) {
      existingSegments.push({ a: chain[i], b: chain[i + 1] });
    }
  });
  
  for (let i = 0; i < inProgressPoints.length - 1; i++) {
    existingSegments.push({ a: inProgressPoints[i], b: inProgressPoints[i + 1] });
  }

  for (const seg of existingSegments) {
    if (doLineSegmentsIntersect(a, b, seg.a, seg.b)) {
      return 'That segment crosses an existing edge — the drawing must stay planar.';
    }
    
    const isHorizAB = Math.abs(a.y - b.y) < 0.5;
    const isHorizCD = Math.abs(seg.a.y - seg.b.y) < 0.5;
    if (isHorizAB && isHorizCD && Math.abs(a.y - seg.a.y) < 0.5) {
       const minX1 = Math.min(a.x, b.x), maxX1 = Math.max(a.x, b.x);
       const minX2 = Math.min(seg.a.x, seg.b.x), maxX2 = Math.max(seg.a.x, seg.b.x);
       if (Math.max(minX1, minX2) < Math.min(maxX1, maxX2)) return 'Overlaps directly over an existing horizontal line.';
    }

    const isVertAB = Math.abs(a.x - b.x) < 0.5;
    const isVertCD = Math.abs(seg.a.x - seg.b.x) < 0.5;
    if (isVertAB && isVertCD && Math.abs(a.x - seg.a.x) < 0.5) {
       const minY1 = Math.min(a.y, b.y), maxY1 = Math.max(a.y, b.y);
       const minY2 = Math.min(seg.a.y, seg.b.y), maxY2 = Math.max(seg.a.y, seg.b.y);
       if (Math.max(minY1, minY2) < Math.min(maxY1, maxY2)) return 'Overlaps directly over an existing vertical line.';
    }
  }

  for (const v of vertices) {
    if (samePointish(v, a) || samePointish(v, b)) continue;
    if (isPointOnSegment(v, a, b)) {
      return `That segment passes through vertex ${v.id} without connecting to it.`;
    }
  }

  return null;
}