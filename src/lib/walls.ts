import type { Point2D } from '../types'
import { clamp, shortestAngle } from './geometry'

export type RobotPose = Point2D & { heading:number }
// A square's world-space half extent changes as the chassis rotates.
export function wallExtent(heading:number,size:number) {
  const angle=heading*Math.PI/180
  return size/2*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)))
}
export function clearsWalls(pose:RobotPose,size:number) {
  const extent=wallExtent(pose.heading,size)
  return pose.x>=extent-1e-8 && pose.x<=144-extent+1e-8 && pose.y>=extent-1e-8 && pose.y<=144-extent+1e-8
}
export function constrainPose(pose:RobotPose,size:number):RobotPose {
  const extent=wallExtent(pose.heading,size)
  return {...pose,x:clamp(pose.x,extent,144-extent),y:clamp(pose.y,extent,144-extent)}
}
// Sweep translation AND rotation. Small steps find first contact; bisection
// locates it without allowing a large timestep to tunnel through a wall.
export function sweepWalls(from:RobotPose,to:RobotPose,size:number) {
  const rotation=shortestAngle(from.heading,to.heading)
  const at=(t:number)=>({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,heading:from.heading+rotation*t})
  if(!clearsWalls(from,size))return {pose:constrainPose(from,size),fraction:0,hit:true}
  const count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/.2),Math.ceil(Math.abs(rotation)/.5))
  for(let i=1;i<=count;i++)if(!clearsWalls(at(i/count),size)) {
    let low=(i-1)/count,high=i/count
    for(let j=0;j<30;j++){const mid=(low+high)/2;if(clearsWalls(at(mid),size))low=mid;else high=mid}
    return {pose:constrainPose(at(low),size),fraction:low,hit:true}
  }
  return {pose:to,fraction:1,hit:false}
}
