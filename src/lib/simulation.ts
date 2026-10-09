import type { Point2D, Waypoint } from '../types'
import { clamp, controls, distance, shortestAngle, tangentDegrees } from './geometry'
import { cubic, curveArc } from './curveFit'
import { analyzePath } from './optimizer'
import { addCellPiece, advanceHive, cellOpening, createHive, GRAVITY, HIVE, hiveToLocal, pieceMass, pieceRadius } from './hivePhysics'
import type { Hive } from './hivePhysics'
import type { CellPiece } from './hivePhysics'
import { compileRoute, nextPathEnd } from './route'
export { HIVE } from './hivePhysics'
export type { Hive } from './hivePhysics'

export interface RobotConfig {
  rpm:number; wheel:number; gearing:number; mass:number; force:number; grip:number; efficiency:number
  size:number; turnRate:number; capacity:number; preload:number; shotSpeed:number; shotAngle:number; shotInterval:number; transferTime:number
  alliance:'red'|'blue'
  autoAim:boolean
}
export const defaultConfig: RobotConfig={rpm:312,wheel:3.78,gearing:1,mass:12,force:65,grip:.8,efficiency:.75,size:16,turnRate:180,capacity:8,preload:4,shotSpeed:240,shotAngle:55,shotInterval:.45,transferTime:.6,alliance:'red',autoAim:true}
export interface RouteSample extends Point2D {heading:number; s:number; time:number; node?:number}
export function profile(points:Waypoint[],config:RobotConfig) {
  const samples:RouteSample[]=[]
  const decisions=analyzePath(points)
  for(let i=0;i<points.length-1;i++) {
    const {c1,c2}=controls(points,i)
    const arc=curveArc(points[i],c1,c2,points[i+1]),joinT=arc.parameterAt(.68)
    const joinHeading=tangentDegrees(cubic(points[i],c1,c2,points[i+1],joinT-.001),cubic(points[i],c1,c2,points[i+1],joinT+.001))
    for(let j= i===0 ? 0:1;j<=80;j++) {
      const t=j/80, p=cubic(points[i],c1,c2,points[i+1],t)
      const before=cubic(points[i],c1,c2,points[i+1],Math.max(0,t-.001)),after=cubic(points[i],c1,c2,points[i+1],Math.min(1,t+.001))
      const tangent=tangentDegrees(before,after), type=decisions[i].type
      const progress=arc.completionAt(t)
      let heading=points[i].heading+shortestAngle(points[i].heading,points[i+1].heading)*progress
      if(type==='constant') heading=points[i].heading
      if(type==='tangent') heading=tangent
      if(type==='piecewise') {
        heading=progress<.68 ? tangent : joinHeading+shortestAngle(joinHeading,points[i+1].heading)*(progress-.68)/.32
      }
      const prev=samples.at(-1)
      samples.push({...p,heading,s:(prev?.s??0)+(prev?distance(prev,p):0),time:0,...(j===80?{node:i+1}:i===0&&j===0?{node:0}:{})})
    }
  }
  const maxSpeed=config.rpm/config.gearing*Math.PI*config.wheel/60*config.efficiency
  const acceleration=Math.min(config.force/config.mass,config.grip*9.81)*39.3701
  const speeds=samples.map((sample,i)=>{
    if(i===0 || i===samples.length-1 || sample.node!==undefined && points[sample.node].action) return 0
    const prev=samples[i-1],next=samples[i+1],ds=distance(prev,next)
    const bend=Math.abs(shortestAngle(tangentDegrees(prev,sample),tangentDegrees(sample,next)))*Math.PI/180
    const lateral=Math.sqrt(acceleration*Math.max(ds/2,.01)/Math.max(bend,.0001))
    const angular=config.turnRate*Math.max(distance(prev,sample),.001)/Math.max(Math.abs(shortestAngle(prev.heading,sample.heading)),.001)
    return Math.min(maxSpeed,lateral,angular)
  })
  for(let i=1;i<speeds.length;i++) speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i-1]**2+2*acceleration*(samples[i].s-samples[i-1].s)))
  for(let i=speeds.length-2;i>=0;i--) speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i+1]**2+2*acceleration*(samples[i+1].s-samples[i].s)))
  for(let i=1;i<samples.length;i++) samples[i].time=samples[i-1].time+2*(samples[i].s-samples[i-1].s)/Math.max(.01,speeds[i]+speeds[i-1])
  const drive=samples.at(-1)?.time??0
  const nodeTime=(node:number)=>samples.find(s=>s.node===node)?.time??0
  let min=0,max=0
  for(const step of compileRoute(points)) {
    if(step.kind==='path'){const time=nodeTime(step.endIndex)-nodeTime(step.startIndex);min+=time;max+=time;continue}
    const action=step.action
    const fixed=action.type==='wait'?(action.durationMs??100)/1000:action.type==='transfer'?config.transferTime:action.type==='flowerIntake'?1:0
    const upper=action.type==='shoot'?config.capacity*config.shotInterval+2*config.shotSpeed/GRAVITY+1.5:fixed
    const cap=action.timeoutMs ? action.timeoutMs/1000:Infinity
    if(step.kind==='action'){min+=Math.min(fixed,cap);max+=Math.min(upper,cap)}
    else {
      const time=nodeTime(step.path.endIndex)-nodeTime(step.path.startIndex)
      min+=step.mode==='deadline'?time:Math.max(time,Math.min(fixed,cap))
      max+=step.mode==='deadline'?time:Math.max(time,Math.min(upper,cap))
    }
  }
  return {samples,drive,min,max,maxSpeed,acceleration}
}
export interface Ball extends Point2D {id:number;vx:number;vy:number;z:number;vz:number;kind:'pollen'|'nectar';color?:'red'|'blue';flower?:number;released?:boolean}
export interface SimState {x:number;y:number;heading:number;time:number;driveTime:number;index:number;inventory:number;hopper:CellPiece[];intake:boolean;balls:Ball[];hives:Hive[];action:string;remaining:number;shotClock:number;shooting:boolean;finished:boolean;warning:string;processed:number[];nextId:number;
  activeType?:string; timeout:number; concurrent?:{endNode:number;mode:'parallel'|'deadline'} }
