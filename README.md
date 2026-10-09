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
- Sequential Pedro Pathing 3 Java state-machine output that waits for each subsystem action before continuing
- Live Java preview, clipboard copy and `.java` download
- Robot PNG preview with play/pause, reset, and playback speed controls
- Fixed-step ball gravity, floor friction, bounce, wall and ball contacts, latched intake, flower release, shooting, and animated hive tipping
- Drive-time prediction from motor output RPM, wheel size, gearing, mass, drive force, traction, loaded speed, curvature, and rotation limits; action delays and inventory-dependent shooting give a runtime range

## Preview and calibration

Click **Robot preview**, then **Play**. The robot follows the same Bézier handles used by the editor and exporter. Add commands in the waypoint inspector or with the draw-time keys above. Drag floor balls while paused, or toggle intake directly to explore collection. Open the sliders button beside playback to configure the robot and alliance.

The model assumes intake stays on after its command, transfer takes the configured delay, flower intake releases nearby pollen, and shooting empties the hopper before the next path. An ideal turret aims horizontally at the raised alliance cell; automatic elevation solves a ballistic high arc when the launch speed can reach it. Disable automatic elevation to experiment with the manual angle and missed shots.

This is a planning simulation with simplified contacts and hive geometry. Robot motion follows the prescribed route; wall and hive-envelope overlaps produce warnings rather than rigid-body collision responses. The hive uses pollen-equivalent load (three preloaded nectar equal five pollen); a tipped cell spills its load as pollen. It does not adjudicate official scoring, simulate other robots, or model detailed drivetrain/slip/subsystem mechanics. Calibrate drive force and loaded speed from measured runs. Generated Java subsystem hooks must be connected to your team's hardware and completion checks.

The semicircle regression checks dense bidirectional geometric error below 0.5 inch and aligned join tangents. Tests also cover command preservation, motion timing, intake, waits, shooting, and hive tipping.

The included 4096 × 4096 MeepMeep-compatible BIOBUZZ field image was created by [FTC Team Juice 16236](https://www.reddit.com/r/FTC/comments/1weleaj/biobuzz_custom_field_images_meepmeep_compatible/) and is used with the attribution requested by its creator. This asset places blue at the top and red at the bottom. Field placement was checked against the official FIRST Event Field Setup Guide. Game-piece and hive assumptions were checked against the [FIRST BIOBUZZ Competition Manual TU04](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU04.htm). Use official FIRST materials for construction measurements and rules.
