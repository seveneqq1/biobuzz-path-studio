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

function resamplePolyline(points: Waypoint[], count: number): Point2D[] {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]))
  const total = lengths.at(-1) ?? 0
  if (!total) return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }))
  return Array.from({ length: count }, (_, sample) => {
    const target = total * sample / (count - 1)
    let segment = 1
    while (segment < lengths.length - 1 && lengths[segment] < target) segment++
    const startDistance = lengths[segment - 1]
    const segmentLength = Math.max(lengths[segment] - startDistance, .0001)
    const t = (target - startDistance) / segmentLength
    return {
      x: points[segment - 1].x + (points[segment].x - points[segment - 1].x) * t,
      y: points[segment - 1].y + (points[segment].y - points[segment - 1].y) * t,
    }
  })
}

function fourierLowPass(samples: Point2D[], harmonics: number): Point2D[] {
  // Mirror the open path into a periodic signal so the DFT does not pull its endpoints together.
  const signal = [...samples, ...samples.slice(1, -1).reverse()]
  const size = signal.length
  const coefficients = Array.from({ length: size }, (_, frequency) => {
    let xReal = 0; let xImaginary = 0; let yReal = 0; let yImaginary = 0
    for (let sample = 0; sample < size; sample++) {
      const angle = -2 * Math.PI * frequency * sample / size
      const cosine = Math.cos(angle); const sine = Math.sin(angle)
      xReal += signal[sample].x * cosine; xImaginary += signal[sample].x * sine
      yReal += signal[sample].y * cosine; yImaginary += signal[sample].y * sine
    }
    const keep = frequency <= harmonics || frequency >= size - harmonics
    return keep ? { xReal, xImaginary, yReal, yImaginary } : { xReal: 0, xImaginary: 0, yReal: 0, yImaginary: 0 }
  })
  const reconstructed = samples.map((_, sample) => {
    let x = 0; let y = 0
    for (let frequency = 0; frequency < size; frequency++) {
      const angle = 2 * Math.PI * frequency * sample / size
      const cosine = Math.cos(angle); const sine = Math.sin(angle)
      const coefficient = coefficients[frequency]
      x += coefficient.xReal * cosine - coefficient.xImaginary * sine
      y += coefficient.yReal * cosine - coefficient.yImaginary * sine
    }
    return { x: x / size, y: y / size }
  })
  reconstructed[0] = { x: samples[0].x, y: samples[0].y }
  reconstructed[reconstructed.length - 1] = { x: samples.at(-1)!.x, y: samples.at(-1)!.y }
  return reconstructed
}

function optimizeChunk(chunk: Waypoint[]) {
  if (chunk.length <= 2) return chunk
  const sampleCount = clamp(chunk.length * 6, 24, 64)
  const samples = resamplePolyline(chunk, sampleCount)
  const filtered = fourierLowPass(samples, clamp(Math.round(sampleCount / 8), 4, 9))
  const targetCount = Math.max(2, Math.ceil(chunk.length * .55))
  let tolerance = 1.25
  let reduced = simplify(filtered, tolerance)
  while (reduced.length > targetCount && tolerance < 8) {
    tolerance *= 1.35
    reduced = simplify(filtered, tolerance)
  }
  const start = chunk[0]
  const end = chunk.at(-1)!
  return reduced.map((point, index) => {
    if (index === 0) return start
    if (index === reduced.length - 1) return end
    return {
      ...point,
      id: crypto.randomUUID(),
      heading: tangentDegrees(reduced[index - 1], reduced[index + 1]),
      interpolation: 'auto' as const,
      controlWeight: 1,
    }
  })
}

export function optimizeWaypoints(points: Waypoint[]) {
  if (points.length <= 2) return points
  const boundaryIndexes = [0]
  points.forEach((point, index) => { if (index > 0 && point.action) boundaryIndexes.push(index) })
  if (boundaryIndexes.at(-1) !== points.length - 1) boundaryIndexes.push(points.length - 1)
  const optimized: Waypoint[] = []
  for (let i = 1; i < boundaryIndexes.length; i++) {
    const chunk = points.slice(boundaryIndexes[i - 1], boundaryIndexes[i] + 1)
    const next = optimizeChunk(chunk)
    optimized.push(...(optimized.length ? next.slice(1) : next))
  }
  return optimized.map((point, index, path) => index === 0 || index === path.length - 1 || point.action
    ? point
    : { ...point, heading: tangentDegrees(path[index - 1], path[index + 1]) })
}

export function seedWaypoints(): Waypoint[] {
  return [
    { id: crypto.randomUUID(), x: 18, y: 18, heading: 90, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 34, y: 42, heading: 66, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 43, y: 69, heading: 88, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 45, y: 103, heading: 72, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 75, y: 119, heading: 18, interpolation: 'auto', controlWeight: 1 },
    { id: crypto.randomUUID(), x: 122, y: 119, heading: 0, interpolation: 'auto', controlWeight: 1 },
  ]
}
