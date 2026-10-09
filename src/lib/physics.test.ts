import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimizeCurves, cubic, curveArc } from './curveFit'
import { controls, distance, editWaypoint, seedWaypoints } from './geometry'
import { defaultConfig, profile, resetSimulation, stepSimulation } from './simulation'
import type { Waypoint } from '../types'
import { addCellPiece, advanceHive, cellOpening, createHive, HIVE, pieceMass } from './hivePhysics'
import { clearsWalls, sweepWalls, wallExtent } from './walls'
import { bounceOffSupports, robotSupportCollision, segmentBoxDistance, sweepSupports } from './supportCollisions'
import { frameSolids, templateClearanceHeight } from './fieldGeometry'
import { airborneShots, followCameraFrame, shootingCameraActive, smoothCameraBlend } from './followCamera'

const node=(x:number,y:number):Waypoint=>({x,y,id:crypto.randomUUID(),heading:0,interpolation:'auto',controlWeight:1})
const sample=(points:Waypoint[])=>points.slice(0,-1).flatMap((p,i)=>{const {c1,c2}=controls(points,i);return Array.from({length:201},(_,j)=>cubic(p,c1,c2,points[i+1],j/200))})
test('semicircle keeps curvature with dense bidirectional error below half an inch',()=>{
  const points=Array.from({length:31},(_,i)=>node(72+40*Math.cos(i*Math.PI/30),60+40*Math.sin(i*Math.PI/30)))
  const reduced=optimizeCurves(points),a=sample(points),b=sample(reduced)
  assert.ok(reduced.length<points.length)
  assert.equal(reduced[0].id,points[0].id);assert.equal(reduced.at(-1)!.id,points.at(-1)!.id)
  for(const [source,target] of [[a,b],[b,a]])assert.ok(Math.max(...source.map(p=>Math.min(...target.map(q=>distance(p,q)))))<.5)
  for(let i=1;i<reduced.length-1;i++){
    const incoming=controls(reduced,i-1).c2,outgoing=controls(reduced,i).c1,p=reduced[i]
    const cross=(p.x-incoming.x)*(outgoing.y-p.y)-(p.y-incoming.y)*(outgoing.x-p.x)
    assert.ok(Math.abs(cross)<1e-6,'join tangents must align')
  }
})
test('actions and manual heading overrides survive fitting',()=>{
  const points=Array.from({length:20},(_,i)=>node(i*5,40+Math.sin(i/4)*20))
  points[7].action={type:'wait',durationMs:700};points[12].interpolation='constant'
  const reduced=optimizeCurves(points)
  for(const i of [7,12])assert.ok(reduced.some(p=>p.id===points[i].id && p.x===points[i].x && p.y===points[i].y))
})
test('editing a fitted anchor moves only its adjacent handles and keeps the rest of the fit',()=>{
  const points=Array.from({length:4},(_,i)=>node(20+i*20,20+i*10))
  for(let i=0;i<3;i++)points[i].curve={endId:points[i+1].id,c1:{x:points[i].x+7,y:points[i].y+7},c2:{x:points[i+1].x-7,y:points[i+1].y-7}}
  const moved=editWaypoint(points,points[1].id,{x:45,y:35})
  assert.deepEqual(moved[0].curve!.c2,{x:38,y:28})
  assert.deepEqual(moved[1].curve!.c1,{x:52,y:42})
  assert.deepEqual(moved[2].curve,points[2].curve)
  const tensioned=editWaypoint(moved,points[1].id,{controlWeight:1.5})
  assert.deepEqual(tensioned[1].curve!.c1,{x:55.5,y:45.5})
})
test('RPM, wheel gearing and mass affect the time estimate',()=>{
  const points=[node(15,15),node(130,15)]
  const base=profile(points,defaultConfig)
  assert.ok(profile(points,{...defaultConfig,rpm:100}).drive>base.drive)
  assert.ok(profile(points,{...defaultConfig,mass:30}).drive>base.drive)
  assert.ok(profile(points,{...defaultConfig,gearing:2}).drive>base.drive)
})
test('linear preview headings use arc length, not raw cubic parameter',()=>{
  const points=[node(20,20),node(100,100)]
  points[0].curve={endId:points[1].id,c1:{x:20,y:25},c2:{x:25,y:30}}
  points[1].heading=180;points[1].interpolation='linear'
  const arc=curveArc(points[0],points[0].curve.c1,points[0].curve.c2,points[1]),route=profile(points,defaultConfig)
  assert.ok(Math.abs(arc.completionAt(.5)-.5)>.01)
  assert.ok(Math.abs(route.samples[40].heading+180*arc.completionAt(.5))<1e-9)
  assert.ok(Math.abs(arc.completionAt(arc.parameterAt(.68))-.68)<1e-9)
})
test('wait gates motion, intake collects balls, reset restores inventory',()=>{
  const points=[node(20,20),node(100,20)];points[0].action={type:'wait',durationMs:1000}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  for(let i=0;i<100;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.x,20)
  s.intake=true;s.balls.push({id:100,x:28,y:20,z:1.4,vx:0,vy:0,vz:0,kind:'pollen'})
  stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.inventory,5);assert.ok(!s.balls.some(b=>b.id===100))
  for(let i=0;i<1000;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.ok(s.finished);assert.equal(s.x,100);assert.equal(resetSimulation(points,defaultConfig).inventory,4)
})
test('a ball crossing the raised opening starts a delayed, damped tip',()=>{
  const points=[node(15,15),node(130,15)],s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  for(let n=0;n<3;n++)addCellPiece(s.hives[0],1,{kind:'pollen'})
  const opening=cellOpening(s.hives[0],1)
  s.balls.push({id:100,x:72+opening.x+opening.nx*.5,y:59.25,z:opening.z+opening.nz*.5,vx:-opening.nx*120,vy:0,vz:-opening.nz*120,kind:'pollen'})
  stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.hives[0].tips,0);assert.ok(s.hives[0].tipping)
  for(let i=0;i<500;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.hives[0].tips,1);assert.equal(s.hives[0].side,0)
  assert.ok(!s.balls.some(b=>b.id===100))
})

