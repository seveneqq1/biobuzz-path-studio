import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimizeCurves, cubic, curveArc } from './curveFit'
import { controls, distance, editWaypoint } from './geometry'
import { defaultConfig, profile, resetSimulation, stepSimulation } from './simulation'
import type { Waypoint } from '../types'
import { addCellPiece, advanceHive, cellOpening, createHive, HIVE, pieceMass } from './hivePhysics'

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
  s.intake=true;s.balls.push({id:100,x:20,y:20,z:0,vx:0,vy:0,vz:0,kind:'pollen'})
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
  assert.ok(spills.every(p=>p.x>15 && p.vx>0 && p.vz<0 && p.vy===0))
  assert.ok(Math.max(...spills.map(p=>p.y))-Math.min(...spills.map(p=>p.y))<=12)
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
  assert.ok(s.x>85);assert.equal(s.shooting,false);assert.equal(s.inventory,3)
})
test('intake and shooting preserve nectar kind and alliance color',()=>{
  const points=[node(85,20),node(115,20)];points[0].action={type:'wait',durationMs:100}
  const config={...defaultConfig,preload:0},s=resetSimulation(points,config),route=profile(points,config)
  s.intake=true;s.balls.push({id:100,x:85,y:20,z:1.8,vx:0,vy:0,vz:0,kind:'nectar',color:'blue'})
  stepSimulation(s,points,config,route,1/120)
  assert.deepEqual(s.hopper,[{kind:'nectar',color:'blue'}]);assert.equal(s.inventory,1)
  s.shooting=true;s.remaining=0;s.activeType='shoot'
  stepSimulation(s,points,config,route,1/120)
  const fired=s.balls.find(b=>b.id===24)!
  assert.equal(fired.kind,'nectar');assert.equal(fired.color,'blue');assert.equal(s.inventory,0)
})
