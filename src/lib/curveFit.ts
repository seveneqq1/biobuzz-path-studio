import type { Point2D, Waypoint } from '../types'
import { controls, distance } from './geometry'

export function cubic(a: Point2D, b: Point2D, c: Point2D, d: Point2D, t: number): Point2D {
  const u = 1 - t
  return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
    y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y }
}
const unit = (a: Point2D, b: Point2D) => {
  const length = distance(a, b) || 1
  return { x: (b.x-a.x)/length, y: (b.y-a.y)/length }
}
type Fit = { first: number; last: number; c1: Point2D; c2: Point2D }

// Adaptive least-squares cubic fitting. Shared split tangents guarantee G1 continuity.
function fit(samples: Point2D[], first: number, last: number, left: Point2D, right: Point2D, tolerance: number): Fit[] {
  const a = samples[first], d = samples[last]
  const lengths = [0]
  for (let i = first+1; i <= last; i++) lengths.push(lengths.at(-1)! + distance(samples[i-1], samples[i]))
  const total = lengths.at(-1)! || 1
  const ts = lengths.map(length => length/total)
  let aa=0, ab=0, bb=0, ax=0, bx=0
  ts.forEach((t, i) => {
    const u=1-t, b1=3*u*u*t, b2=3*u*t*t
    const v1={x:left.x*b1,y:left.y*b1}, v2={x:right.x*b2,y:right.y*b2}
    const base=cubic(a,a,d,d,t), p=samples[first+i]
    const residual={x:p.x-base.x,y:p.y-base.y}
    aa+=v1.x*v1.x+v1.y*v1.y; ab+=v1.x*v2.x+v1.y*v2.y; bb+=v2.x*v2.x+v2.y*v2.y
    ax+=v1.x*residual.x+v1.y*residual.y; bx+=v2.x*residual.x+v2.y*residual.y
  })
  const determinant=aa*bb-ab*ab
  let alpha=determinant ? (ax*bb-bx*ab)/determinant : total/3
  let beta=determinant ? (bx*aa-ax*ab)/determinant : total/3
  if (alpha<=0 || beta<=0 || alpha>total*2 || beta>total*2) alpha=beta=distance(a,d)/3
  const c1={x:a.x+alpha*left.x,y:a.y+alpha*left.y}, c2={x:d.x+beta*right.x,y:d.y+beta*right.y}
  let worst=0, split=Math.floor((first+last)/2)
  ts.forEach((t,i) => { const error=distance(cubic(a,c1,c2,d,t),samples[first+i]); if(error>worst){worst=error;split=first+i} })
  if(worst<=tolerance || last-first<=2) return [{first,last,c1,c2}]
  split=Math.max(first+1,Math.min(last-1,split))
  const tangent=unit(samples[split-1],samples[split+1])
  return [...fit(samples,first,split,left,{x:-tangent.x,y:-tangent.y},tolerance), ...fit(samples,split,last,tangent,right,tolerance)]
}

export function optimizeCurves(points: Waypoint[], tolerance=.35): Waypoint[] {
  if(points.length<3) return points
  const boundaries=[0,...points.flatMap((p,i)=>i>0 && (p.action || p.interpolation!=='auto') ? [i]:[])]
  if(boundaries.at(-1)!==points.length-1) boundaries.push(points.length-1)
  const result: Waypoint[]=[]
  for(let b=1;b<boundaries.length;b++) {
    const first=boundaries[b-1], last=boundaries[b], samples: Point2D[]=[]
    for(let i=first;i<last;i++) {
      const {c1,c2}=controls(points,i)
      for(let j=0;j<40;j++) samples.push(cubic(points[i],c1,c2,points[i+1],j/40))
    }
    samples.push(points[last])
    const curves=fit(samples,0,samples.length-1,unit(samples[0],samples[1]),unit(samples.at(-1)!,samples.at(-2)!),tolerance)
    const chunk: Waypoint[]=[{...points[first],curve:undefined}]
    for(const curve of curves) {
      const end: Waypoint=curve.last===samples.length-1 ? {...points[last],curve:undefined} : {
        ...samples[curve.last],id:crypto.randomUUID(),heading:points[Math.min(last,first+Math.round(curve.last/40))].heading,interpolation:'auto',controlWeight:1,
      }
      chunk[chunk.length-1].curve={endId:end.id,c1:curve.c1,c2:curve.c2}
      chunk.push(end)
    }
    if(result.length) result[result.length-1]=chunk[0]
    result.push(...chunk.slice(result.length ? 1:0))
  }
  // Never add nodes just to meet a fitting tolerance: the source is already exact.
  return result.length<points.length ? result : points
}
