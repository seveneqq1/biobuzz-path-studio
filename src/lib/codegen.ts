import type { PathAction, SegmentDecision, Waypoint } from '../types'
import { controls } from './geometry'
import { compileRoute } from './route'

const n = (value: number) => Number(value.toFixed(3)).toString()
const poseName = (index: number) => index === 0 ? 'startPose' : `pose${index}`
const milliseconds = (value: number | undefined, fallback = 100) => Math.max(100, Math.round((value ?? fallback) / 100) * 100)

function interpolation(decision: SegmentDecision, start: number, end: number, points: Waypoint[]) {
  switch (decision.type) {
    case 'constant': return `.constant(${poseName(start)})`
    case 'tangent': return '.tangent()'
    case 'piecewise': return `.heading(smoothPiecewise(Math.toRadians(${n(points[end].heading)})))`
    default: return `.linear(${poseName(start)}, ${poseName(end)})`
  }
}

export function generateJava(points: Waypoint[], decisions: SegmentDecision[]) {
  if (points.length < 2) return '// Add at least two waypoints to generate a path.'
  const route = compileRoute(points)
  const paths = route.flatMap(step => step.kind === 'path' ? [step] : step.kind === 'group' ? [step.path] : [])
  const actions = points.flatMap(point => point.action ? [point.action] : [])
  const used = new Set(actions.map(action => action.type))
  const fields = points.map((point, index) => `    private final Pose ${poseName(index)} = p.of(${n(point.x)}, ${n(point.y)}, ${n(point.heading)});`).join('\n')
  const pathMethods = paths.map(item => {
    const segments = points.slice(item.startIndex, item.endIndex).map((a, offset) => {
      const index = item.startIndex + offset, b = points[index + 1], {c1, c2} = controls(points, index)
      const cross = (p: {x: number; y: number}) => Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))
      const span=(b.x-a.x)**2+(b.y-a.y)**2
      const along=(p:{x:number;y:number})=>(p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y)
      const straight = cross(c1) < 1e-8 && cross(c2) < 1e-8 && along(c1)>=0 && along(c2)<=span && along(c2)>=along(c1) && !a.curve
      const geometry = straight ? `Paths.line(${poseName(index)}, ${poseName(index + 1)})`
        : `Paths.curve(${poseName(index)}, p.of(${n(c1.x)}, ${n(c1.y)}, 0),\n                p.of(${n(c2.x)}, ${n(c2.y)}, 0), ${poseName(index + 1)})`
      return `            ${geometry}${interpolation(decisions[index], index, index + 1, points)}`
    })
    return `    private Path ${item.name}() {\n        return Paths.path(\n${segments.join(',\n')}\n        );\n    }`
  }).join('\n\n')
  const actionCode = (action: PathAction, deadline = false) => {
    const expression = action.type === 'wait' ? `waitMs(${milliseconds(action.durationMs)})`
      : action.type === 'intake' ? deadline ? 'intakeUntilCancelled()' : 'instant(this::startIntake).requiring(intakeResource)'
      : `${action.type}Command()`
    return action.timeoutMs && action.type !== 'wait' && action.type !== 'intake'
      ? `race(${expression}, waitMs(${milliseconds(action.timeoutMs)}))` : expression
  }
  const commands = route.map(step => {
    if (step.kind === 'path') return `            followPath(${step.name}())`
    if (step.kind === 'action') return `            ${actionCode(step.action)}`
    return `            ${step.mode}(followPath(${step.path.name}()), ${actionCode(step.action, step.mode === 'deadline')})`
  })
  commands.push('            instant(this::stopAllSubsystems)')
  const boundedTypes = ['shoot', 'transfer', 'flowerIntake'] as const
  const commandsMethods = boundedTypes.filter(type => used.has(type)).map(type => {
    const suffix = type === 'shoot' ? 'Shooter' : type === 'transfer' ? 'Transfer' : 'FlowerIntake'
    const startHook=type==='shoot' && used.has('intake') ? '() -> { stopIntake(); startShooter(); }' : `this::start${suffix}`
    return `    private Command ${type}Command() {\n        return Command.build()\n            .setStart(${startHook})\n            .setExecute(this::update${suffix})\n            .setDone(this::is${suffix}Finished)\n            .setEnd(reason -> stop${suffix}())\n            .requiring(${type === 'shoot' ? 'shooterResource, feedResource' : type === 'transfer' ? 'feedResource' : 'intakeResource'});\n    }`
  })
  if (actions.some(action => action.type === 'intake' && action.composition === 'deadline')) commandsMethods.push(`    private Command intakeUntilCancelled() {\n        return Command.build()\n            .setStart(this::startIntake)\n            .setDone(() -> false) // the following path is the deadline\n            .setEnd(reason -> stopIntake())\n            .requiring(intakeResource);\n    }`)
  const hooks = boundedTypes.filter(type => used.has(type)).map(type => {
    const suffix = type === 'shoot' ? 'Shooter' : type === 'transfer' ? 'Transfer' : 'FlowerIntake'
    return `    private void start${suffix}() {\n        throw new IllegalStateException("Wire start${suffix} to your robot hardware before running");\n    }\n    private void update${suffix}() { /* TODO: update subsystem controller / sensors */ }\n    private boolean is${suffix}Finished() { return false; /* TODO: measured completion */ }\n    private void stop${suffix}() { /* TODO: motor power zero / safe servo state */ }`
  })
  if (used.has('intake')) hooks.push(`    private void startIntake() {\n        throw new IllegalStateException("Wire startIntake to your robot hardware before running");\n    }\n    private void stopIntake() { /* TODO: motor power zero */ }`)
  const stops = [...boundedTypes.filter(type => used.has(type)).map(type => `        stop${type === 'shoot' ? 'Shooter' : type === 'transfer' ? 'Transfer' : 'FlowerIntake'}();`), ...(used.has('intake') ? ['        stopIntake();'] : [])]

  return `package org.firstinspires.ftc.teamcode;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.api.Paths;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
${decisions.some(d => d.type === 'piecewise') ? 'import com.pedropathing.paths.interpolator.Interpolator;\n' : ''}import com.pedropathing.follower.Follower;
import com.pedropathing.ivy.Command;
import com.pedropathing.ivy.Scheduler;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;

import static com.pedropathing.ivy.commands.Commands.*;
import static com.pedropathing.ivy.groups.Groups.*;
import static com.pedropathing.ivy.pedro.PedroCommands.*;

// Use the package containing YOUR Pedro 3 Constants file.
import org.firstinspires.ftc.teamcode.pedro.Constants;

// Requires Pedro 3 + Ivy (com.pedropathing.ivy:pedro:1.1.1).
// Positions are inches; PoseFactory headings are DEGREES.
// Wire the fail-fast subsystem hooks below before operating a real robot.
@Autonomous(name = "BIOBUZZ Ivy Auto")
public class BiobuzzAuto extends OpMode {
    private Follower follower;
    private Command auto;
    private final PoseFactory p = PoseFactory.degrees();
${fields}

    // Shared requirement identities; replace with your subsystem objects if desired.
    private final Object shooterResource = new Object();
    private final Object intakeResource = new Object();
    private final Object feedResource = new Object();

    @Override
    public void init() {
        Scheduler.reset();
        follower = Constants.create(hardwareMap);
        follower.setPose(startPose);
        // TODO: initialize your hardware/subsystems here.
        auto = sequential(
${commands.join(',\n')}
        );
    }

    @Override
    public void start() {
        Scheduler.schedule(auto);
    }

    @Override
    public void loop() {
        follower.update();
        Scheduler.execute();
        telemetry.addData("Auto running", Scheduler.isScheduled(auto));
        telemetry.update();
    }

    @Override
    public void stop() {
        Scheduler.reset(); // cancels groups and invokes command cleanup
        if (follower != null) follower.stop();
        stopAllSubsystems();
    }

    private Command followPath(Path route) {
        return follow(follower, route)
            // Wait for all follower end constraints, not just parametric progress.
            .setDone(() -> !follower.following())
            .requiring(follower);
    }

${pathMethods}
${decisions.some(d=>d.type==='piecewise') ? `
    // Pedro 3.0.0 reparameterizes piecewise children. Undo that remapping for
    // geometric tangent headings, and rotate by arc length after the 68% join.
    private Interpolator smoothPiecewise(double endHeading) {
        return Interpolator.piecewise()
            .until(0.68, (curve, localT) -> Interpolator.tangent.interpolate(
                curve, localT * curve.parameter(0.68)))
            .until(1.0, (curve, localT) -> {
                double join = curve.parameter(0.68);
                double actualT = join + localT * (1.0 - join);
                double progress = (curve.pathCompletion(actualT) - 0.68) / 0.32;
                double heading = Interpolator.tangent.interpolate(curve, join);
                return Interpolator.linear(heading, endHeading).interpolate(
                    curve, curve.parameter(Math.max(0, Math.min(1, progress))));
            });
    }
` : ''}
${commandsMethods.length ? '\n' + commandsMethods.join('\n\n') + '\n' : ''}
    private void stopAllSubsystems() {
${stops.length ? stops.join('\n') : '        // No subsystem actions in this route.'}
    }
${hooks.length ? '\n    // Completion predicates must be sensor-based; never return true unconditionally.\n' + hooks.join('\n\n') + '\n' : ''}}
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
