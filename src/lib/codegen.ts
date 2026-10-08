import type { SegmentDecision, Waypoint } from '../types'
import { controls } from './geometry'

const n = (value: number) => Number(value.toFixed(2)).toString()
const point = (x: number, y: number) => `new Point(${n(x)}, ${n(y)}, Point.CARTESIAN)`

function interpolation(decision: SegmentDecision, start: Waypoint, end: Waypoint) {
  const a = `Math.toRadians(${n(start.heading)})`
  const b = `Math.toRadians(${n(end.heading)})`
  switch (decision.type) {
    case 'constant': return `.setConstantHeadingInterpolation(${a})`
    case 'tangent': return '.setTangentHeadingInterpolation()'
    case 'piecewise': return `.setHeadingInterpolation(\n                    Interpolator.piecewise()\n                        .until(0.68, Interpolator.tangent)\n                        .until(1.0, Interpolator.linear(${a}, ${b})))`
    default: return `.setLinearHeadingInterpolation(${a}, ${b})`
  }
}

export function generateJava(points: Waypoint[], decisions: SegmentDecision[]) {
  if (points.length < 2) return '// Add at least two waypoints to generate a path.'
  const start = points[0]
  const chain = decisions.map((decision, index) => {
    const a = points[index]
    const b = points[index + 1]
    const { c1, c2 } = controls(points, index)
    const geometry = decision.curvature < 3
      ? `new BezierLine(${point(a.x, a.y)}, ${point(b.x, b.y)}))`
      : `new BezierCurve(\n                    ${point(a.x, a.y)},\n                    ${point(c1.x, c1.y)},\n                    ${point(c2.x, c2.y)},\n                    ${point(b.x, b.y)}))`
    return `            .addPath(${geometry}\n            ${interpolation(decision, a, b)}`
  }).join('\n')

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
    private PathChain autoPath;

    private final Pose startPose = new Pose(
            ${n(start.x)}, ${n(start.y)}, Math.toRadians(${n(start.heading)}));

    @Override
    public void init() {
        follower = Constants.create(hardwareMap);
        follower.setStartingPose(startPose);
        autoPath = follower.pathBuilder()
${chain}
            .build();
    }

    @Override
    public void start() {
        follower.followPath(autoPath);
    }

    @Override
    public void loop() {
        follower.update();
        telemetry.addData("x", follower.getPose().getX());
        telemetry.addData("y", follower.getPose().getY());
        telemetry.update();
    }
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
