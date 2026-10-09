import { normalizeDegrees } from './geometry'
import { sweepSupports } from './supportCollisions'
import { sweepWalls } from './walls'
import type { RobotPose } from './walls'

export function turnPreviewPose(pose:RobotPose,degrees:number,size:number) {
  const target={...pose,heading:pose.heading+degrees}
  const wall=sweepWalls(pose,target,size),support=sweepSupports(pose,target,size)
  const contact=support.solid&&support.fraction<=wall.fraction?support:wall
  return {pose:{...contact.pose,heading:normalizeDegrees(contact.pose.heading)},blocked:!!('solid' in contact?contact.solid:contact.hit)}
}
export const previewKeyDelta=(key:string,dt:number,rate:number)=>
  key==='a'||key==='ArrowLeft'?rate*dt:key==='d'||key==='ArrowRight'?-rate*dt:key==='w'?-90:key==='s'?90:0
