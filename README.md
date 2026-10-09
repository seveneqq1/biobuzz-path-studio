# SANA path

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
- Schneider-style cubic Bézier fitting with iterative Newton reparameterization and a reverse-distance overshoot check: a 0.2-inch default error target, adjustable from 0.1 to 0.5 inches. Shared tangents retain smooth semicircles/S-curves; command markers and manual interpolation boundaries survive reduction. Fitted handles are used by both rendering and export. Freehand capture now retains finer detail before optimization.
- Draw-time action bindings: `1` shooter, `2` intake, `3` transfer, `4` flower intake, and hold `5` for a wait rounded to 100 ms
- Manual interpolation overrides and Bézier tension controls
- Pedro 3 `PoseFactory.degrees()`, `Paths.line/curve/path`, and Ivy command-based Java output
- Sequential actions, parallel joins with the next path, path-scoped deadlines, and optional action timeout races; instant intake and millisecond wait commands
- Live Java preview, clipboard copy and `.java` download
- Refined robotics workbench UI: edit in 2D, then run in a lazy-loaded Three.js 3D scene with orbit, robot-follow and hive cameras
- Persistent light/dark theme toggle in the header, including inspector, settings and 3D stage
- Swept wall collision checks for the rotated square robot footprint, including pure rotation and large timesteps; invalid starts are constrained and blocked, and contact stops playback before later commands execute. Unsafe exports refuse to initialize until the route is corrected.
- Shared render/physics geometry for hive pillars, ground rails, feet, sign panels and the overhead axle. Robot support contacts stop the route; swept ball contacts rebound off the frame. Planning markers and Java initialization guards flag unsafe support clearance, while open space under the frame remains traversable where the template fits.
- Shot-aware follow camera: widens before a shooting waypoint, frames the robot, alliance hive and airborne shots (including their predicted apex), then smoothly returns to the close chase view after shooting/flight finishes. Framing accounts for portrait and landscape screens.
- Independent, rate-limited yaw/pitch turret with a turntable bearing, adjustable elevation hood and twin flywheels; alignment gates firing without changing the route's chassis headings
- Selectable gecko/silicone wheel-stack intake, front-facing collection, opposed transfer rollers and a gated indexer; queued pieces advance one at a time while preserving type/color
- Recreated mecanum robot, triangular hive frame, paired transparent cells, flowers, perforated pollen and alliance-colored nectar; shadows and physically based materials
- Fixed-step ball gravity, rolling resistance, bounce, wall and mass-weighted ball contacts, intake, flower release, ballistic shooting, and damped hive tipping
- Cell contents preserve their actual piece type, mass and alliance color through spills, collection and re-shooting; energetic spills leave the tilted opening's lower lip with gravity, pivot velocity and a decaying stop jolt. Reproducible packing/lip deflections spread pieces in a forward fan, followed by livelier floor bounces and longer rolls—not a radial explosion.
- Drive-time prediction from motor output RPM, wheel size, gearing, mass, drive force, traction, loaded speed, curvature, and rotation limits; action delays and inventory-dependent shooting give a runtime range

## Preview and calibration

Click **Run in 3D**, or **Preview 3D** to inspect without playing. **Plan 2D** returns to editing. The robot follows the same Bézier handles used by the editor and exporter. Drag to orbit, scroll to zoom, or use the **Follow robot** / **Hives** cameras. Drag floor balls while paused, or toggle intake directly to explore collection. **Robot setup** configures drive timing, inventory, shooter and alliance. Editing geometry or configuration resets playback.

By default, the intake command instantly starts the wheels and stays latched until shooting or the route finishes. Only balls entering the front mouth are collected; side/back contacts push them. Collection uses hopper capacity for the whole stored/queued inventory. Each queued piece takes the configured transfer time through the indexer. Transfer waits for that queue to empty and its configured minimum delay; flower intake runs for one second and releases nearby pollen. Shooting waits for turret yaw/pitch alignment, feeds each indexed piece, then waits for flight/settling before the next path. Parallel actions start alongside the following uninterrupted path and join at the next command marker. Deadline actions are cancelled when that path finishes (deadline intake stays active for the entire path). A timeout races a bounded action against `waitMs()` without cancelling the drive branch. Concurrent actions on the last waypoint fall back to sequential. The Java exporter and simulator share route partitioning. Runtime ranges are planning estimates, not guarantees; transferred inventory and mechanism behavior can increase them.

