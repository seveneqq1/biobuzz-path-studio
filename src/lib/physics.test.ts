import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimizeCurves, cubic } from './curveFit'
import { controls, distance } from './geometry'
import { defaultConfig, profile, resetSimulation, stepSimulation } from './simulation'
import type { Waypoint } from '../types'

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
test('RPM, wheel gearing and mass affect the time estimate',()=>{
  const points=[node(15,15),node(130,15)]
  const base=profile(points,defaultConfig)
  assert.ok(profile(points,{...defaultConfig,rpm:100}).drive>base.drive)
  assert.ok(profile(points,{...defaultConfig,mass:30}).drive>base.drive)
  assert.ok(profile(points,{...defaultConfig,gearing:2}).drive>base.drive)
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
test('descending ball enters a cell and tipping changes the active side',()=>{
  const points=[node(15,15),node(130,15)],s=resetSimulation(points,defaultConfig),route=profile(points,defaultConfig)
  s.hives[0].cells[1]=7
  s.balls.push({id:100,x:85,y:59,z:56.2,vx:0,vy:0,vz:-60,kind:'pollen'})
  stepSimulation(s,points,defaultConfig,route,1/120)
  assert.equal(s.hives[0].tips,1);assert.equal(s.hives[0].side,0)
  assert.ok(!s.balls.some(b=>b.id===100))
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
