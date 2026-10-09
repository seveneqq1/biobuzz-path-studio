import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Waypoint } from '../types'
import { generateJava } from './codegen'
import { analyzePath } from './optimizer'
import { compileRoute } from './route'
import { defaultConfig } from './simulation'

const node=(x:number,y:number):Waypoint=>({x,y,id:crypto.randomUUID(),heading:0,interpolation:'auto',controlWeight:1})
const exportCode=(points:Waypoint[])=>generateJava(points,analyzePath(points))

test('exports Pedro 3 PoseFactory/Paths and Ivy scheduler, not the Pedro 2 builder',()=>{
  const points=[node(12,18),node(100,18)],code=exportCode(points)
  assert.match(code,/PoseFactory\.degrees\(\)/)
  assert.match(code,/startPose = p\.of\(12, 18, 0\)/)
  assert.match(code,/Paths\.line\(startPose, pose1\)/)
  assert.match(code,/follower\.setPose\(startPose\)/)
  assert.match(code,/auto = sequential\(/)
  assert.match(code,/Scheduler\.schedule\(auto\)/)
  assert.match(code,/Scheduler\.execute\(\)/)
  assert.match(code,/follow\(follower, route\)/)
  assert.match(code,/\.setDone\(\(\) -> !follower\.following\(\)\)/)
  assert.match(code,/public void stop\(\)/)
  assert.doesNotMatch(code,/PathChain|new Point|pathBuilder|setStartingPose|setLinearHeadingInterpolation|routeStep/)
})
test('all heading strategies use Pedro 3 fluent API and retain fitted cubic handles',()=>{
  const points=Array.from({length:5},(_,i)=>node(20+i*20,20+i*10))
  points[0].curve={endId:points[1].id,c1:{x:27.125,y:32.5},c2:{x:33.125,y:40.5}}
  points[1].interpolation='linear';points[2].interpolation='constant';points[3].interpolation='tangent';points[4].interpolation='piecewise'
  const code=exportCode(points)
  assert.match(code,/p\.of\(27\.125, 32\.5, 0\)/)
  assert.match(code,/\.linear\(startPose, pose1\)/)
  assert.match(code,/\.constant\(pose1\)/)
  assert.match(code,/\.tangent\(\)/)
  assert.match(code,/com\.pedropathing\.paths\.interpolator\.Interpolator/)
  assert.match(code,/\.heading\(smoothPiecewise\(/)
  assert.match(code,/return Interpolator\.piecewise\(\)/)
  assert.match(code,/localT \* curve\.parameter\(0\.68\)/)
})
test('actions partition the route and compile sequential/parallel/deadline/timeout race commands',()=>{
  const points=Array.from({length:6},(_,i)=>node(15+i*20,25))
  points[0].action={type:'intake',composition:'parallel'}
  points[1].action={type:'shoot',timeoutMs:4500}
  points[2].action={type:'flowerIntake',composition:'deadline'}
  points[3].action={type:'transfer',composition:'parallel'}
  points[4].action={type:'wait',durationMs:733}
  const route=compileRoute(points),code=exportCode(points)
  assert.equal(route[0].kind,'group')
  assert.match(code,/parallel\(followPath\(path0\(\)\), instant\(this::startIntake\)\.requiring\(intakeResource\)\)/)
  assert.match(code,/race\(shootCommand\(\), waitMs\(4500\)\)/)
  assert.match(code,/deadline\(followPath\(path2\(\)\), flowerIntakeCommand\(\)\)/)
  assert.match(code,/parallel\(followPath\(path3\(\)\), transferCommand\(\)\)/)
  assert.match(code,/waitMs\(700\)/)
  assert.match(code,/\.setDone\(this::isShooterFinished\)/)
  assert.match(code,/\.setEnd\(reason -> stopShooter\(\)\)/)
  assert.match(code,/throw new IllegalStateException/)
  assert.doesNotMatch(code,/isShooterFinished\(\) \{ return true/)
})
test('last-waypoint concurrent action falls back to sequential without losing it',()=>{
  const points=[node(15,15),node(30,30)]
  points[1].action={type:'shoot',composition:'deadline'}
  const code=exportCode(points)
  assert.match(code,/followPath\(path0\(\)\),\n {12}shootCommand\(\)/)
  assert.doesNotMatch(code,/deadline\(followPath/)
})
test('collinear handles that reverse direction are not incorrectly exported as a line',()=>{
  const points=[node(20,20),node(21,20),node(100,20)]
  points[1].action={type:'wait',durationMs:500}
  const code=exportCode(points)
  assert.match(code,/Paths\.curve\(startPose,/)
  assert.doesNotMatch(code,/Paths\.line\(startPose,/)
})
test('SANA turret export aims independently, gates the feeder, and uses separate Ivy requirements',()=>{
  const points=[node(85,20),node(115,20)];points[0].action={type:'shoot'}
  const code=exportCode(points)
  assert.match(code,/public class SanaAuto/);assert.match(code,/aimTurretCommand\(\),/)
  assert.match(code,/trackTurretCommand\(\)/);assert.match(code,/Pose robot = follower\.pose\(\)/)
  assert.match(code,/Math\.atan2\(dy, dx\) - robot\.heading\(\)/)
  assert.match(code,/isTurretAtTarget\(\) && isShooterAtSpeed\(\)/)
  assert.match(code,/\.requiring\(turretResource\)/);assert.match(code,/stopTurret\(\)/)
  assert.doesNotMatch(code,/follower\.setHeading/)
})
test('unsafe routes export a fail-fast wall clearance guard',()=>{
  const code=exportCode([node(20,20),node(142,20)])
  assert.match(code,/routeClearsWalls = false/);assert.match(code,/if \(!routeClearsWalls\) throw/)
})
test('robot setup alliance, manual pitch and intake template propagate to Java',()=>{
  const points=[node(40,20),node(100,20)];points[0].action={type:'shoot'}
  const code=generateJava(points,analyzePath(points),{...defaultConfig,alliance:'blue',autoAim:false,shotAngle:62,intakeMaterial:'silicone'})
  assert.match(code,/silicone wheel stacks/);assert.match(code,/hiveTargetY\(\) \{ return 84\.75/)
  assert.match(code,/double elevation = Math\.toRadians\(62\)/);assert.doesNotMatch(code,/double discriminant/)
})
test('hive support intersections export a separate fail-fast clearance guard',()=>{
  const code=exportCode([node(25,52.525),node(60,52.525)])
  assert.match(code,/routeClearsSupports = false/);assert.match(code,/if \(!routeClearsSupports\) throw/)
  assert.match(code,/hive pillar/)
})
