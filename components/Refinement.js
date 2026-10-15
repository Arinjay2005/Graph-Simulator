import { useEffect } from 'react';
import { drawGraph, VERTEX_RADIUS, GRID_SIZE, isPointOnSegment, doLineSegmentsIntersect } from './Shared';
import {
  validateOrthogonalGraph,
  traceFaces,
  traceFaceFromSeed,
  identifyOuterFace,
  computeTurns,
  castRayToSegments,
  findFrontIndex,
  projectRayOntoLine,
  addBoundingBoxToGraph,
  computeBoundingBoxSegments,
  linkPoints,
  splitSegmentAt,
  samePointish,
} from './RefinementGeometry';

function refinementFailure(message, failureEdges = []) {
  const error = new Error(message);
  error.failureEdges = failureEdges.filter(Boolean);
  error.failureType = 'projection';
  return error;
}

const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

function segmentDirection(a, b) {
  if (Math.abs(a.x - b.x) < 0.5) return b.y > a.y ? 'S' : 'N';
  return b.x > a.x ? 'E' : 'W';
}

function failureEdge(edge, role, segment, liveSegment) {
  return edge && segment ? { edge, role, segment, liveSegment } : null;
}

function buildFrontTraversal(corners, startIndex, frontIndex) {
  const traversal = [];
  let cumulative = 0;
  let index = startIndex;

  while (true) {
    const corner = corners[index];
    traversal.push({
      x: corner.x,
      y: corner.y,
      previous: corners[(index - 1 + corners.length) % corners.length],
      edge: corner.edgeRef || null,
      turn: corner.turn,
      cumulative,
      isStart: index === startIndex,
      isFront: index === frontIndex,
    });
    if (index === frontIndex) break;
    cumulative += corner.turn;
    index = (index + 1) % corners.length;
  }

  return traversal;
}

function getLiveCorner(corner, points) {
  const livePoint = points.get(corner.pointId);
  return { ...corner, x: livePoint.x, y: livePoint.y };
}

function getPointPositions(points) {
  return Object.fromEntries(Array.from(points, ([id, point]) => [id, { x: point.x, y: point.y }]));
}

function buildLiveTraversal(corners, startIndex, frontIndex, points) {
  const traversal = buildFrontTraversal(corners, startIndex, frontIndex);
  return traversal.map((item, offset) => {
    const index = (startIndex + offset) % corners.length;
    const live = getLiveCorner(corners[index], points);
    const previous = getLiveCorner(corners[(index - 1 + corners.length) % corners.length], points);
    return { ...item, x: live.x, y: live.y, previous };
  });
}

function getWallChain(points, fromId, toId, direction) {
  const chain = [fromId];
  let currentId = fromId;
  for (let steps = 0; steps <= points.size; steps++) {
    if (currentId === toId) return chain;
    currentId = points.get(currentId).neighbors[direction];
    if (!currentId) break;
    chain.push(currentId);
  }
  throw new Error('front(e) is no longer a connected wall');
}

function validatePointGraph(points) {
  const segments = [];
  let invalidDirection = false;
  const directionChecks = {
    N: (a, b) => Math.abs(a.x - b.x) <= 0.5 && b.y < a.y - 0.5,
    E: (a, b) => Math.abs(a.y - b.y) <= 0.5 && b.x > a.x + 0.5,
    S: (a, b) => Math.abs(a.x - b.x) <= 0.5 && b.y > a.y + 0.5,
    W: (a, b) => Math.abs(a.y - b.y) <= 0.5 && b.x < a.x - 0.5,
  };
  points.forEach((point) => {
    ['N', 'E', 'S', 'W'].forEach((direction) => {
      const neighborId = point.neighbors[direction];
      if (!neighborId) return;
      const neighbor = points.get(neighborId);
      if (!directionChecks[direction](point, neighbor)) {
        invalidDirection = true;
        return;
      }
      if (direction === 'E' || direction === 'S') segments.push({ a: point, b: neighbor });
    });
  });
  if (invalidDirection) return 'the shift would make an edge non-orthogonal';

  for (let i = 0; i < segments.length; i++) {
    const first = segments[i];
    if (Math.abs(first.a.x - first.b.x) > 0.5 && Math.abs(first.a.y - first.b.y) > 0.5) {
      return 'the shift would make an edge diagonal';
    }
    if (Math.abs(first.a.x - first.b.x) <= 0.5 && Math.abs(first.a.y - first.b.y) <= 0.5) {
      return 'the shift would collapse an edge';
    }
    for (let j = i + 1; j < segments.length; j++) {
      if (doLineSegmentsIntersect(first.a, first.b, segments[j].a, segments[j].b)) {
        return 'the shift would make edges cross or overlap';
      }
    }
  }

  for (const point of points.values()) {
    for (const segment of segments) {
      if (point.id === segment.a.id || point.id === segment.b.id) continue;
      if (isPointOnSegment(point, segment.a, segment.b, 0.5)) {
        return 'the shift would make an edge pass through an unrelated vertex';
      }
    }
  }

  const boundaryPoints = Array.from(points.values()).filter((point) => String(point.id).startsWith('bx_'));
  if (boundaryPoints.length === 4) {
    const minX = Math.min(...boundaryPoints.map((point) => point.x));
    const maxX = Math.max(...boundaryPoints.map((point) => point.x));
    const minY = Math.min(...boundaryPoints.map((point) => point.y));
    const maxY = Math.max(...boundaryPoints.map((point) => point.y));
    for (const point of points.values()) {
      if (String(point.id).startsWith('bx_')) continue;
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
        return 'the shift would move the graph outside the outer boundary';
      }
    }
  }

  return null;
}

