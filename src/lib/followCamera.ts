import type { RobotConfig, SimState } from './simulation'
import { hiveCenters } from './simulation'
import { cellOpening, GRAVITY, pieceRadius } from './hivePhysics'

interface CameraPoint {x:number;y:number;z:number}
const mix=(a:CameraPoint,b:CameraPoint,t:number):CameraPoint=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t})
export const airborneShots=(state:SimState)=>state.finished||state.blocked?[]:state.balls.filter(ball=>ball.shot && ball.flower===undefined && (ball.z>pieceRadius(ball.kind)+.2 || ball.vz>1))
export const shootingCameraActive=(state:SimState)=>!state.finished&&!state.blocked&&(state.shooting || airborneShots(state).length>0)
export const smoothCameraBlend=(current:number,wide:boolean,dt:number)=>current+((wide?1:0)-current)*(1-Math.exp(-(wide?7:3.8)*Math.max(0,dt)))

// Pure framing math, in Three's x/right, y/height, z/toward-field-bottom axes.
// The bounding sphere fits both vertical and horizontal FOV, including portrait.
export function followCameraFrame(state:SimState,config:RobotConfig,aspect:number,blend:number) {
  const angle=state.heading*Math.PI/180,robot={x:state.x-72,y:9,z:72-state.y}
  const close={x:robot.x-Math.cos(angle)*54,y:38,z:robot.z+Math.sin(angle)*54}
  const index=config.alliance==='red'?0:1,center=hiveCenters[index]
  const subjects:CameraPoint[]=[{...robot,y:0},{...robot,y:26}]
  for(const side of [0,1]){const opening=cellOpening(state.hives[index],side);subjects.push({x:center.x+opening.x-72,y:opening.z+8,z:72-center.y})}
  const shots=airborneShots(state)
  for(const ball of shots){
    subjects.push({x:ball.x-72,y:ball.z,z:72-ball.y})
    const apex=Math.max(0,ball.vz)/GRAVITY
    subjects.push({x:ball.x+ball.vx*apex-72,y:ball.z+ball.vz*apex-GRAVITY*apex*apex/2,z:72-ball.y-ball.vy*apex})
  }
  if(!shots.length && !state.finished){
    const elevation=state.turretElevation*Math.PI/180,flight=config.shotSpeed*Math.sin(elevation)/GRAVITY,yaw=state.turretYaw*Math.PI/180
    subjects.push({x:robot.x+Math.cos(yaw)*config.shotSpeed*Math.cos(elevation)*flight,y:18+config.size*.42+GRAVITY*flight*flight/2,z:robot.z-Math.sin(yaw)*config.shotSpeed*Math.cos(elevation)*flight})
  }
  const minimum={x:Infinity,y:Infinity,z:Infinity},maximum={x:-Infinity,y:-Infinity,z:-Infinity}
  for(const p of subjects)for(const axis of ['x','y','z'] as const){minimum[axis]=Math.min(minimum[axis],p[axis]);maximum[axis]=Math.max(maximum[axis],p[axis])}
  const target={x:(minimum.x+maximum.x)/2,y:(minimum.y+maximum.y)/2,z:(minimum.z+maximum.z)/2}
  const radius=Math.hypot(maximum.x-minimum.x,maximum.y-minimum.y,maximum.z-minimum.z)/2+config.size/2+4
  const vertical=39*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*Math.max(.15,aspect))
  const distance=Math.max(90,radius/Math.sin(Math.min(vertical,horizontal))+12)
  const wide={x:target.x-Math.cos(angle)*distance*.78,y:target.y+distance*.63,z:target.z+Math.sin(angle)*distance*.78}
  return {position:mix(close,wide,blend),target:mix(robot,target,blend),distance,subjects,radius}
}
