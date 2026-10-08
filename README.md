# BIOBUZZ Path Studio

An interactive React + TypeScript route composer for the 2026–2027 FTC BIOBUZZ field. Draw or place waypoints on a Pedro-coordinate field, tune headings and cubic Bézier handles, inspect automatic interpolation choices, and export a Pedro Pathing 3 Java OpMode.

## Run locally

```bash
npm install
npm run dev
```

## Features

- 144 × 144 inch BIOBUZZ field schematic with Pedro's bottom-left origin
- Freehand smoothing, waypoint placement, draggable nodes, heading handles, zoom and pan
- Constant, linear, tangent and piecewise heading optimization with per-segment explanations
- Fourier low-pass path optimization that reduces waypoint count while preserving command markers
- Draw-time action bindings: `1` shooter, `2` intake, `3` transfer, `4` flower intake, and hold `5` for a wait rounded to 100 ms
- Manual interpolation overrides and Bézier tension controls
- Sequential Pedro Pathing 3 Java state-machine output that waits for each subsystem action before continuing
- Live Java preview, clipboard copy and `.java` download

The included 4096 × 4096 MeepMeep-compatible BIOBUZZ field image was created by [FTC Team Juice 16236](https://www.reddit.com/r/FTC/comments/1weleaj/biobuzz_custom_field_images_meepmeep_compatible/) and is used with the attribution requested by its creator. Field placement was checked against the official FIRST Event Field Setup Guide. Use official FIRST materials—not this planning image—for construction measurements.