The independent turret aims at the raised alliance cell, with a configurable yaw motor rate and a modeled 90°/s pitch rate. Automatic elevation solves a ballistic high arc from the barrel muzzle when launch speed can reach it. Disable automatic elevation to explore manual angles and misses. The template assumes continuous turret yaw; your hardware controller must enforce encoder, cable and mechanical limits. Gecko/silicone changes the recreated tread, not an experimentally verified friction model. The transfer template is a starting architecture, not a claim that one mechanism is optimal for every robot.

This is a planning simulation, not a validated digital twin or official CAD model. Robot motion follows the prescribed route until a field wall or solid hive support blocks it; the run then stops instead of clipping or sliding to later actions. Support checks use a conservative rotated box up to the template's maximum turret height, capsules for tubes and boxes for feet/panels (the sign panel collider conservatively bounds its trapezoid). The default demo uses a clear lane around the supports. Hive-envelope overlap remains an additional dynamic-cell/height-clearance warning. Hive geometry uses nominal FIRST dimensions, with approximate latch torque, inertia, damping and contact restitution. Loads use actual pollen/nectar mass; openings are swept-contact targets, with approximate cell-skin contacts. It does not adjudicate official scoring, simulate other robots, or model exact moving robot/cell CAD contacts, drivetrain slip, jams or compliant-wheel dynamics. Calibrate force, speed and indexer delays from measured runs. The 3D robot is a recreated template, not your team's CAD. The Java clearance guards are sampled planning checks, not real-robot collision sensors or safety guarantees.

## Pedro 3 + Ivy export setup

Install and tune [Pedro 3](https://pedropathing.com/docs/pathing/installation) in your FTC Android project. Install [Ivy's Pedro integration](https://pedropathing.com/docs/ivy) in `build.dependencies.gradle`:

```groovy
implementation 'com.pedropathing.ivy:pedro:1.1.1'
```

Export `SanaAuto.java` into your TeamCode package. Adjust the `pedro.Constants` import to your team's actual package and initialize your subsystems in `init()`. Wire each generated start/update/completion/stop hook to hardware. Unwired start hooks deliberately throw; completion hooks deliberately return false instead of silently claiming a mechanism finished. Implement safe stop hooks before running. Shared resource identities prevent conflicts. The scheduler resets on init/stop, runs in `loop()`, and follow commands wait for the follower's complete end constraints. Shoot commands first aim the turret, then run shooter feeding as the deadline alongside continuous turret tracking. The feeder only advances when yaw/pitch are aligned and measured flywheel speed is ready. `startShooter` should only spin up; `updateShooter` maintains its controller; `advanceFeeder` actuates the indexer. Use break-beam/encoder feedback to finish transfers and count shots. The exported alliance, launch speed, elevation, intake material and footprint come from Robot setup; update the hive target hooks from observed cell state after tipping.

The exporter targets Pedro core **3.0.0** and Ivy **1.1.1**. Linear headings use arc length. Its piecewise compatibility helper compensates for Pedro 3.0.0's child reparameterization to keep tangent headings aligned with the curve and continuous into the fixed-heading transition. Reverify this helper when upgrading the library. See [PoseFactory](https://pedropathing.com/docs/pathing/guide/pose-creation), [Paths](https://pedropathing.com/docs/pathing/reference/api), and [Ivy compositions](https://pedropathing.com/docs/ivy/command-compositions).

`npm run test:java` requires a JDK (`javac` + `jar`) and Internet access. It downloads the official Maven Central binaries and compiles three exported route variants against real Pedro/Ivy APIs. Only the FTC OpMode/telemetry and your team's Constants are compile-only stubs: this is not a complete Android build or hardware verification.

The 39 regression tests check smooth semicircles/S-curves, bidirectional fit error, aligned join tangents, command preservation, timing, waits/compositions/timeouts, front intake and queued transfer, nectar conservation, turret gating, energetic/reproducible lower-lip spills, translation/rotation wall and support sweeps, blocked starts, large timesteps, projectile rebounds, shot-camera frustum fitting/damping, elapsed-time continuity and Java generation. The API compile check includes automatic and manual pitch, red/blue alliance targets, and both intake templates.

The included 4096 × 4096 MeepMeep-compatible BIOBUZZ field image was created by [FTC Team Juice 16236](https://www.reddit.com/r/FTC/comments/1weleaj/biobuzz_custom_field_images_meepmeep_compatible/) and is used with the attribution requested by its creator. This asset places blue at the top and red at the bottom. Field placement was checked against the official FIRST Event Field Setup Guide. Game-piece and hive assumptions were checked against the [FIRST BIOBUZZ Competition Manual TU04](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU04.htm). Use official FIRST materials for construction measurements and rules.
