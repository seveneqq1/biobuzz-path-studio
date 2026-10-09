import type { PathAction, SegmentDecision, Waypoint } from '../types'
import { controls, tangentDegrees } from './geometry'
import { cubic } from './curveFit'

const n = (value: number) => Number(value.toFixed(2)).toString()
const point = (x: number, y: number) => `new Point(${n(x)}, ${n(y)}, Point.CARTESIAN)`

function interpolation(decision: SegmentDecision, start: Waypoint, end: Waypoint, joinHeading: number) {
  const a = `Math.toRadians(${n(start.heading)})`
  const b = `Math.toRadians(${n(end.heading)})`
  switch (decision.type) {
    case 'constant': return `.setConstantHeadingInterpolation(${a})`
    case 'tangent': return '.setTangentHeadingInterpolation()'
    case 'piecewise': return `.setHeadingInterpolation(\n                    Interpolator.piecewise()\n                        .until(0.68, Interpolator.tangent)\n                        .until(1.0, Interpolator.linear(Math.toRadians(${n(joinHeading)}), ${b})))`
    default: return `.setLinearHeadingInterpolation(${a}, ${b})`
  }
}

export function generateJava(points: Waypoint[], decisions: SegmentDecision[]) {
  if (points.length < 2) return '// Add at least two waypoints to generate a path.'
  const start = points[0]

  type RouteItem = { kind: 'path'; name: string; startIndex: number; endIndex: number } | { kind: 'action'; action: PathAction }
  const route: RouteItem[] = []
  let pathStart = 0
  let pathNumber = 0
  points.forEach((waypoint, index) => {
    if (!waypoint.action) return
    if (index > pathStart) route.push({ kind: 'path', name: `path${pathNumber++}`, startIndex: pathStart, endIndex: index })
    route.push({ kind: 'action', action: waypoint.action })
    pathStart = index
  })
  if (pathStart < points.length - 1) route.push({ kind: 'path', name: `path${pathNumber++}`, startIndex: pathStart, endIndex: points.length - 1 })

  const buildChain = (startIndex: number, endIndex: number) => decisions.slice(startIndex, endIndex).map((decision, offset) => {
    const index = startIndex + offset
    const a = points[index]
    const b = points[index + 1]
    const { c1, c2 } = controls(points, index)
    const cross = (p: {x:number;y:number}) => Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))
    const straight = cross(c1)<1e-8 && cross(c2)<1e-8 && !a.curve
    const geometry = straight
      ? `new BezierLine(${point(a.x, a.y)}, ${point(b.x, b.y)}))`
      : `new BezierCurve(\n                    ${point(a.x, a.y)},\n                    ${point(c1.x, c1.y)},\n                    ${point(c2.x, c2.y)},\n                    ${point(b.x, b.y)}))`
    const joinHeading=tangentDegrees(cubic(a,c1,c2,b,.679),cubic(a,c1,c2,b,.681))
    return `            .addPath(${geometry}\n            ${interpolation(decision, a, b, joinHeading)}`
  }).join('\n')

  const pathFields = route.filter((item): item is Extract<RouteItem, { kind: 'path' }> => item.kind === 'path')
    .map(item => `    private PathChain ${item.name};`).join('\n')
  const pathBuilders = route.filter((item): item is Extract<RouteItem, { kind: 'path' }> => item.kind === 'path')
    .map(item => `        ${item.name} = follower.pathBuilder()\n${buildChain(item.startIndex, item.endIndex)}\n            .build();`).join('\n\n')

  const startAction = (action: PathAction) => {
    switch (action.type) {
      case 'shoot': return 'startShooter();'
      case 'intake': return 'startIntake();'
      case 'transfer': return 'startTransfer();'
      case 'flowerIntake': return 'startFlowerIntake();'
      case 'wait': return 'actionStartedAt = System.currentTimeMillis();'
    }
  }
  const actionFinished = (action: PathAction) => {
    switch (action.type) {
      case 'shoot': return 'isShooterFinished()'
      case 'intake': return 'isIntakeFinished()'
      case 'transfer': return 'isTransferFinished()'
      case 'flowerIntake': return 'isFlowerIntakeFinished()'
      case 'wait': return `System.currentTimeMillis() - actionStartedAt >= ${action.durationMs ?? 100}`
    }
  }
  const startCases = route.map((item, index) => `            case ${index}: ${item.kind === 'path' ? `follower.followPath(${item.name});` : startAction(item.action)} break;`).join('\n')
  const updateCases = route.map((item, index) => `            case ${index}:\n                if (${item.kind === 'path' ? '!follower.isBusy()' : actionFinished(item.action)}) advanceStep();\n                break;`).join('\n')

  return `package org.firstinspires.ftc.teamcode;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.geometry.Point;
import com.pedropathing.paths.Interpolator;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;

import org.firstinspires.ftc.teamcode.pedroPathing.Constants;

@Autonomous(name = "BIOBUZZ Auto")
public class BiobuzzAuto extends OpMode {
    private Follower follower;
${pathFields}
    private int routeStep = 0;
    private boolean stepStarted = false;
    private long actionStartedAt = 0;

    private final Pose startPose = new Pose(
            ${n(start.x)}, ${n(start.y)}, Math.toRadians(${n(start.heading)}));

    @Override
    public void init() {
        follower = Constants.create(hardwareMap);
        follower.setStartingPose(startPose);
${pathBuilders}
    }

    @Override
    public void start() {
        routeStep = 0;
        stepStarted = false;
    }

    @Override
    public void loop() {
        follower.update();

        if (!stepStarted) {
            switch (routeStep) {
${startCases}
                default: break;
            }
            stepStarted = true;
        }

        switch (routeStep) {
${updateCases}
            default: break;
        }

        telemetry.addData("x", follower.getPose().getX());
        telemetry.addData("y", follower.getPose().getY());
        telemetry.addData("route step", routeStep);
        telemetry.update();
    }

    private void advanceStep() {
        routeStep++;
        stepStarted = false;
    }

    // Connect these action hooks to your robot subsystems.
    private void startShooter() { /* TODO: command shooter */ }
    private boolean isShooterFinished() { return true; }
    private void startIntake() { /* TODO: command intake */ }
    private boolean isIntakeFinished() { return true; }
    private void startTransfer() { /* TODO: command transfer */ }
    private boolean isTransferFinished() { return true; }
    private void startFlowerIntake() { /* TODO: command flower intake */ }
    private boolean isFlowerIntakeFinished() { return true; }
}
`
}

export function downloadJava(code: string) {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/x-java' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'BiobuzzAuto.java'
  anchor.click()
  URL.revokeObjectURL(url)
}
