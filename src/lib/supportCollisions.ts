import { clamp, shortestAngle } from './geometry'
import { frameSolids, templateClearanceHeight } from './fieldGeometry'
import type { Vec3, FieldSolid } from './fieldGeometry'
import { clearsWalls, constrainPose } from './walls'
import type { RobotPose } from './walls'

const axes=['x','y','z'] as const
const at=(a:Vec3,b:Vec3,t:number):Vec3=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t})
const norm=(p:Vec3)=>Math.hypot(p.x,p.y,p.z)
const subtract=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const nearestBox=(p:Vec3,half:Vec3):Vec3=>({x:clamp(p.x,-half.x,half.x),y:clamp(p.y,-half.y,half.y),z:clamp(p.z,-half.z,half.z)})

// Exact minimum distance from a segment to an AABB. Breakpoints are where the
// segment crosses a face; squared distance is quadratic on each interval.
export function segmentBoxDistance(a:Vec3,b:Vec3,half:Vec3) {
  const delta=subtract(b,a),breaks=[0,1]
  for(const axis of axes)if(Math.abs(delta[axis])>1e-12)for(const sign of [-1,1]) {
    const t=(sign*half[axis]-a[axis])/delta[axis];if(t>0&&t<1)breaks.push(t)
  }
  breaks.sort((x,y)=>x-y)
  let best=Infinity
  const check=(t:number)=>{const p=at(a,b,t);best=Math.min(best,norm(subtract(p,nearestBox(p,half))))}
  for(let i=1;i<breaks.length;i++) {
    const low=breaks[i-1],high=breaks[i],mid=(low+high)/2,p=at(a,b,mid)
    let aa=0,ab=0
    for(const axis of axes)if(Math.abs(p[axis])>half[axis]) {
      const offset=a[axis]-Math.sign(p[axis])*half[axis];aa+=delta[axis]**2;ab+=delta[axis]*offset
    }
    check(low);check(high);if(aa>0)check(clamp(-ab/aa,low,high))
  }
  return best
}

export function robotSupportCollision(pose:RobotPose,size:number,height=templateClearanceHeight(size)) {
  const angle=pose.heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),half={x:size/2,y:size/2,z:height/2}
  const local=(p:Vec3):Vec3=>({x:(p.x-pose.x)*c+(p.y-pose.y)*s,y:-(p.x-pose.x)*s+(p.y-pose.y)*c,z:p.z-height/2})
  const extent=size/2*(Math.abs(c)+Math.abs(s))
  for(const solid of frameSolids) {
    if(solid.kind==='tube') {
      if(Math.min(solid.a.z,solid.b.z)-solid.radius>=height || Math.max(solid.a.x,solid.b.x)+solid.radius<pose.x-extent || Math.min(solid.a.x,solid.b.x)-solid.radius>pose.x+extent || Math.max(solid.a.y,solid.b.y)+solid.radius<pose.y-extent || Math.min(solid.a.y,solid.b.y)-solid.radius>pose.y+extent)continue
      if(segmentBoxDistance(local(solid.a),local(solid.b),half)<solid.radius-1e-7)return solid
    } else {
      if(solid.center.z+solid.half.z<=0 || solid.center.z-solid.half.z>=height)continue
      const dx=solid.center.x-pose.x,dy=solid.center.y-pose.y,h=size/2
      // Separating axes for the robot's oriented square and a world-axis box.
      if(Math.abs(dx)>=solid.half.x+h*(Math.abs(c)+Math.abs(s))-1e-7 || Math.abs(dy)>=solid.half.y+h*(Math.abs(c)+Math.abs(s))-1e-7)continue
      if(Math.abs(dx*c+dy*s)>=h+solid.half.x*Math.abs(c)+solid.half.y*Math.abs(s)-1e-7 || Math.abs(-dx*s+dy*c)>=h+solid.half.x*Math.abs(s)+solid.half.y*Math.abs(c)-1e-7)continue
      return solid
    }
  }
}