test('tipping conserves real piece types and spills through one downward lip',()=>{
  const hive=createHive(1,'red')
  for(let i=0;i<4;i++)addCellPiece(hive,1,{kind:'pollen'})
  const spills:ReturnType<typeof advanceHive>=[]
  for(let i=0;i<600;i++){
    const released=advanceHive(hive,1/120)
    if(released.length)assert.ok(cellOpening(hive,1).nz<0,'opening must face downward before pieces leave')
    spills.push(...released)
  }
  assert.equal(hive.tips,1);assert.equal(hive.angle,-HIVE.stopAngle)
  assert.equal(spills.length,7);assert.equal(spills.filter(p=>p.kind==='nectar').length,3)
  assert.equal(spills.filter(p=>p.kind==='pollen').length,4)
  assert.ok(spills.every(p=>p.x>15 && p.vx>0 && p.vz<0))
  assert.ok(spills.some(p=>p.vy>2) && spills.some(p=>p.vy< -2),'packing creates a lateral fan in both directions')
  assert.ok(spills.every(p=>Math.abs(p.vy)<Math.abs(p.vx)),'spill must travel out of the lip, not sideways/radially')
  assert.ok(Math.max(...spills.map(p=>p.y))-Math.min(...spills.map(p=>p.y))<=HIVE.openingWidth-2*1.4)
  assert.ok(spills.some(p=>Math.hypot(p.vx,p.vy,p.vz)>40),'more energetic gravitational spill')
  const mass=spills.reduce((sum,p)=>sum+pieceMass(p.kind),0)
  assert.ok(Math.abs(mass-(3*.091+4*.055))<1e-9)
  assert.ok(hive.cells[1]<1e-8);assert.equal(hive.contents[1].length,0)
})

test('shooting scores, tips the hive, and finishes before the next path starts',()=>{
  const points=[node(85,20),node(115,20)];points[0].action={type:'shoot'}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  for(let i=0;i<60;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.x,85);assert.ok(s.shooting)
  for(let i=0;i<1200 && !s.finished;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.inventory,0);assert.ok(s.hives[0].tips>=1)
  assert.ok(s.finished);assert.equal(s.x,115)
})

test('elapsed time retains action delays through drive samples and support contact',()=>{
  for(const points of [[node(20,20),node(100,20)],[node(25,52.525),node(100,52.525)]]) {
    points[0].action={type:'wait',durationMs:700}
    const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
    let ticks=0
    while(!s.finished&&!s.blocked&&ticks<1200){
      stepSimulation(s,points,defaultConfig,route,1/120);ticks++
      assert.ok(Math.abs(s.time-ticks/120)<1e-9,'route time must not replace elapsed time')
    }
    assert.ok(s.finished||s.blocked)
    assert.ok(s.time>s.driveTime+.65)
  }
})