function repairFrontByMovingFarSide(points, corner, corners, cornerIndex, frontIndex, segA, segB, projected) {
  const horizontalFront = Math.abs(segA.y - segB.y) < 0.5;
  const coordinate = horizontalFront ? projected.x : projected.y;
  const aCoordinate = horizontalFront ? segA.x : segA.y;
  const bCoordinate = horizontalFront ? segB.x : segB.y;
  const frontDirection = Math.sign(bCoordinate - aCoordinate);
  if (!frontDirection || (coordinate - aCoordinate) * frontDirection <= 0.5) {
    throw new Error('project(e) is at or beyond the segA endpoint, and only segB may be moved');
  }

  const distanceFromFarEndpoint = (bCoordinate - coordinate) * frontDirection;
  if (distanceFromFarEndpoint >= GRID_SIZE - 0.5) return null;

  const targetCoordinate = coordinate + frontDirection * GRID_SIZE;
  const shiftAmount = targetCoordinate - bCoordinate;
  if (shiftAmount * frontDirection <= 0.5) {
    throw new Error('extending segB cannot place project(e) strictly inside front(e)');
  }

  const fixed = new Set();
  let index = cornerIndex;
  while (index !== frontIndex) {
    fixed.add(corners[index].pointId);
    index = (index + 1) % corners.length;
  }
  fixed.add(corner.pointId);
  fixed.add(segA.pointId);
  Array.from(points.keys()).filter((id) => String(id).startsWith('bx_')).forEach((id) => fixed.add(id));

  const perpendicularDirections = horizontalFront ? ['N', 'S'] : ['E', 'W'];
  const queue = [...fixed];
  while (queue.length > 0) {
    const point = points.get(queue.shift());
    perpendicularDirections.forEach((direction) => {
      const neighborId = point.neighbors[direction];
      if (neighborId && !fixed.has(neighborId)) {
        fixed.add(neighborId);
        queue.push(neighborId);
      }
    });
  }

  if (fixed.has(segB.pointId)) {
    throw new Error('segB is rigidly connected to the fixed face path');
  }

  const farSideCoordinate = horizontalFront ? segB.x : segB.y;
  const moving = new Set(Array.from(points.keys()).filter((id) => {
    if (fixed.has(id)) return false;
    if (id === segB.pointId) return true;
    const point = points.get(id);
    const coordinateOnShiftAxis = horizontalFront ? point.x : point.y;
    return (coordinateOnShiftAxis - farSideCoordinate) * Math.sign(shiftAmount) > 0.5;
  }));

  const movingQueue = [...moving];
  while (movingQueue.length > 0) {
    const point = points.get(movingQueue.shift());
    perpendicularDirections.forEach((direction) => {
      const neighborId = point.neighbors[direction];
      if (!neighborId || moving.has(neighborId)) return;
      if (fixed.has(neighborId)) {
        throw new Error('the segB-side shift is rigidly tied to the fixed face path');
      }
      moving.add(neighborId);
      movingQueue.push(neighborId);
    });
  }

  const movingIds = Array.from(moving);
  const previous = new Map(movingIds.map((id) => {
    const point = points.get(id);
    return [id, { x: point.x, y: point.y }];
  }));
  movingIds.forEach((id) => {
    const point = points.get(id);
    if (horizontalFront) point.x += shiftAmount;
    else point.y += shiftAmount;
  });

  const invalidReason = validatePointGraph(points);
  if (invalidReason) {
    previous.forEach((position, id) => Object.assign(points.get(id), position));
    throw new Error(invalidReason);
  }

  const movedSegB = points.get(segB.pointId);
  return {
    from: { x: segB.x, y: segB.y },
    to: { x: movedSegB.x, y: movedSegB.y },
    shiftAmount: Math.abs(shiftAmount),
    movedCount: movingIds.length,
  };
}

function splitFrontAtProjection(points, wallChain, direction, projected, newId) {
  for (let i = 0; i < wallChain.length - 1; i++) {
    const from = points.get(wallChain[i]);
    const to = points.get(wallChain[i + 1]);
    if (samePointish(projected, from, 0.5)) return from.id;
    if (samePointish(projected, to, 0.5)) return to.id;
    if (isPointOnSegment(projected, from, to, 0.5)) {
      splitSegmentAt(points, from.id, direction, { id: newId, x: projected.x, y: projected.y, isDummy: true });
      return newId;
    }
  }
  throw new Error('project(e) does not lie on the repaired front(e) wall');
}

// Algorithm

