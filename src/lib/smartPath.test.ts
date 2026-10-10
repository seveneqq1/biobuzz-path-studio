import test from 'node:test'
import assert from 'node:assert/strict'
import type { Waypoint } from '../types'
import { addControlPoint, autoBuild, bestHeadings } from './smartPath'
import { defaultConfig, profile } from './simulation'
import { bezierAt, segmentPoints, seedWaypoints } from './geometry'
import { generateJava } from './codegen'
import { analyzePath } from './optimizer'
import { HIVE } from './hivePhysics'

const wp = (x: number, y: number, extra: Partial<Waypoint> = {}): Waypoint => ({ id: crypto.randomUUID(), x, y, heading: 90, interpolation: 'auto', controlWeight: 1, ...extra })

test('auto-build collapses a dense drawing into major points with control points', () => {
  const drawn = Array.from({ length: 25 }, (_, i) => wp(20 + i * 2, 20 + Math.sin(i / 6) * 18))
  drawn[12].action = { type: 'intake' }
  const { points, report } = autoBuild(drawn, defaultConfig)
  assert.equal(points.length, 3)
  assert.equal(report.sections, 2)
  assert.ok(points[0].controlPoints && points[1].controlPoints)
  assert.equal(points[1].action?.type, 'intake')
  assert.ok(report.clear)
})

test('auto-build stays close to the drawing when the drawing is clear', () => {
  const drawn = Array.from({ length: 20 }, (_, i) => wp(20 + i * 4, 20 + i * .8))
  const { points } = autoBuild(drawn, defaultConfig, 'close')
  const route = profile(points, defaultConfig)
  for (const p of drawn) assert.ok(Math.min(...route.samples.map(s => Math.hypot(s.x - p.x, s.y - p.y))) < 1.5)
})

test('auto-build bends a drawing that cuts through the hive away from supports', () => {
  const drawn = Array.from({ length: 13 }, (_, i) => wp(30 + i * 7, 72 - HIVE.frameDepth / 2, { heading: 0 }))
  const before = profile(drawn, defaultConfig)
  assert.ok(before.supportCollision || before.unsafeSegments.length, 'fixture should collide')
  const { points, report } = autoBuild(drawn, defaultConfig)
  const after = profile(points, defaultConfig)
  assert.ok(report.clear, 'route should be clear')
  assert.equal(after.supportCollision, undefined)
  assert.equal(after.wallCollision, undefined)
})

test('best headings records a simulator reason and keeps the route clear', () => {
  const next = bestHeadings(seedWaypoints(), defaultConfig)
  assert.ok(next.slice(1).every(p => p.interpolation !== 'auto' && p.autoReason))
  assert.equal(profile(next, defaultConfig).wallCollision, undefined)
})

test('adding a control point keeps the curve shape and exports a higher-order Pedro curve', () => {
  const points = [wp(20, 20, { controlPoints: [{ x: 40, y: 60 }] }), wp(80, 30)]
  const elevated = addControlPoint(points, 0)
  assert.equal(elevated[0].controlPoints!.length, 2)
  for (const t of [.2, .5, .8]) {
    const a = bezierAt(segmentPoints(points, 0), t), b = bezierAt(segmentPoints(elevated, 0), t)
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9)
  }
  const code = generateJava(elevated, analyzePath(elevated), defaultConfig)
  assert.match(code, /Paths\.curve\(startPose,\n(\s+p\.of\([^)]*\),\n){2}\s+pose1\)/)
  assert.match(generateJava([wp(20, 20, { controlPoints: [] }), wp(60, 20)], analyzePath([wp(20, 20), wp(60, 20)])), /Paths\.line\(startPose, pose1\)/)
})