test('parallel commands overlap motion but join before the next action',()=>{
  const points=[node(20,20),node(21,20),node(100,20)]
  points[0].curve={endId:points[1].id,c1:{x:20.3,y:20},c2:{x:20.7,y:20}}
  points[0].action={type:'wait',durationMs:1000,composition:'parallel'}
  points[1].action={type:'intake'}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  for(let i=0;i<60;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.x,21);assert.equal(s.intake,false);assert.ok(s.remaining>0)
  for(let i=0;i<100;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.ok(s.x>21);assert.equal(s.intake,true)
  const sequential=points.map(p=>({...p,action:p.action?{...p.action,composition:'sequential' as const}:undefined}))
  assert.ok(route.min<profile(sequential,defaultConfig).min)
})
test('deadline cancels at the path endpoint and stops path-scoped intake',()=>{
  const points=[node(20,20),node(25,20),node(100,20)]
  points[0].action={type:'intake',composition:'deadline'};points[1].action={type:'wait',durationMs:1000}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  stepSimulation(s,points,defaultConfig,route,1/120);assert.equal(s.intake,true)
  for(let i=0;i<100;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.x,25);assert.equal(s.intake,false);assert.equal(s.activeType,'wait')
})
test('timeout race cancels shooting and allows the next path to proceed',()=>{
  const points=[node(85,20),node(115,20)];points[0].action={type:'shoot',timeoutMs:200}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  for(let i=0;i<70;i++)stepSimulation(s,points,defaultConfig,route,1/120)
  assert.ok(s.x>85);assert.equal(s.shooting,false);assert.equal(s.inventory,4,'timeout occurs before turret alignment; no early shots')
})
test('intake and shooting preserve nectar kind and alliance color',()=>{
  const points=[node(85,20),node(115,20)];points[0].action={type:'wait',durationMs:1000}
  const config={...defaultConfig,preload:0},s=resetSimulation(points,config),route=profile(points,config)
  s.intake=true;s.balls.push({id:100,x:93,y:20,z:1.8,vx:0,vy:0,vz:0,kind:'nectar',color:'blue'})
  stepSimulation(s,points,config,route,1/120)
  assert.deepEqual(s.feeder[0].piece,{kind:'nectar',color:'blue'});assert.equal(s.hopper.length,0)
  for(let i=0;i<80;i++)stepSimulation(s,points,config,route,1/120)
  assert.deepEqual(s.hopper,[{kind:'nectar',color:'blue'}]);assert.equal(s.inventory,1)
  s.shooting=true;s.remaining=0;s.activeType='shoot'
  stepSimulation(s,points,config,route,1/120)
  const fired=s.balls.find(b=>b.id===24)!
  assert.equal(fired.kind,'nectar');assert.equal(fired.color,'blue');assert.equal(s.inventory,0)
})

test('turret aligns at its own rate and fires without rotating the chassis',()=>{
  const points=[node(85,20),node(115,20)];points[0].action={type:'shoot'}
  const config={...defaultConfig,turretRate:45},s=resetSimulation(points,config),route=profile(points,config)
  for(let i=0;i<60;i++)stepSimulation(s,points,config,route,1/120)
  assert.equal(s.heading,0);assert.equal(s.inventory,4);assert.ok(s.turretYaw>20 && s.turretYaw<24)
  for(let i=0;i<300;i++)stepSimulation(s,points,config,route,1/120)
  assert.equal(s.heading,0);assert.ok(s.inventory<4)
})
test('only the front wheel intake collects, and transfer drains the sensor-indexed queue',()=>{
  const points=[node(30,30),node(100,30)];points[0].heading=90;points[1].heading=90;points[1].interpolation='constant';points[0].action={type:'transfer'}
  const config={...defaultConfig,preload:0},s=resetSimulation(points,config),route=profile(points,config)
  s.intake=true
  for(const [id,x,y] of [[100,30,38],[101,38,30],[102,30,22]])s.balls.push({id,x,y,z:1.4,vx:0,vy:0,vz:0,kind:'pollen'})
  stepSimulation(s,points,config,route,1/120)
  assert.equal(s.inventory,1);assert.equal(s.feeder.length,1);assert.equal(s.hopper.length,0)
  for(let i=0;i<60;i++)stepSimulation(s,points,config,route,1/120)
  assert.equal(s.x,30);assert.equal(s.feeder.length,1)
  for(let i=0;i<30;i++)stepSimulation(s,points,config,route,1/120)
  assert.equal(s.feeder.length,0);assert.equal(s.hopper.length,1);assert.ok(s.x>30)
})
test('rotating square sweeps catch a wall even when both endpoint poses are safe',()=>{
  assert.equal(wallExtent(0,16),8)
  const start={x:10,y:40,heading:0},end={...start,heading:90},contact=sweepWalls(start,end,16)
  assert.ok(clearsWalls(start,16) && clearsWalls(end,16));assert.ok(contact.hit)
  assert.ok(contact.fraction>0 && contact.fraction<.5);assert.ok(clearsWalls(contact.pose,16))
})
test('wall contact stops motion, never clips, and never executes the action past the wall',()=>{
  const points=[node(25,25),node(142,25)];points[1].action={type:'shoot'}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  assert.ok(route.wallCollision)
  for(let i=0;i<1500;i++){stepSimulation(s,points,defaultConfig,route,1/120);assert.ok(clearsWalls(s,16))}
  assert.ok(s.blocked);assert.equal(s.finished,false);assert.ok(s.x<=136);assert.ok(s.x>135.9)
  assert.equal(s.inventory,4);assert.ok(!s.processed.includes(1));assert.match(s.warning,/Wall contact/)
  const time=s.time;stepSimulation(s,points,defaultConfig,route,1);assert.equal(s.time,time)
})
test('unsafe starts are constrained and blocked before play, including angled corners',()=>{
  const points=[node(2,2),node(100,20)];points[0].heading=45
  const s=resetSimulation(points,defaultConfig)
  assert.ok(s.blocked);assert.ok(clearsWalls(s,16));assert.ok(s.x>11 && s.y>11)
})
test('a large timestep cannot jump over an outward-curving wall collision',()=>{
  const points=[node(110,40),node(110,100)]
  points[0].curve={endId:points[1].id,c1:{x:170,y:50},c2:{x:170,y:90}}
  const s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  stepSimulation(s,points,defaultConfig,route,100)
  assert.ok(s.blocked);assert.ok(clearsWalls(s,16));assert.equal(s.finished,false)
})
test('precise S-shaped fitting retains both lobes and commands without increasing point count',()=>{
  const points=Array.from({length:61},(_,i)=>node(20+i*1.6,72+22*Math.sin(i*Math.PI/30)))
  const reduced=optimizeCurves(points,.1),a=sample(points),b=sample(reduced)
  assert.ok(reduced.length<12);assert.ok(reduced.length<points.length)
  for(const [source,target] of [[a,b],[b,a]])assert.ok(Math.max(...source.map(p=>Math.min(...target.map(q=>distance(p,q)))))<.35)
})

test('segment-to-box distance accounts for diagonal 3D supports and open overhead space',()=>{
  assert.equal(segmentBoxDistance({x:-3,y:0,z:0},{x:3,y:0,z:0},{x:1,y:1,z:1}),0)
  assert.ok(Math.abs(segmentBoxDistance({x:-3,y:4,z:0},{x:3,y:4,z:0},{x:1,y:1,z:1})-3)<1e-9)
  assert.equal(robotSupportCollision({x:72,y:72,heading:0},16),undefined,'middle of the frame remains traversable under the axle')
  assert.ok(robotSupportCollision({x:72,y:72,heading:0},16,46),'a taller robot hits the overhead axle')
})
test('hive pillar collision sweeps stop before contact and block commands beyond the support',()=>{
  const points=[node(25,52.525),node(60,52.525)];points[1].action={type:'shoot'}
  const config=defaultConfig,s=resetSimulation(points,config),route=profile(points,config)
  assert.ok(route.supportCollision);assert.match(route.supportCollision.name,/hive pillar/)
  for(let i=0;i<800;i++){stepSimulation(s,points,config,route,1/120);assert.equal(robotSupportCollision(s,config.size),undefined)}
  assert.ok(s.blocked);assert.equal(s.finished,false);assert.equal(s.inventory,4);assert.ok(!s.processed.includes(1))
  assert.match(s.warning,/hive pillar/);assert.ok(s.x<40)
})
test('large translation and pure rotation cannot tunnel through a support foot',()=>{
  const swept=sweepSupports({x:25,y:52.525,heading:0},{x:120,y:52.525,heading:0},16)
  assert.ok(swept.solid);assert.ok(swept.fraction<.3);assert.equal(robotSupportCollision(swept.pose,16),undefined)
  const from={x:35,y:52.525,heading:0},to={...from,heading:90}
  assert.equal(robotSupportCollision(from,16),undefined);assert.equal(robotSupportCollision(to,16),undefined)
  assert.ok(sweepSupports(from,to,16).solid,'angled corners swing into the foot between safe endpoints')
})
test('support-overlapping starts are blocked and displayed at a non-penetrating pose',()=>{
  const points=[node(47.27,52.525),node(25,20)],s=resetSimulation(points,defaultConfig)
  assert.ok(s.blocked);assert.match(s.warning,/Start overlaps/)
  assert.equal(robotSupportCollision(s,16),undefined);assert.ok(clearsWalls(s,16))
})
test('fast airborne balls bounce off diagonal support capsules without tunnelling',()=>{
  const pillar=frameSolids.find(s=>s.kind==='tube'&&s.name==='South-east hive pillar')!
  assert.equal(pillar.kind,'tube');if(pillar.kind!=='tube')return
  const t=.45,center={x:pillar.a.x+(pillar.b.x-pillar.a.x)*t,y:pillar.a.y,z:pillar.a.z+(pillar.b.z-pillar.a.z)*t}
  const previous={...center,y:center.y-6},ball={...center,y:center.y+6,vx:0,vy:300,vz:0}
  const hit=bounceOffSupports(ball,previous,1.4)
  assert.equal(hit?.name,pillar.name);assert.ok(ball.y<center.y);assert.ok(ball.vy<0)
  assert.ok(Math.hypot(ball.vx,ball.vy,ball.vz)<=300,'support contacts do not add kinetic energy')
})
test('energetic spills are deterministic and retain every original piece',()=>{
  const run=()=>{const h=createHive(1,'red');for(let i=0;i<4;i++)addCellPiece(h,1,{kind:'pollen'});const spills=[];for(let i=0;i<600;i++)spills.push(...advanceHive(h,1/120));return spills}
  assert.deepEqual(run(),run());assert.equal(run().length,7)
})
test('follow camera fits the robot, hive, airborne shot and predicted apex in portrait and landscape',()=>{
  const state=resetSimulation([node(85,20),node(115,20)],defaultConfig)
  state.shooting=true;state.turretElevation=78
  state.balls.push({id:100,shot:true,x:87,y:32,z:90,vx:10,vy:25,vz:80,kind:'pollen'})
  assert.equal(airborneShots(state).length,1);assert.ok(shootingCameraActive(state))
  for(const aspect of [.45,1,2.2]){
    const frame=followCameraFrame(state,defaultConfig,aspect,1),p=frame.position,t=frame.target
    const dz={x:t.x-p.x,y:t.y-p.y,z:t.z-p.z},length=Math.hypot(dz.x,dz.y,dz.z),f={x:dz.x/length,y:dz.y/length,z:dz.z/length}
    const rLength=Math.hypot(f.x,f.z),right={x:-f.z/rLength,y:0,z:f.x/rLength}
    const up={x:right.y*f.z-right.z*f.y,y:right.z*f.x-right.x*f.z,z:right.x*f.y-right.y*f.x}
    for(const point of frame.subjects){const v={x:point.x-p.x,y:point.y-p.y,z:point.z-p.z},dot=(a:typeof v)=>a.x*v.x+a.y*v.y+a.z*v.z,depth=dot(f)
      assert.ok(depth>0);assert.ok(Math.abs(dot(up))<depth*Math.tan(39*Math.PI/360));assert.ok(Math.abs(dot(right))<depth*Math.tan(39*Math.PI/360)*aspect)}
    const close=followCameraFrame(state,defaultConfig,aspect,0)
    assert.ok(length>Math.hypot(close.position.x-close.target.x,close.position.y-close.target.y,close.position.z-close.target.z))
  }
  state.shooting=false;state.balls=state.balls.filter(b=>b.id!==100);assert.equal(shootingCameraActive(state),false)
})
test('shot camera smoothly widens and returns with frame-rate independent damping',()=>{
  let a=0,b=0
  for(let i=0;i<30;i++)a=smoothCameraBlend(a,true,1/30)
  for(let i=0;i<60;i++)b=smoothCameraBlend(b,true,1/60)
  assert.ok(a>.99);assert.ok(Math.abs(a-b)<1e-10)
  let previous=a
  for(let i=0;i<120;i++){a=smoothCameraBlend(a,false,1/60);assert.ok(a<previous&&a>=0);previous=a}
  assert.ok(a<.001)
})
test('the demo route clears the shared wall/support geometry',()=>{
  const route=profile(seedWaypoints(),defaultConfig)
  assert.equal(route.wallCollision,undefined);assert.equal(route.supportCollision,undefined)
  assert.ok(templateClearanceHeight(16)>24)
})
