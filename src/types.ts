export type Interpolation = 'auto' | 'constant' | 'linear' | 'tangent' | 'piecewise'
export type ResolvedInterpolation = Exclude<Interpolation, 'auto'>

export interface Point2D { x: number; y: number }

export type ActionType = 'shoot' | 'intake' | 'transfer' | 'flowerIntake' | 'wait'

export interface PathAction {
  type: ActionType
  durationMs?: number
}

export interface Waypoint extends Point2D {
  id: string
  heading: number
  interpolation: Interpolation
  controlWeight: number
  action?: PathAction
  curve?: { endId: string; c1: Point2D; c2: Point2D }
}

export interface SegmentDecision {
  type: ResolvedInterpolation
  reason: string
  curvature: number
  rotationRate: number
}

export type CanvasTool = 'select' | 'draw' | 'waypoint' | 'pan'
