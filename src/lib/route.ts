import type { PathAction, Waypoint } from '../types'

export interface RoutePath { kind: 'path'; name: string; startIndex: number; endIndex: number }
export type RouteStep = RoutePath | { kind: 'action'; action: PathAction; node: number }
  | { kind: 'group'; action: PathAction; node: number; mode: 'parallel' | 'deadline'; path: RoutePath }

// The next command marker is a join barrier, preventing silent action overlap.
export function nextPathEnd(points: Waypoint[], node: number) {
  for (let i = node + 1; i < points.length; i++) if (points[i].action) return i
  return points.length - 1
}

export const routeActions=(points:Waypoint[],shootWhileMoving=false)=>points.map((point,node)=>
  point.action?.type==='shoot'&&shootWhileMoving&&node<points.length-1
    ? {...point.action,composition:point.action.composition==='deadline'?'deadline' as const:'parallel' as const}:point.action)

export function compileRoute(points: Waypoint[],shootWhileMoving=false): RouteStep[] {
  const raw: (RoutePath | Extract<RouteStep, {kind: 'action'}>)[] = []
  let start = 0, number = 0
  routeActions(points,shootWhileMoving).forEach((action, node) => {
    if (!action) return
    if (node > start) raw.push({kind: 'path', name: `path${number++}`, startIndex: start, endIndex: node})
    raw.push({kind: 'action', action, node})
    start = node
  })
  if (start < points.length - 1) raw.push({kind: 'path', name: `path${number++}`, startIndex: start, endIndex: points.length - 1})
  const steps: RouteStep[] = []
  for (let i = 0; i < raw.length; i++) {
    const step = raw[i], next = raw[i + 1]
    if (step.kind === 'action' && step.action.composition && step.action.composition !== 'sequential' && next?.kind === 'path') {
      steps.push({kind: 'group', action: step.action, node: step.node, mode: step.action.composition, path: next})
      i++
    } else steps.push(step)
  }
  return steps
}
