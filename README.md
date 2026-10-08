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
- Manual interpolation overrides and Bézier tension controls
- Live Pedro Pathing 3 Java preview, clipboard copy and `.java` download

The included field art is a high-resolution vector schematic based on the official 2026–2027 field layout and is intended for path planning, not construction measurements.
