import { robotSupportCollision } from './supportCollisions'
import { templateClearanceHeight } from './fieldGeometry'
import { constrainPose, clearsWalls } from './walls'
import type { RobotPose } from './walls'

export function bufferedPoseSafe(pose:RobotPose,size:number,buffer=1) {
  return clearsWalls(pose,size+buffer*2)&&!robotSupportCollision(pose,size,templateClearanceHeight(size),buffer)
}

// Radial search preserves heading (0.25-inch rings with 0.016-inch local
// refinement). The buffer applies to the footprint, not the center point.
export function nearestSafePose(pose:RobotPose,size:number,buffer=1):RobotPose|null {
  if(bufferedPoseSafe(pose,size,buffer))return {...pose}
  const wall=constrainPose(pose,size+buffer*2)
  if(bufferedPoseSafe(wall,size,buffer))return wall
  let best:RobotPose|null=null
  for(let radius=.25;radius<=204&&!best;radius+=.25) {
    const count=Math.max(64,Math.ceil(2*Math.PI*radius/.25))
    for(let i=0;i<count;i++){
      const a=i*2*Math.PI/count,p={...pose,x:pose.x+radius*Math.cos(a),y:pose.y+radius*Math.sin(a)}
      if(bufferedPoseSafe(p,size,buffer)){best=p;break}
    }
  }
  if(!best)return null
  let refined:RobotPose=best
  const distance=(p:RobotPose)=>Math.hypot(p.x-pose.x,p.y-pose.y)
  for(let step=.25;step>=.015625;step/=2)for(let pass=0;pass<24;pass++) {
    let improved=false
    for(const dx of [-step,0,step])for(const dy of [-step,0,step]){
      const p:RobotPose={...refined,x:refined.x+dx,y:refined.y+dy}
      if(distance(p)<distance(refined)-1e-8&&bufferedPoseSafe(p,size,buffer)){refined=p;improved=true}
    }
    if(!improved)break
  }
  return refined
}
