export type Interpolation = 'auto' | 'constant' | 'linear' | 'tangent' | 'piecewise'
export type ResolvedInterpolation = Exclude<Interpolation, 'auto'>

export interface Point2D { x: number; y: number }

export interface Waypoint extends Point2D {
  id: string
  heading: number
  interpolation: Interpolation
  controlWeight: number
}

export interface SegmentDecision {
  type: ResolvedInterpolation
  reason: string
  curvature: number
  rotationRate: number
}

export type CanvasTool = 'select' | 'draw' | 'waypoint' | 'pan'
