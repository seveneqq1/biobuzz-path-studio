# BIOBUZZ Path Studio

An interactive React + TypeScript route composer for the 2026–2027 FTC BIOBUZZ field. Draw or place waypoints on a Pedro-coordinate field, tune headings and cubic Bézier handles, inspect automatic interpolation choices, and export a Pedro Pathing 3 Java OpMode.

## Run locally

```bash
cd /Users/akhmetshadmat/Desktop/Code/biobuzz-path-studio
npm install
npm run dev
```

Open the localhost URL printed by Vite (usually http://localhost:5173). Keep the terminal running. Use `npm run test`, `npm run lint`, and `npm run build` to check the project.

## Features

- 144 × 144 inch BIOBUZZ field schematic with Pedro's bottom-left origin
- Freehand smoothing, waypoint placement, draggable nodes, heading handles, zoom and pan
- Constant, linear, tangent and piecewise heading optimization with per-segment explanations
- Adaptive cubic Bézier fitting that reduces waypoint count with a 0.35-inch sample error target, preserves command markers and manual interpolation boundaries, and stores the fitted handles for both drawing and Java export
- Draw-time action bindings: `1` shooter, `2` intake, `3` transfer, `4` flower intake, and hold `5` for a wait rounded to 100 ms
- Manual interpolation overrides and Bézier tension controls
- Pedro 3 `PoseFactory.degrees()`, `Paths.line/curve/path`, and Ivy command-based Java output
- Sequential actions, parallel joins with the next path, path-scoped deadlines, and optional action timeout races; instant intake and millisecond wait commands
- Live Java preview, clipboard copy and `.java` download
- Refined robotics workbench UI: edit in 2D, then run in a lazy-loaded Three.js 3D scene with orbit, robot-follow and hive cameras
- Recreated mecanum robot, triangular hive frame, paired transparent cells, flowers, perforated pollen and alliance-colored nectar; shadows and physically based materials
- Fixed-step ball gravity, rolling resistance, bounce, wall and mass-weighted ball contacts, intake, flower release, ballistic shooting, and damped hive tipping
- Cell contents preserve their actual piece type, mass and alliance color through spills, collection and re-shooting; spills leave the tilted opening's lower lip with gravity and pivot velocity, not a radial scatter
- Drive-time prediction from motor output RPM, wheel size, gearing, mass, drive force, traction, loaded speed, curvature, and rotation limits; action delays and inventory-dependent shooting give a runtime range

## Preview and calibration

Click **Run in 3D**, or **Preview 3D** to inspect without playing. **Plan 2D** returns to editing. The robot follows the same Bézier handles used by the editor and exporter. Drag to orbit, scroll to zoom, or use the **Follow robot** / **Hives** cameras. Drag floor balls while paused, or toggle intake directly to explore collection. **Robot setup** configures drive timing, inventory, shooter and alliance. Editing geometry or configuration resets playback.

By default, intake is instant and stays on until shooting or the route finishes; transfer takes the configured delay, flower intake runs for one second and releases nearby pollen, and shooting empties the hopper before the next path. Parallel actions start alongside the following uninterrupted path and join at the next command marker. Deadline actions are cancelled when that path finishes (deadline intake stays active for the entire path). A timeout races a bounded action against `waitMs()` without cancelling the drive branch. Concurrent actions on the last waypoint fall back to sequential. The Java exporter and simulator share route partitioning. The runtime range accounts for overlapping commands; shooting depends on actual collected inventory and flight/settling time.

An ideal turret aims horizontally at the raised alliance cell; automatic elevation solves a ballistic high arc when launch speed can reach it. Disable automatic elevation to explore manual angles and misses.

This is a planning simulation, not a validated digital twin or official CAD model. Robot motion follows the prescribed route; wall and hive-envelope overlaps warn rather than produce rigid-body robot responses. Hive geometry uses nominal FIRST dimensions, with approximate latch torque, inertia, damping and contact restitution. Loads use actual pollen/nectar mass; openings are swept-contact targets, with approximate cell-skin contacts. It does not adjudicate official scoring, simulate other robots, or model detailed frame collisions, drivetrain slip, jams or subsystem mechanics. Calibrate force and loaded speed from measured runs. The 3D robot is a recreated template, not your team's CAD.

## Pedro 3 + Ivy export setup

Install and tune [Pedro 3](https://pedropathing.com/docs/pathing/installation) in your FTC Android project. Install [Ivy's Pedro integration](https://pedropathing.com/docs/ivy) in `build.dependencies.gradle`:

```groovy
implementation 'com.pedropathing.ivy:pedro:1.1.1'
```

Export `BiobuzzAuto.java` into your TeamCode package. Adjust the `pedro.Constants` import to your team's actual package and initialize your subsystems in `init()`. Wire each generated start/update/completion/stop hook to hardware. Unwired start hooks deliberately throw; completion hooks deliberately return false instead of silently claiming a mechanism finished. Implement safe stop hooks before running. Shared resource identities prevent conflicts. The scheduler resets on init/stop, runs in `loop()`, and follow commands wait for the follower's complete end constraints.

The exporter targets Pedro core **3.0.0** and Ivy **1.1.1**. Linear headings use arc length. Its piecewise compatibility helper compensates for Pedro 3.0.0's child reparameterization to keep tangent headings aligned with the curve and continuous into the fixed-heading transition. Reverify this helper when upgrading the library. See [PoseFactory](https://pedropathing.com/docs/pathing/guide/pose-creation), [Paths](https://pedropathing.com/docs/pathing/reference/api), and [Ivy compositions](https://pedropathing.com/docs/ivy/command-compositions).

`npm run test:java` requires a JDK (`javac` + `jar`) and Internet access. It downloads the official Maven Central binaries and compiles three exported route variants against real Pedro/Ivy APIs. Only the FTC OpMode/telemetry and your team's Constants are compile-only stubs: this is not a complete Android build or hardware verification.

The semicircle regression checks dense bidirectional error below 0.5 inch and aligned join tangents. Tests also cover command preservation, timing, waits, parallel joins, deadline cancellation, timeout races, intake, nectar conservation, shooting, tipping/spill direction and Java generation.

The included 4096 × 4096 MeepMeep-compatible BIOBUZZ field image was created by [FTC Team Juice 16236](https://www.reddit.com/r/FTC/comments/1weleaj/biobuzz_custom_field_images_meepmeep_compatible/) and is used with the attribution requested by its creator. This asset places blue at the top and red at the bottom. Field placement was checked against the official FIRST Event Field Setup Guide. Game-piece and hive assumptions were checked against the [FIRST BIOBUZZ Competition Manual TU04](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU04.htm). Use official FIRST materials for construction measurements and rules.
