import type { Point2D, Waypoint } from '../types'

export const FIELD_INCHES = 144
export const FIELD_PIXELS = 720
export const PX_PER_INCH = FIELD_PIXELS / FIELD_INCHES

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360

export function shortestAngle(from: number, to: number) {
  return ((to - from + 540) % 360) - 180
}

export function distance(a: Point2D, b: Point2D) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function tangentDegrees(a: Point2D, b: Point2D) {
  return normalizeDegrees(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI)
}

export function worldToCanvas(point: Point2D): Point2D {
  return { x: point.x * PX_PER_INCH, y: FIELD_PIXELS - point.y * PX_PER_INCH }
}

export function canvasToWorld(point: Point2D, snap = false): Point2D {
  const x = clamp(point.x / PX_PER_INCH, 0, FIELD_INCHES)
  const y = clamp((FIELD_PIXELS - point.y) / PX_PER_INCH, 0, FIELD_INCHES)
  return snap ? { x: Math.round(x / 6) * 6, y: Math.round(y / 6) * 6 } : { x, y }
}

export function controls(points: Waypoint[], index: number) {
  const a = points[index]
  const b = points[index + 1]
  const before = points[index - 1] ?? a
  const after = points[index + 2] ?? b
  const weight = ((a.controlWeight + b.controlWeight) / 2) / 6
  return {
    c1: { x: a.x + (b.x - before.x) * weight, y: a.y + (b.y - before.y) * weight },
    c2: { x: b.x - (after.x - a.x) * weight, y: b.y - (after.y - a.y) * weight },
  }
}

function pointLineDistance(p: Point2D, a: Point2D, b: Point2D) {
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (!length2) return distance(p, a)
  const t = clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length2, 0, 1)
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}

export function simplify(points: Point2D[], tolerance = 3): Point2D[] {
  if (points.length <= 2) return points
  let max = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], points[0], points[points.length - 1])
    if (d > max) { max = d; index = i }
  }
  if (max > tolerance) {
    const left = simplify(points.slice(0, index + 1), tolerance)
    const right = simplify(points.slice(index), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [points[0], points[points.length - 1]]
}

export function seedWaypoints(): Waypoint[] {
  return [
    { id: crypto.randomUUID(), x: 18, y: 18, heading: 90, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 37, y: 50, heading: 67, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 74, y: 70, heading: 8, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 111, y: 92, heading: 38, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 126, y: 122, heading: 90, interpolation: 'auto', controlWeight: 1 },
  ]
}
