import type { SegmentDecision, Waypoint } from '../types'
import { bezierAt, distance, segmentPoints, shortestAngle, tangentDegrees } from './geometry'

export function analyzeSegment(points: Waypoint[], index: number): SegmentDecision {
  const start = points[index]
  const end = points[index + 1]
  const pts = segmentPoints(points, index)
  const length = Math.max(distance(start, end), 0.1)
  const startTangent = tangentDegrees(bezierAt(pts, 0), bezierAt(pts, .02))
  const endTangent = tangentDegrees(bezierAt(pts, .98), bezierAt(pts, 1))
  const curvature = Math.abs(shortestAngle(startTangent, endTangent))
  const headingDelta = Math.abs(shortestAngle(start.heading, end.heading))
  const rotationRate = headingDelta / length
  const manual = end.interpolation

  if (manual !== 'auto') return {
    type: manual,
    reason: end.autoReason ?? `Manual override on waypoint ${index + 2}.`,
    curvature,
    rotationRate,
  }
  if(start.headingLocked||end.headingLocked)return {
    type:'linear',reason:'Manually edited pose headings stay independent of the curve tangent.',curvature,rotationRate,
  }

  if (headingDelta < 4) return {
    type: 'constant',
    reason: `Heading changes only ${headingDelta.toFixed(1)}°; locking orientation avoids unnecessary rotation.`,
    curvature,
    rotationRate,
  }

  const tangentFit = Math.abs(shortestAngle(start.heading, startTangent)) < 18
    && Math.abs(shortestAngle(end.heading, endTangent)) < 18
  if (tangentFit && curvature > 8) return {
    type: 'tangent',
    reason: `Both headings follow a ${curvature.toFixed(0)}° curved sweep, so the robot stays aligned to the path.`,
    curvature,
    rotationRate,
  }

  if (curvature > 22 && Math.abs(shortestAngle(endTangent, end.heading)) > 28) return {
    type: 'piecewise',
    reason: `Curvature is ${curvature.toFixed(0)}°, then the target diverges from tangent; switch at t = 0.68 for a controlled final approach.`,
    curvature,
    rotationRate,
  }

  return {
    type: 'linear',
    reason: `A ${headingDelta.toFixed(0)}° rotation over ${length.toFixed(1)} in (${rotationRate.toFixed(2)}°/in) is smooth at a uniform rate.`,
    curvature,
    rotationRate,
  }
}

export function analyzePath(points: Waypoint[]) {
  return points.slice(0, -1).map((_, index) => analyzeSegment(points, index))
}
