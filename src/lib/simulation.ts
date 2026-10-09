import type { Point2D, Waypoint } from '../types'
import { clamp, controls, distance, shortestAngle, tangentDegrees } from './geometry'
import { cubic } from './curveFit'
import { analyzePath } from './optimizer'

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
    for(let j= i===0 ? 0:1;j<=80;j++) {
      const t=j/80, p=cubic(points[i],c1,c2,points[i+1],t)
      const before=cubic(points[i],c1,c2,points[i+1],Math.max(0,t-.001)),after=cubic(points[i],c1,c2,points[i+1],Math.min(1,t+.001))
      const tangent=tangentDegrees(before,after), type=decisions[i].type
      let heading=points[i].heading+shortestAngle(points[i].heading,points[i+1].heading)*t
      if(type==='constant') heading=points[i].heading
      if(type==='tangent') heading=tangent
      if(type==='piecewise') {
        const join=tangentDegrees(cubic(points[i],c1,c2,points[i+1],.679),cubic(points[i],c1,c2,points[i+1],.681))
        heading=t<.68 ? tangent : join+shortestAngle(join,points[i+1].heading)*(t-.68)/.32
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
  const fixed=points.reduce((sum,p)=>sum+(p.action?.type==='wait'?(p.action.durationMs??100)/1000:p.action?.type==='transfer'?config.transferTime:p.action?.type==='flowerIntake'?1:p.action?.type==='intake' ? .2:0),0)
  const shots=points.filter(p=>p.action?.type==='shoot').length
  return {samples,drive,min:drive+fixed,max:drive+fixed+shots*(config.capacity*config.shotInterval+2*config.shotSpeed/386.09+1.5),maxSpeed,acceleration}
}
export interface Ball extends Point2D {id:number;vx:number;vy:number;z:number;vz:number;kind:'pollen'|'nectar';flower?:number}
export interface Hive {side:number;tips:number;cells:[number,number];angle:number}
export interface SimState {x:number;y:number;heading:number;time:number;driveTime:number;index:number;inventory:number;intake:boolean;balls:Ball[];hives:Hive[];action:string;remaining:number;shotClock:number;shooting:boolean;finished:boolean;warning:string;processed:number[];nextId:number}
// Asset orientation: blue alliance at top, red at bottom; no rotation is applied.
export const flowers=[{x:48,y:141},{x:141,y:96},{x:96,y:3},{x:3,y:48}]
export const hiveCenters=[{x:72,y:59},{x:72,y:85}]
export function resetSimulation(points:Waypoint[],config:RobotConfig):SimState {
  const balls:Ball[]=[]
  const add=(x:number,y:number,flower?:number)=>balls.push({id:balls.length,x,y,z:0,vx:0,vy:0,vz:0,kind:'pollen',flower})
  for(let i=0;i<4;i++){add(1.5,142.5-i*2.8);add(142.5,1.5+i*2.8)}
  flowers.forEach((f,i)=>{for(let j=0;j<4;j++)add(f.x,f.y,i)})
  return {x:points[0]?.x??18,y:points[0]?.y??18,heading:points[0]?.heading??0,time:0,driveTime:0,index:0,inventory:Math.min(config.capacity,config.preload),intake:false,balls,hives:[{side:1,tips:0,cells:[0,5],angle:30},{side:0,tips:0,cells:[5,0],angle:-30}],action:'Ready',remaining:0,shotClock:0,shooting:false,finished:false,warning:'',processed:[],nextId:24}
}
export function stepSimulation(s:SimState,points:Waypoint[],config:RobotConfig,route:ReturnType<typeof profile>,dt:number) {
  if(s.finished)return
  s.time+=dt
  const current=route.samples[s.index]
  if(!current){s.finished=true;return}
  if(current.node!==undefined && !s.processed.includes(current.node)) {
    s.processed.push(current.node)
    const action=points[current.node].action
    if(action){s.action=action.type;s.remaining=action.type==='wait'?(action.durationMs??100)/1000:action.type==='transfer'?config.transferTime:action.type==='flowerIntake'?1:.2
      if(action.type==='intake')s.intake=true
      if(action.type==='shoot'){s.shooting=true;s.remaining=0;s.shotClock=0;s.intake=false}
      if(action.type==='flowerIntake') {
        s.intake=true
        for(const ball of s.balls)if(ball.flower!==undefined && distance(ball,s)<config.size/2+6)ball.flower=undefined
      }
    }
  }
  if(s.shooting) {
    s.shotClock-=dt
    if(s.inventory>0 && s.shotClock<=0){
      const hive=s.hives[config.alliance==='red'?0:1],center=hiveCenters[config.alliance==='red'?0:1]
      const target={x:center.x+(hive.side===0?-13:13),y:center.y}
      const angle=Math.atan2(target.y-s.y,target.x-s.x)
      const range=Math.max(.01,distance(s,target)),v2=config.shotSpeed**2,g=386.09
      const discriminant=v2*v2-g*(g*range*range+2*38*v2)
      // High arc reaches the raised cell while descending. Fall back to the manual
      // angle when launch speed cannot reach it, so misses remain visible.
      const elevation=config.autoAim && discriminant>=0
        ? Math.atan((v2+Math.sqrt(discriminant))/(g*range)) : config.shotAngle*Math.PI/180
      s.balls.push({id:s.nextId++,x:s.x,y:s.y,z:18,vx:Math.cos(angle)*config.shotSpeed*Math.cos(elevation),vy:Math.sin(angle)*config.shotSpeed*Math.cos(elevation),vz:config.shotSpeed*Math.sin(elevation),kind:'pollen'})
      s.inventory--;s.shotClock=config.shotInterval
    }
    if(s.inventory===0 && !s.balls.some(b=>b.z>2)){s.shooting=false;s.action='Drive'}
  } else if(s.remaining>0)s.remaining=Math.max(0,s.remaining-dt)
  else {
    s.action='Drive'
    s.driveTime+=dt
    while(s.index<route.samples.length-1 && route.samples[s.index+1].time<=s.driveTime){
      s.index++
      if(route.samples[s.index].node!==undefined && points[route.samples[s.index].node!].action && !s.processed.includes(route.samples[s.index].node!)){s.driveTime=route.samples[s.index].time;break}
    }
    const a=route.samples[s.index],b=route.samples[s.index+1]??a
    const atAction=a.node!==undefined && points[a.node].action && !s.processed.includes(a.node)
    const t=atAction?0:clamp((s.driveTime-a.time)/Math.max(.00001,b.time-a.time),0,1)
    s.x=a.x+(b.x-a.x)*t;s.y=a.y+(b.y-a.y)*t;s.heading=a.heading+shortestAngle(a.heading,b.heading)*t
    if(s.index===route.samples.length-1 && !(a.node!==undefined && points[a.node].action && !s.processed.includes(a.node)))s.finished=true
  }
  const remove=new Set<number>()
  for(const ball of s.balls){
    if(ball.flower!==undefined)continue
    const oldZ=ball.z
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt
    if(ball.z>0 || ball.vz>0){ball.z+=ball.vz*dt-386.09*dt*dt/2;ball.vz-=386.09*dt}
    if(oldZ>=56 && ball.z<=56 && ball.vz<0){
      s.hives.forEach((h,i)=>{const center=hiveCenters[i];if(Math.abs(ball.x-(center.x+(h.side===0?-13:13)))<7 && Math.abs(ball.y-center.y)<9){h.cells[h.side]+=ball.kind==='nectar'?5/3:1;remove.add(ball.id)}})
    }
    if(ball.z<0){ball.z=0;ball.vz=Math.abs(ball.vz)>20?-ball.vz*.25:0}
    if(ball.z===0){ball.vx*=Math.exp(-2.5*dt);ball.vy*=Math.exp(-2.5*dt)}
    for(const axis of ['x','y'] as const){const velocity=axis==='x'?'vx':'vy';if(ball[axis]<1.4 || ball[axis]>142.6){ball[axis]=clamp(ball[axis],1.4,142.6);ball[velocity]*=-.55}}
    const d=distance(ball,s),radius=config.size/2+1.4
    if(ball.z<3 && d<radius){
      if(s.intake && s.inventory<config.capacity){remove.add(ball.id);s.inventory++}
      else {const dx=(ball.x-s.x)/(d||1),dy=(ball.y-s.y)/(d||1);ball.x=s.x+dx*radius;ball.y=s.y+dy*radius;ball.vx+=dx*15;ball.vy+=dy*15}
    }
  }
  s.balls=s.balls.filter(b=>!remove.has(b.id))
  for(let i=0;i<s.balls.length;i++)for(let j=i+1;j<s.balls.length;j++){
    const a=s.balls[i],b=s.balls[j],d=distance(a,b)
    if(a.flower!==undefined || b.flower!==undefined || a.z>2 || b.z>2 || d>=2.8 || d<.001)continue
    const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,overlap=(2.8-d)/2
    a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap
    const speed=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny
    if(speed>0){a.vx-=nx*speed*.7;a.vy-=ny*speed*.7;b.vx+=nx*speed*.7;b.vy+=ny*speed*.7}
  }
  s.hives.forEach((h,i)=>{
    if(h.cells[h.side]>=8){
      const center=hiveCenters[i],count=Math.round(h.cells[h.side]);h.cells[h.side]=0;h.side=1-h.side;h.tips++
      for(let n=0;n<count;n++)s.balls.push({id:s.nextId++,x:center.x+(h.side===0?13:-13),y:center.y,z:45,vx:Math.cos(n*2.4)*18,vy:Math.sin(n*2.4)*18,vz:0,kind:'pollen'})
    }
    h.angle+=( (h.side===0?-30:30)-h.angle)*Math.min(1,dt*4)
  })
  const half=config.size/2
  s.warning=s.x<half||s.x>144-half||s.y<half||s.y>144-half?'Robot footprint crosses the field wall':Math.abs(s.x-72)<23+half && Math.abs(s.y-72)<19+half?'HIVE envelope overlap: check height and frame clearance':''
}