export function runRefinement(vertices, edges) {
  const validation = validateOrthogonalGraph(vertices, edges);
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const points = validation.points; 
  const originalPositions = new Map(Array.from(points, ([id, p]) => [id, { x: p.x, y: p.y }]));

  const mapSegmentToOriginal = (start, end) => {
    const live = { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    const dir = segmentDirection(start, end);
    let from = start.pointId;
    let to = end.pointId;
    for (let guard = 0; !originalPositions.has(from); guard++) {
      from = points.get(from) && points.get(from).neighbors[OPP[dir]];
      if (!from || guard > points.size) return { original: null, live };
    }
    for (let guard = 0; !originalPositions.has(to); guard++) {
      to = points.get(to) && points.get(to).neighbors[dir];
      if (!to || guard > points.size) return { original: null, live };
    }
    return { original: { start: originalPositions.get(from), end: originalPositions.get(to) }, live };
  };

  let rawFaces;
  try {
    rawFaces = traceFaces(points);
  } catch (err) {
    throw new Error('Could not trace faces: ' + err.message);
  }

  const outerIdx = identifyOuterFace(rawFaces);
  const faceOrder = rawFaces.map((_, i) => i).filter((i) => i !== outerIdx).concat([outerIdx]);

  let boxSeed = null;
  let boundingBoxPreview = [];

  const history = [];
  const dummyVertices = [];
  const extendEdges = [];
  let shouldFitCanvas = false;
  let dummyCounter = 0;
  const knownDummyIds = new Set();

  const registerDummy = (id, x, y, kind) => {
    if (knownDummyIds.has(id)) return;
    knownDummyIds.add(id);
    dummyVertices.push({ id, x, y, kind });
  };

  const getOriginalPoints = () =>
    Array.from(points.values()).filter((point) => !String(point.id).startsWith('bx_'));
  const refreshBoxPreview = () => {
    boundingBoxPreview = computeBoundingBoxSegments(getOriginalPoints(), []).segments;
  };

  const snapshot = (extra = {}) => {
    const state = {
      dummyVertices: [...dummyVertices],
      extendEdges: [...extendEdges],
      borderEdges: [],
      activeFaceIndex: null,
      activeCorner: null,
      highlightEdge: null,
      traversal: [],
      failureEdges: [],
      rayPreview: null,
      frontRepairEdge: null,
      fitCanvas: shouldFitCanvas,
      pointPositions: getPointPositions(points),
      boundingBoxSegments: boundingBoxPreview,
      showBoundingBox: false,
      message: '',
      ...extra,
    };
    state.dummyVertices = state.dummyVertices.map((dummy) => ({
      ...dummy,
      ...(state.pointPositions[dummy.id] || {}),
    }));
    state.extendEdges = state.extendEdges.map((edge) => ({
      from: state.pointPositions[edge.fromId] || edge.from,
      to: state.pointPositions[edge.toId] || edge.to,
    }));
    return state;
  };

  history.push(
    snapshot({
      message: `Starting rectangular refinement. Found ${faceOrder.length} face(s): ${faceOrder.length - 1} inner + 1 outer. Each inner face is walked counterclockwise and the outer face is walked clockwise; for every reflex corner (turn(e) = -1), front(e) is found by summing turn(e) values until they total 1 — then extend(e) is spliced in straight ahead, if the geometry actually lines up.`,
    })
  );

  try {
  faceOrder.forEach((faceIdx, orderPos) => {
    const isOuter = faceIdx === outerIdx;
    const faceLabel = isOuter ? 'outer face f0' : `inner face f${orderPos + 1}`;
    const seed = rawFaces[faceIdx];

    const initialDummyCount = dummyVertices.length;
    const initialExtendCount = extendEdges.length;

    if (isOuter) refreshBoxPreview();

    const originalCorners = computeTurns(traceFaceFromSeed(points, seed.seedFromId, seed.seedDir));
    const n = originalCorners.length;

    history.push(
      snapshot({
        activeFaceIndex: faceIdx,
        showBoundingBox: isOuter,
        message: `Now refining ${faceLabel} — labeling turn(e) for each of its ${n} boundary edge(s).` +
          (isOuter ? ' (Outer face: turn(e) sums to -4 here, so front(e) is undefined for some edges — those fall back to the dashed bounding rectangle.)' : ''),
      })
    );

    // Walk the boundary and label turn(e) for each edge, so we know which edges are reflex.
    originalCorners.forEach((corner) => {
      if (corner.isDummy) registerDummy(corner.pointId, corner.x, corner.y, 'bend');
      const turnText =
        corner.turn === 1
          ? 'a left turn — corner(e) is convex, nothing to do.'
          : corner.turn === -1
          ? 'a right turn — corner(e) is reflex; front(e) will be computed for it.'
          : 'aligned — e and next(e) are collinear, nothing to do.';
      history.push(
        snapshot({
          activeFaceIndex: faceIdx,
          showBoundingBox: isOuter,
          activeCorner: { x: corner.x, y: corner.y },
          highlightEdge: corner.edgeRef || null,
          dummyVertices: [...dummyVertices],
          message: `Edge arriving at (${Math.round(corner.x)}, ${Math.round(corner.y)}): turn(e) = ${corner.turn} — ${turnText}`,
        })
      );
    });

    // For every reflex edge e, find front(e)
    const frontTasks = [];
    const boxFallbacks = [];

    for (let i = 0; i < n; i++) {
      const corner = originalCorners[i];
      if (corner.turn !== -1) continue;

      const frontIdx = findFrontIndex(originalCorners, i);

      if (frontIdx === null) {
        if (!isOuter) {
          throw refinementFailure(
            `Refinement is not possible for this graph: front(e) is undefined for the reflex corner at (${Math.round(corner.x)}, ${Math.round(corner.y)}) — the turn(e) values never sum to 1 while walking this face.`,
            [corner.edgeRef]
          );
        }
        boxFallbacks.push({ corner });
        continue;
      }

      frontTasks.push({ cornerIndex: i, frontIdx });
    }

    for (const { cornerIndex, frontIdx } of frontTasks) {
      let corner = getLiveCorner(originalCorners[cornerIndex], points);
      let segA = getLiveCorner(originalCorners[(frontIdx - 1 + n) % n], points);
      let segB = getLiveCorner(originalCorners[frontIdx % n], points);
      const traversal = buildLiveTraversal(originalCorners, cornerIndex, frontIdx, points);
      const getFailureEdges = () => {
        const source = mapSegmentToOriginal(
          getLiveCorner(originalCorners[(cornerIndex - 1 + n) % n], points),
          corner
        );
        const front = mapSegmentToOriginal(segA, segB);
        return [
          failureEdge(corner.edgeRef, 'source', source.original || source.live, source.live),
          failureEdge(segB.edgeRef, 'front', front.original || front.live, front.live),
        ].map((edge, idx) => (edge && { ...edge, fellBackToLive: !(idx === 0 ? source.original : front.original) }));
      };

      history.push(snapshot({
        activeFaceIndex: faceIdx,
        showBoundingBox: isOuter,
        activeCorner: { x: corner.x, y: corner.y },
        traversal,
        message: `Finding front(e) for the reflex corner at (${Math.round(corner.x)}, ${Math.round(corner.y)}): the highlighted path reaches the wall ending at (${Math.round(segB.x)}, ${Math.round(segB.y)}).`,
      }));

      let projected = projectRayOntoLine(corner, corner.arrivingDir, segA, segB);
      if (!projected) {
        throw refinementFailure(
          `Refinement is not possible for this graph: no forward orthogonal line from e' reaches front(e).`,
          getFailureEdges()
        );
      }

      const horizontalFront = Math.abs(segA.y - segB.y) < 0.5;
      const projectionCoordinate = horizontalFront ? projected.x : projected.y;
      const segACoordinate = horizontalFront ? segA.x : segA.y;
      const segBCoordinate = horizontalFront ? segB.x : segB.y;
      const frontDirection = Math.sign(segBCoordinate - segACoordinate);
      const distanceFromSegA = (projectionCoordinate - segACoordinate) * frontDirection;
      const distanceFromSegB = (segBCoordinate - projectionCoordinate) * frontDirection;

      if (distanceFromSegA <= 0.5) {
        throw refinementFailure(
          `Refinement is not possible for this graph: project(e) is at or beyond segA, and only segB can be extended.`,
          getFailureEdges()
        );
      }

      let repair = null;
      if (distanceFromSegB < GRID_SIZE - 0.5) {
        try {
          repair = repairFrontByMovingFarSide(
            points,
            corner,
            originalCorners,
            cornerIndex,
            frontIdx,
            segA,
            segB,
            projected
          );
        } catch (err) {
          throw refinementFailure(
            `Refinement is not possible for this graph: front(e) could not be extended safely while traversing ${faceLabel} (${err.message}).`,
            getFailureEdges()
          );
        }

        if (repair) {
          shouldFitCanvas = true;
          if (isOuter) refreshBoxPreview();
          history.push(snapshot({
            activeFaceIndex: faceIdx,
            showBoundingBox: isOuter,
            activeCorner: { x: corner.x, y: corner.y },
            traversal: buildLiveTraversal(originalCorners, cornerIndex, frontIdx, points),
            frontRepairEdge: repair,
            message: `Extended front(e) by ${Math.round(repair.shiftAmount)} px (${repair.shiftAmount/40} grid units) and shifted ${repair.movedCount} far-side point(s) by the same amount.`,
          }));
        }
      }

      corner = getLiveCorner(originalCorners[cornerIndex], points);
      segA = getLiveCorner(originalCorners[(frontIdx - 1 + n) % n], points);
      segB = getLiveCorner(originalCorners[frontIdx % n], points);
      projected = projectRayOntoLine(corner, corner.arrivingDir, segA, segB);
      const wallDirection = segB.arrivingDir;
      const wallChain = getWallChain(points, segA.pointId, segB.pointId, wallDirection);
      const wallStartCoordinate = horizontalFront ? segA.x : segA.y;
      const wallEndCoordinate = horizontalFront ? segB.x : segB.y;
      const liveProjectionCoordinate = horizontalFront ? projected && projected.x : projected && projected.y;
      const distanceFromLiveStart = (liveProjectionCoordinate - wallStartCoordinate) * frontDirection;
      const distanceFromLiveEnd = (wallEndCoordinate - liveProjectionCoordinate) * frontDirection;

      if (!projected || distanceFromLiveStart <= 0.5 || distanceFromLiveEnd < GRID_SIZE - 0.5) {
        throw refinementFailure(
          `Refinement is not possible for this graph: project(e) does not land strictly inside front(e) with the required 40 px segB clearance while traversing ${faceLabel}.`,
          getFailureEdges()
        );
      }

      history.push(snapshot({
        activeFaceIndex: faceIdx,
        showBoundingBox: isOuter,
        activeCorner: { x: corner.x, y: corner.y },
        traversal: buildLiveTraversal(originalCorners, cornerIndex, frontIdx, points),
        rayPreview: { from: { x: corner.x, y: corner.y }, to: projected },
        message: `Extending e' from (${Math.round(corner.x)}, ${Math.round(corner.y)}) to project(e) at (${Math.round(projected.x)}, ${Math.round(projected.y)}) on front(e).`,
      }));

      let targetId;
      try {
        targetId = splitFrontAtProjection(points, wallChain, wallDirection, projected, `ps${dummyCounter++}`);
        if (String(targetId).startsWith('ps')) registerDummy(targetId, projected.x, projected.y, 'projected');
        linkPoints(points, corner.pointId, targetId, { isExtend: true });
        const invalidReason = validatePointGraph(points);
        if (invalidReason) throw new Error(invalidReason);
      } catch (err) {
        throw refinementFailure(
          `Refinement is not possible for this graph: extend(e) could not be added safely while traversing ${faceLabel}.`,
          getFailureEdges()
        );
      }

      extendEdges.push({ fromId: corner.pointId, toId: targetId });
      history.push(snapshot({
        activeFaceIndex: faceIdx,
        showBoundingBox: isOuter,
        traversal: buildLiveTraversal(originalCorners, cornerIndex, frontIdx, points),
        dummyVertices: [...dummyVertices],
        extendEdges: [...extendEdges],
        message: `Added extend(e) to project(e) at (${Math.round(projected.x)}, ${Math.round(projected.y)}).`,
      }));
    }

    // Outer face: all front(e) shifts are finished, so build the box from the FINAL coordinates.
    if (isOuter) {
      const { corners: boxCornerCoords, segments } = computeBoundingBoxSegments(getOriginalPoints(), []);
      boundingBoxPreview = segments;
      boxSeed = boxCornerCoords ? addBoundingBoxToGraph(points, boxCornerCoords) : null;
      if (boxSeed) {
        ['bx_tl', 'bx_tr', 'bx_br', 'bx_bl'].forEach((id) => {
          const p = points.get(id);
          registerDummy(id, p.x, p.y, 'boundary');
        });
        history.push(snapshot({
          activeFaceIndex: faceIdx,
          showBoundingBox: true,
          message: 'All front(e) extensions are done. Creating the surrounding rectangle from the final coordinates; edges with no front(e) will be projected onto it.',
        }));
      }
    }

    // The outer-face fallback
    if (boxFallbacks.length) {
      if (!boxSeed) {
        throw new Error('Refinement is not possible for this graph: the outer face has edges with no front(e), but no bounding rectangle is available to fall back to.');
      }
      let boxCorners = traceFaceFromSeed(points, boxSeed.seedFromId, boxSeed.seedDir);

      boxFallbacks.forEach(({ corner }) => {
        const liveCorner = getLiveCorner(corner, points);
        const hit = castRayToSegments(liveCorner, liveCorner.arrivingDir, boxCorners);
        if (!hit) {
          throw refinementFailure(
            `Refinement is not possible for this graph: the reflex corner at (${Math.round(liveCorner.x)}, ${Math.round(liveCorner.y)}) cannot reach the bounding rectangle in a straight line.`,
            [corner.edgeRef]
          );
        }

        history.push(
          snapshot({
            activeFaceIndex: faceIdx,
            showBoundingBox: isOuter,
            activeCorner: { x: liveCorner.x, y: liveCorner.y },
            rayPreview: { from: { x: liveCorner.x, y: liveCorner.y }, to: { x: hit.x, y: hit.y } },
            message: `Total sum = -4, so no front(e) available; Hence extending straight in ${liveCorner.arrivingDir} direction from (${Math.round(liveCorner.x)}, ${Math.round(liveCorner.y)}) onto the bounding rectangle at (${Math.round(hit.x)}, ${Math.round(hit.y)}).`,
          })
        );

        const endA = boxCorners[hit.segIndex];
        const endB = boxCorners[(hit.segIndex + 1) % boxCorners.length];
        let targetId;
        if (samePointish(endA, hit, 1)) {
          targetId = endA.pointId;
        } else if (samePointish(endB, hit, 1)) {
          targetId = endB.pointId;
        } else {
          targetId = `pb${dummyCounter++}`;
          const dir = endB.arrivingDir;
          splitSegmentAt(points, endA.pointId, dir, { id: targetId, x: hit.x, y: hit.y, isDummy: true });
          registerDummy(targetId, hit.x, hit.y, 'projected');
          boxCorners.splice(hit.segIndex + 1, 0, {
            pointId: targetId, x: hit.x, y: hit.y, isDummy: true, arrivingDir: dir,
          });
        }

        try {
          linkPoints(points, liveCorner.pointId, targetId, { isExtend: true });
        } catch (err) {
          throw refinementFailure(
            `Refinement is not possible for this graph: could not connect extend(e) from (${Math.round(liveCorner.x)}, ${Math.round(liveCorner.y)}) to the bounding rectangle while traversing ${faceLabel}.`,
            [corner.edgeRef]
          );
        }
        extendEdges.push({ fromId: liveCorner.pointId, toId: targetId });

        history.push(
          snapshot({
            activeFaceIndex: faceIdx,
            showBoundingBox: isOuter,
            dummyVertices: [...dummyVertices],
            extendEdges: [...extendEdges],
            message: `Added extend(e) to (${Math.round(hit.x)}, ${Math.round(hit.y)}) on the bounding rectangle.`,
          })
        );
      });
    }

    const addedDummies = dummyVertices.length - initialDummyCount;
    const addedExtends = extendEdges.length - initialExtendCount;

    history.push(
      snapshot({
        activeFaceIndex: faceIdx,
        showBoundingBox: isOuter,
        dummyVertices: [...dummyVertices],
        extendEdges: [...extendEdges],
        message: `Finished refining ${faceLabel} — ${addedDummies} vertices added and ${addedExtends} edge(s) extended.`,
      })
    );
  });

  } catch (err) {
    if (err.failureType === 'projection') {
      const edgesWithSegments = (err.failureEdges || []).filter((e) => e && e.segment);
      if (edgesWithSegments.some((e) => e.fellBackToLive)) {
        err.failureEdges = edgesWithSegments.map((e) => ({ ...e, segment: e.liveSegment }));
        err.failureState = snapshot({ failureEdges: err.failureEdges, showBoundingBox: false, message: err.message });
      }
    }
    throw err;
  }

  let borderEdges = [];
  if (boxSeed) {
    const finalBoxCorners = traceFaceFromSeed(points, boxSeed.seedFromId, boxSeed.seedDir);
    let prev = points.get(boxSeed.seedFromId);
    finalBoxCorners.forEach((c) => {
      borderEdges.push({ from: { x: prev.x, y: prev.y }, to: { x: c.x, y: c.y } });
      prev = c;
    });
  }

  history.push(
    snapshot({
      dummyVertices: [...dummyVertices],
      extendEdges: [...extendEdges],
      borderEdges,
      showBoundingBox: false,
      message: `Refinement complete — ${dummyVertices.length} vertices added and ${extendEdges.length} edge(s) extended. Now every face is a rectangle.`,
    })
  );

  return { history, faces: rawFaces.map((f) => f.corners), outerFaceIndex: outerIdx };
}

// New Graph Copy Back logic
export function flattenRefinedGraph(vertices, edges, state) {
  const positions = state.pointPositions || {};
  const newVertices = vertices.map((v) => ({ ...v, ...(positions[String(v.id)] || {}) }));
  const dummyIdToVertexId = {};
  let nextId = Math.max(0, ...vertices.map((v) => v.id)) + 1;

  state.dummyVertices.forEach((d) => {
    const id = nextId++;
    dummyIdToVertexId[d.id] = id;
    newVertices.push({ id, x: d.x, y: d.y });
  });

  const findVertexIdAt = (pt) => {
    const dv = state.dummyVertices.find((d) => Math.abs(d.x - pt.x) < 0.5 && Math.abs(d.y - pt.y) < 0.5);
    if (dv) return dummyIdToVertexId[dv.id];
    const rv = newVertices.find((v) => Math.abs(v.x - pt.x) < 0.5 && Math.abs(v.y - pt.y) < 0.5);
    return rv ? rv.id : null;
  };

  const dummiesOnOpenSegment = (p1, p2) => {
    const hits = state.dummyVertices.filter((d) => {
      if (Math.abs(d.x - p1.x) < 0.5 && Math.abs(d.y - p1.y) < 0.5) return false;
      if (Math.abs(d.x - p2.x) < 0.5 && Math.abs(d.y - p2.y) < 0.5) return false;
      return isPointOnSegment(d, p1, p2, 0.75);
    });
    hits.sort((a, b) => Math.hypot(a.x - p1.x, a.y - p1.y) - Math.hypot(b.x - p1.x, b.y - p1.y));
    return hits;
  };

  const newEdges = [];
  const emitChain = (p1, p2, weight) => {
    const full = [p1, ...dummiesOnOpenSegment(p1, p2), p2];
    for (let i = 0; i < full.length - 1; i++) {
      const a = findVertexIdAt(full[i]);
      const b = findVertexIdAt(full[i + 1]);
      if (a != null && b != null) newEdges.push({ source: a, target: b, weight });
    }
  };

  edges.forEach((edge, edgeIdx) => {
    const src = newVertices.find((v) => v.id === edge.source);
    const tgt = newVertices.find((v) => v.id === edge.target);
    if (!src || !tgt) return;
    const shiftedBends = (edge.bends || []).map((bend, bendIdx) => ({
      ...bend,
      ...(positions[`d${edgeIdx}_${bendIdx}`] || {}),
    }));
    const coordChain = [src, ...shiftedBends, tgt];
    for (let i = 0; i < coordChain.length - 1; i++) {
      emitChain(coordChain[i], coordChain[i + 1], edge.weight);
    }
  });

  (state.extendEdges || []).forEach((e) => {
    const a = findVertexIdAt(e.from);
    const b = findVertexIdAt(e.to);
    if (a != null && b != null) newEdges.push({ source: a, target: b, weight: 1 });
  });

  (state.borderEdges || []).forEach((e) => {
    const a = findVertexIdAt(e.from);
    const b = findVertexIdAt(e.to);
    if (a != null && b != null) newEdges.push({ source: a, target: b, weight: 1 });
  });

  return { vertices: newVertices, edges: newEdges };
}

// RENDERING

export function drawRefinementMainCanvas(ctx, vertices, edges, state) {
  const positions = state && state.pointPositions ? state.pointPositions : {};
  const renderVertices = vertices.map((vertex) => ({
    ...vertex,
    ...(positions[String(vertex.id)] || {}),
  }));
  const renderEdges = edges.map((edge, edgeIdx) => ({
    ...edge,
    bends: (edge.bends || []).map((bend, bendIdx) => ({
      ...bend,
      ...(positions[`d${edgeIdx}_${bendIdx}`] || {}),
    })),
  }));
  drawGraph(ctx, renderVertices, renderEdges, {});
  if (!state) return;

  (state.traversal || []).forEach((item) => {
    const previous = item.previous;
    ctx.save();
    ctx.strokeStyle = item.isFront ? '#f43f5e' : item.isStart ? '#ff9f0a' : '#38bdf8';
    ctx.lineWidth = item.isFront || item.isStart ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(item.x, item.y);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(item.x, item.y, item.isFront ? 9 : 6, 0, 2 * Math.PI);
    ctx.fillStyle = item.isFront ? '#f43f5e' : item.isStart ? '#ff9f0a' : '#38bdf8';
    ctx.fill();
  });

  if (state.showBoundingBox && state.boundingBoxSegments && state.boundingBoxSegments.length > 0) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
    ctx.lineWidth = 2;
    state.boundingBoxSegments.forEach((seg) => {
      ctx.beginPath();
      ctx.moveTo(seg.a.x, seg.a.y);
      ctx.lineTo(seg.b.x, seg.b.y);
      ctx.stroke();
    });
    ctx.restore();
  }

  (state.extendEdges || []).forEach((e) => {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ff9f0a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.from.x, e.from.y);
    ctx.lineTo(e.to.x, e.to.y);
    ctx.stroke();
    ctx.restore();
  });

  (state.borderEdges || []).forEach((e) => {
    ctx.save();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.from.x, e.from.y);
    ctx.lineTo(e.to.x, e.to.y);
    ctx.stroke();
    ctx.restore();
  });

  if (state.rayPreview) {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(state.rayPreview.from.x, state.rayPreview.from.y);
    ctx.lineTo(state.rayPreview.to.x, state.rayPreview.to.y);
    ctx.stroke();
    ctx.restore();
  }

  if (state.frontRepairEdge) {
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 5;
    ctx.setLineDash([7, 4]);
    ctx.beginPath();
    ctx.moveTo(state.frontRepairEdge.from.x, state.frontRepairEdge.from.y);
    ctx.lineTo(state.frontRepairEdge.to.x, state.frontRepairEdge.to.y);
    ctx.stroke();
    ctx.restore();
  }

  (state.dummyVertices || []).forEach((d) => {
    ctx.beginPath();
    ctx.arc(d.x, d.y, 7, 0, 2 * Math.PI);
    ctx.fillStyle = d.kind === 'projected' ? '#f43f5e' : d.kind === 'boundary' ? '#38bdf8' : '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  if (state.activeCorner) {
    ctx.beginPath();
    ctx.arc(state.activeCorner.x, state.activeCorner.y, VERTEX_RADIUS + 6, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ff9f0a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (state.highlightEdge) {
    const src = renderVertices.find((v) => v.id === state.highlightEdge.source);
    const tgt = renderVertices.find((v) => v.id === state.highlightEdge.target);
    if (src && tgt) {
      const edgeIndex = edges.indexOf(state.highlightEdge);
      const positionedEdge = edgeIndex >= 0 ? renderEdges[edgeIndex] : state.highlightEdge;
      const chain = [src, ...(positionedEdge.bends || []), tgt];
      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 5;
      for (let i = 0; i < chain.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(chain[i].x, chain[i].y);
        ctx.lineTo(chain[i + 1].x, chain[i + 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  (state.failureEdges || []).forEach((edge) => {
    const segment = edge.segment;
    if (!segment) return;
    ctx.save();
    ctx.strokeStyle = edge.role === 'front' ? '#dc2626' : '#f59e0b';
    ctx.lineWidth = 8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(segment.start.x, segment.start.y);
    ctx.lineTo(segment.end.x, segment.end.y);
    ctx.stroke();
    ctx.restore();
  });
}

export function drawRefinementOriginalCanvas(ctx, vertices, edges) {
  drawGraph(ctx, vertices, edges, {});
}

// PLAYBACK / UI

export function useRefinementPlayback(mode, history, setStep, setMode) {
  useEffect(() => {
    let timer;
    if (mode === 'running') {
      timer = setInterval(() => {
        setStep((prev) => {
          if (prev >= history.length - 1) {
            setMode('finished');
            return prev;
          }
          return prev + 1;
        });
      }, 1200);
    }
    return () => clearInterval(timer);
  }, [mode, history, setStep, setMode]);
}

export function RefinementControls({
  refinementAlgoMode,
  setRefinementAlgoMode,
  refinementStep,
  setRefinementStep,
  refinementHistory,
  onLaunch,
  onExit,
  styles,
}) {
  return (
    <>
      <button
        onClick={onLaunch}
        style={{
          ...styles.btnPrimary,
          backgroundColor: refinementAlgoMode !== 'idle' ? '#f43f5e' : '#0a84ff',
          marginTop: '10px',
        }}
      >
        Refinement Algo
      </button>

      {refinementAlgoMode !== 'idle' && (
        <div style={styles.algoPanel}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#f43f5e', textAlign: 'center' }}>
            Refinement Playback
          </h3>
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#fff', marginBottom: '5px' }}>
            Step: {refinementStep} / {Math.max(0, refinementHistory.length - 1)}
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => setRefinementAlgoMode('running')} style={{ ...styles.btnAction, backgroundColor: refinementAlgoMode === 'running' ? '#34c759' : '#334155', flex: 1 }}>▶️ Play</button>
            <button onClick={() => setRefinementAlgoMode('paused')} style={{ ...styles.btnAction, backgroundColor: refinementAlgoMode === 'paused' ? '#ff9f0a' : '#334155', flex: 1 }}>⏸️ Pause</button>
          </div>
          <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
            <button onClick={() => setRefinementStep(Math.max(0, refinementStep - 1))} disabled={refinementStep === 0} style={{ ...styles.btnAction, opacity: refinementStep === 0 ? 0.5 : 1 }}>⏮️ Prev</button>
            <button onClick={() => setRefinementStep(Math.min(refinementHistory.length - 1, refinementStep + 1))} disabled={refinementStep === refinementHistory.length - 1} style={{ ...styles.btnAction, opacity: refinementStep === refinementHistory.length - 1 ? 0.5 : 1 }}>Next ⏭️</button>
          </div>
          <button onClick={() => { setRefinementStep(refinementHistory.length - 1); setRefinementAlgoMode('finished'); }} style={{ ...styles.btnAction, marginTop: '8px' }}>⏭️ Skip to End</button>
          <button onClick={onExit} style={{ ...styles.btnAction, backgroundColor: '#ff3b30', borderColor: '#ff3b30', marginTop: '10px' }}>⏹️ Exit Refinement</button>
        </div>
      )}
    </>
  );
}

export function RefinementStatusBox({ refinementAlgoMode, currentState, styles }) {
  if (!(refinementAlgoMode !== 'idle' && currentState)) return null;
  return (
    <div style={styles.statusBox}>
      <div style={{ color: '#fff', fontSize: '15px', minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{currentState.message}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', fontSize: '13px', color: '#94a3b8' }}>
        <span>Dummy vertices so far: <strong style={{ color: '#fff' }}>{currentState.dummyVertices.length}</strong></span>
        <span>Extend edges so far: <strong style={{ color: '#fff' }}>{currentState.extendEdges.length}</strong></span>
      </div>
      {currentState.traversal && currentState.traversal.length > 0 && (
        <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
          <div style={{ marginBottom: '6px' }}>Front traversal running sums:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {currentState.traversal.map((item, index) => (
              <span key={`${item.x}-${item.y}-${index}`} style={{
                color: '#fff',
                backgroundColor: item.isFront ? '#f43f5e' : item.isStart ? '#ff9f0a' : '#0ea5e9',
                padding: '3px 6px',
                borderRadius: '4px',
              }}>
                {item.isStart ? 'e' : item.isFront ? 'front(e)' : `b${index}`} : {item.cumulative > 0 ? '+' : ''}{item.cumulative}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RefinementFailurePanel({ failure, styles }) {
  if (!failure) return null;

  return (
    <div style={{ ...styles.panel, border: '2px solid #dc2626' }}>
      <h3 style={{ ...styles.panelTitle, color: '#f87171' }}>Refinement Not Possible</h3>
      <p style={{ color: '#fecaca', lineHeight: '1.5', margin: '12px 0' }}>{failure.message}</p>
      {failure.edges.length > 0 && (
        <div style={{ color: '#cbd5e1', fontSize: '13px' }}>
          <strong style={{ color: '#fff' }}>Highlighted cause:</strong> red dashed edge(s) on the canvas show the edge being extended and the front(e) edge that could not be reached.
        </div>
      )}
    </div>
  );
}

export function RefinementOriginalGraphPanel({ rightCanvasRef, canvasWidth, canvasHeight, styles }) {
  return (
    <div style={{ ...styles.panel, display: 'flex', flexDirection: 'column', height: '100%', padding: '15px' }}>
      <h3 style={{ ...styles.panelTitle, fontSize: '20px', marginBottom: '10px' }}>Original Graph</h3>
      <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 15px 0' }}>Unchanged reference — compare against the refined graph on the left.</p>
      <div style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
        <canvas ref={rightCanvasRef} width={canvasWidth} height={canvasHeight} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>
      <div style={{ marginTop: '15px', fontSize: '15px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#0f172a', border: '2px solid #fff' }}></div> <strong>Dummy (bend):</strong> existing bend point.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#38bdf8', border: '2px solid #fff' }}></div> <strong>Dummy (boundary):</strong> a corner of the surrounding rectangle.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#f43f5e', border: '2px solid #fff' }}></div> <strong>Dummy (projected):</strong> project(e) — either a T-junction splitting an existing wall (or the rectangle) in two, or a landing exactly on an existing vertex.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', backgroundColor: '#ff9f0a' }}></div> <strong>Extend edge</strong> — extend(e).</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', backgroundColor: '#f43f5e' }}></div> <strong>Border edge</strong> — the surrounding rectangle, once it's a real part of the graph.</div>
      </div>
    </div>
  );
}