export function constrainSupports(pose:RobotPose,size:number) {
  const constrained=constrainPose(pose,size)
  if(!robotSupportCollision(constrained,size))return constrained
  // Invalid starts are displayed at the nearest sampled free pose, but blocked:
  // this never edits the planned start or silently runs a different route.
  for(let radius=.5;radius<=48;radius+=.5)for(let i=0;i<64;i++) {
    const angle=i*Math.PI/32,next={...pose,x:constrained.x+Math.cos(angle)*radius,y:constrained.y+Math.sin(angle)*radius}
    if(clearsWalls(next,size)&&!robotSupportCollision(next,size))return next
  }
  return constrained
}

export function sweepSupports(from:RobotPose,to:RobotPose,size:number) {
  const rotation=shortestAngle(from.heading,to.heading),poseAt=(t:number)=>({...from,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,heading:from.heading+rotation*t})
  const initial=robotSupportCollision(from,size)
  if(initial)return {pose:constrainSupports(from,size),fraction:0,solid:initial}
  const count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/.2),Math.ceil(Math.abs(rotation)/.5))
  for(let i=1;i<=count;i++) {
    const solid=robotSupportCollision(poseAt(i/count),size)
    if(!solid)continue
    let low=(i-1)/count,high=i/count
    for(let j=0;j<28;j++){const mid=(low+high)/2;if(robotSupportCollision(poseAt(mid),size))high=mid;else low=mid}
    return {pose:poseAt(low),fraction:low,solid}
  }
  return {pose:to,fraction:1,solid:undefined}
}

function sphereContact(p:Vec3,r:number,solid:FieldSolid) {
  let near:Vec3,d:number,normal:Vec3,depth:number
  if(solid.kind==='tube') {
    const v=subtract(solid.b,solid.a),offset=subtract(p,solid.a),t=clamp((offset.x*v.x+offset.y*v.y+offset.z*v.z)/(norm(v)**2||1),0,1)
    near=at(solid.a,solid.b,t);normal=subtract(p,near);d=norm(normal);depth=r+solid.radius-d
  } else {
    const relative=subtract(p,solid.center);near=nearestBox(relative,solid.half);normal=subtract(relative,near);d=norm(normal);depth=r-d
    if(d<1e-10){
      const axis=axes.reduce((best,axis)=>solid.half[axis]-Math.abs(relative[axis])<solid.half[best]-Math.abs(relative[best])?axis:best,'x')
      normal={x:0,y:0,z:0};normal[axis]=Math.sign(relative[axis])||1;d=1;depth=r+solid.half[axis]-Math.abs(relative[axis])
    }
  }
  if(depth<=0)return
  if(d<1e-10){normal={x:1,y:0,z:0};d=1}
  return {normal:{x:normal.x/d,y:normal.y/d,z:normal.z/d},depth}
}

export function bounceOffSupports(ball:Vec3&{vx:number;vy:number;vz:number},previous:Vec3,r:number) {
  // Sweep fast projectiles rather than testing only their final position.
  const target={x:ball.x,y:ball.y,z:ball.z},length=norm(subtract(target,previous)),count=Math.max(1,Math.ceil(length/Math.max(.2,r*.45)))
  for(let i=1;i<=count;i++)for(const solid of frameSolids) {
    const p=at(previous,target,i/count),contact=sphereContact(p,r,solid)
    if(!contact)continue
    const n=contact.normal
    ball.x=p.x+n.x*(contact.depth+.001);ball.y=p.y+n.y*(contact.depth+.001);ball.z=p.z+n.z*(contact.depth+.001)
    const velocity=ball.vx*n.x+ball.vy*n.y+ball.vz*n.z
    if(velocity<0){ball.vx-=1.46*velocity*n.x;ball.vy-=1.46*velocity*n.y;ball.vz-=1.46*velocity*n.z}
    return solid
  }
}