// Asset orientation: blue alliance at top, red at bottom; no rotation is applied.
export const flowers=[{x:48,y:141},{x:141,y:96},{x:96,y:3},{x:3,y:48}]
export const hiveCenters=[{x:72,y:59.25},{x:72,y:84.75}]
export function resetSimulation(points:Waypoint[],config:RobotConfig):SimState {
  const balls:Ball[]=[]
  const add=(x:number,y:number,flower?:number,z=1.4)=>balls.push({id:balls.length,x,y,z,vx:0,vy:0,vz:0,kind:'pollen',flower})
  for(let i=0;i<4;i++){add(1.5,142.5-i*2.8);add(142.5,1.5+i*2.8)}
  flowers.forEach((f,i)=>{for(let j=0;j<4;j++)add(f.x,f.y,i,1.4+j*2.8)})
  const hopper=Array.from({length:Math.floor(Math.min(config.capacity,config.preload))},()=>({kind:'pollen' as const}))
  return {x:points[0]?.x??18,y:points[0]?.y??18,heading:points[0]?.heading??0,time:0,driveTime:0,index:0,inventory:hopper.length,hopper,intake:false,balls,hives:[createHive(1,'red'),createHive(0,'blue')],action:'Ready',remaining:0,shotClock:0,shooting:false,finished:false,warning:'',processed:[],nextId:24,timeout:Infinity}
}
export function stepSimulation(s:SimState,points:Waypoint[],config:RobotConfig,route:ReturnType<typeof profile>,dt:number) {
  if(s.finished)return
  s.time+=dt
  const current=route.samples[s.index]
  if(!current){s.finished=true;return}
  const busy=()=>s.shooting||s.remaining>0||s.activeType==='intake'&&s.concurrent?.mode==='deadline'
  const endAction=()=>{if(s.activeType==='flowerIntake'||s.activeType==='intake'&&s.concurrent?.mode==='deadline')s.intake=false;s.shooting=false;s.remaining=0;s.activeType=undefined;s.timeout=Infinity}
  // A parallel group joins both branches. A deadline cancels its action branch.
  if(s.concurrent && current.node===s.concurrent.endNode) {
    if(s.concurrent.mode==='deadline')endAction()
    if(!busy())s.concurrent=undefined
  }
  if(!s.concurrent && !busy() && current.node!==undefined && !s.processed.includes(current.node)) {
    s.processed.push(current.node)
    const action=points[current.node].action
    if(action){s.action=action.type;s.activeType=action.type;s.timeout=action.timeoutMs && action.type!=='intake'&&action.type!=='wait'?action.timeoutMs/1000:Infinity
      s.remaining=action.type==='wait'?(action.durationMs??100)/1000:action.type==='transfer'?config.transferTime:action.type==='flowerIntake'?1:0
      if(action.composition && action.composition!=='sequential' && current.node<points.length-1)s.concurrent={mode:action.composition,endNode:nextPathEnd(points,current.node)}
      if(action.type==='intake')s.intake=true
      if(action.type==='shoot'){s.shooting=true;s.remaining=0;s.shotClock=0;s.intake=false}
      if(action.type==='flowerIntake') {
        s.intake=true
        for(const ball of s.balls)if(ball.flower!==undefined && distance(ball,s)<config.size/2+6)ball.flower=undefined
      }
    }
  }
  s.timeout-=dt
  if(s.timeout<=0)endAction()
  if(s.shooting) {
    s.shotClock-=dt
    if(s.inventory>0 && s.shotClock<=0){
      const hive=s.hives[config.alliance==='red'?0:1],center=hiveCenters[config.alliance==='red'?0:1]
      const opening=cellOpening(hive,hive.side)
      const target={x:center.x+opening.x,y:center.y}
      const angle=Math.atan2(target.y-s.y,target.x-s.x)
      const range=Math.max(.01,distance(s,target)),v2=config.shotSpeed**2,g=386.09
      const rise=opening.z-18
      const discriminant=v2*v2-g*(g*range*range+2*rise*v2)
      // High arc reaches the raised cell while descending. Fall back to the manual
      // angle when launch speed cannot reach it, so misses remain visible.
      const elevation=config.autoAim && discriminant>=0
        ? Math.atan((v2+Math.sqrt(discriminant))/(g*range)) : config.shotAngle*Math.PI/180
      const piece=s.hopper.shift()!
      s.balls.push({...piece,id:s.nextId++,x:s.x,y:s.y,z:18,vx:Math.cos(angle)*config.shotSpeed*Math.cos(elevation),vy:Math.sin(angle)*config.shotSpeed*Math.cos(elevation),vz:config.shotSpeed*Math.sin(elevation)})
      s.inventory=s.hopper.length;s.shotClock=config.shotInterval
    }
    if(s.inventory===0 && !s.balls.some(b=>b.z>pieceRadius(b.kind)+.2 && b.flower===undefined) && !s.hives.some(h=>h.tipping||h.spilling!==null))endAction()
  } else if(s.remaining>0)s.remaining=Math.max(0,s.remaining-dt)
  if(!s.shooting && s.remaining===0 && !(s.activeType==='intake'&&s.concurrent?.mode==='deadline'))endAction()
  const groupAtEnd=s.concurrent && current.node===s.concurrent.endNode
  if(!busy() || s.concurrent && !groupAtEnd) {
    s.action=busy()?`${s.activeType} + Drive`:'Drive'
    s.driveTime+=dt
    while(s.index<route.samples.length-1 && route.samples[s.index+1].time<=s.driveTime){
      s.index++
      const next=route.samples[s.index]
      if(next.node!==undefined && (points[next.node].action && !s.processed.includes(next.node) || s.concurrent?.endNode===next.node)){s.driveTime=next.time;break}
    }
    const a=route.samples[s.index],b=route.samples[s.index+1]??a
    const atAction=a.node!==undefined && points[a.node].action && !s.processed.includes(a.node)
    const t=atAction?0:clamp((s.driveTime-a.time)/Math.max(.00001,b.time-a.time),0,1)
    s.x=a.x+(b.x-a.x)*t;s.y=a.y+(b.y-a.y)*t;s.heading=a.heading+shortestAngle(a.heading,b.heading)*t
    if(s.index===route.samples.length-1 && !busy() && !s.concurrent && !(a.node!==undefined && points[a.node].action && !s.processed.includes(a.node)) && !s.balls.some(ball=>ball.flower===undefined && ball.z>pieceRadius(ball.kind)+.2) && !s.hives.some(h=>h.tipping || h.spilling!==null)){s.finished=true;s.intake=false}
  }
  const remove=new Set<number>()
  for(const ball of s.balls){
    if(ball.flower!==undefined)continue
    const old={x:ball.x,y:ball.y,z:ball.z},r=pieceRadius(ball.kind)
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt
    if(ball.z>r || ball.vz>0){ball.z+=ball.vz*dt-GRAVITY*dt*dt/2;ball.vz-=GRAVITY*dt}
    s.hives.forEach((h,i)=>{
      const center=hiveCenters[i],local=hiveToLocal(h,ball.x-center.x,ball.z),before=hiveToLocal(h,old.x-center.x,old.z)
      const sign=h.side===0?-1:1
      const oldPlane=sign*before.x-HIVE.outer,newPlane=sign*local.x-HIVE.outer
      if(!ball.released && oldPlane>0 && newPlane<=0 && cellOpening(h,h.side).nz>0) {
        const t=oldPlane/(oldPlane-newPlane),y=old.y+(ball.y-old.y)*t-center.y,z=before.z+(local.z-before.z)*t
        if(Math.abs(y)<HIVE.openingWidth/2-r && Math.abs(z-HIVE.openingCenter)<HIVE.openingHeight/2-r){
          addCellPiece(h,h.side,{kind:ball.kind,color:ball.color});remove.add(ball.id);return
        }
      }
      // Approximate rigid cell skins: balls striking backs / side walls rebound
      // instead of passing through the basket. Opening entry is handled above.
      if(Math.abs(ball.y-center.y)<HIVE.openingWidth/2+r && local.z>-1.2-r && local.z<19.8+r) {
        for(const side of [-1,1]) {
          const u=side*local.x,previous=side*before.x
          if(Math.abs(u-HIVE.inner)<r+.3 && (previous-HIVE.inner)*(u-HIVE.inner)<=0){
            const nx=side*Math.cos(h.angle),nz=side*Math.sin(h.angle),dot=ball.vx*nx+ball.vz*nz
            ball.vx-=1.4*dot*nx;ball.vz-=1.4*dot*nz
            ball.x=old.x;ball.z=old.z
          }
        }
      }
    })
    if(remove.has(ball.id))continue
    if(ball.z<r){ball.z=r;ball.vz=Math.abs(ball.vz)>16?-ball.vz*.32:0}
    if(ball.z<=r+.01 && ball.vz===0){const speed=Math.hypot(ball.vx,ball.vy),next=Math.max(0,speed-9*dt);ball.vx*=speed?next/speed:0;ball.vy*=speed?next/speed:0}
    for(const axis of ['x','y'] as const){const velocity=axis==='x'?'vx':'vy';if(ball[axis]<r || ball[axis]>144-r){ball[axis]=clamp(ball[axis],r,144-r);ball[velocity]*=-.48}}
    const d=distance(ball,s),radius=config.size/2+r
    if(ball.z<4 && d<radius){
      if(s.intake && s.inventory<config.capacity){remove.add(ball.id);s.hopper.push({kind:ball.kind,color:ball.color});s.inventory=s.hopper.length}
      else {const dx=(ball.x-s.x)/(d||1),dy=(ball.y-s.y)/(d||1);ball.x=s.x+dx*radius;ball.y=s.y+dy*radius;ball.vx+=dx*15;ball.vy+=dy*15}
    }
  }
  s.balls=s.balls.filter(b=>!remove.has(b.id))
  for(let i=0;i<s.balls.length;i++)for(let j=i+1;j<s.balls.length;j++){
    const a=s.balls[i],b=s.balls[j],d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),r=pieceRadius(a.kind)+pieceRadius(b.kind)
    if(a.flower!==undefined || b.flower!==undefined || d>=r || d<.001)continue
    const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,nz=(b.z-a.z)/d,ia=1/pieceMass(a.kind),ib=1/pieceMass(b.kind),overlap=r-d
    a.x-=nx*overlap*ia/(ia+ib);a.y-=ny*overlap*ia/(ia+ib);a.z=Math.max(pieceRadius(a.kind),a.z-nz*overlap*ia/(ia+ib))
    b.x+=nx*overlap*ib/(ia+ib);b.y+=ny*overlap*ib/(ia+ib);b.z=Math.max(pieceRadius(b.kind),b.z+nz*overlap*ib/(ia+ib))
    const speed=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny+(a.vz-b.vz)*nz
    if(speed>0){const impulse=1.38*speed/(ia+ib);a.vx-=nx*impulse*ia;a.vy-=ny*impulse*ia;a.vz-=nz*impulse*ia;b.vx+=nx*impulse*ib;b.vy+=ny*impulse*ib;b.vz+=nz*impulse*ib}
  }
  s.hives.forEach((h,i)=>{
    const center=hiveCenters[i]
    for(const spill of advanceHive(h,dt))s.balls.push({...spill,id:s.nextId++,x:center.x+spill.x,y:center.y+spill.y,released:true})
  })
  const half=config.size/2
  s.warning=s.x<half||s.x>144-half||s.y<half||s.y>144-half?'Robot footprint crosses the field wall':Math.abs(s.x-72)<23+half && Math.abs(s.y-72)<19+half?'HIVE envelope overlap: check height and frame clearance':''
}
