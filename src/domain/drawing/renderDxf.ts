import { DRAWING_LAYERS, type DrawingScene, type Primitive } from "./scene";

/**
 * DXF (AC1015 / AutoCAD 2000) writer for the canonical drawing scene.
 *
 * Model space is written in METRES (INSUNITS = 6), so any CAD consumer sees the
 * same coordinates as the CEM. Layer names/colours mirror the scene layers.
 * Units are declared in the header; a title annotation records the scale.
 */
const LAYER_COLORS: Record<string, number> = {
  parcel: 3,
  setback: 30,
  envelope: 30,
  "wall-exterior": 7,
  "wall-party": 8,
  "wall-interior": 8,
  "opening-door": 30,
  "opening-window": 5,
  stair: 1,
  "room-tint": 4,
  "room-label": 7,
  dimension: 2,
  grid: 9,
  issue: 1,
  annotation: 6,
};

export function renderSceneDxf(scene: DrawingScene): string {
  const out: string[] = [];
  const push = (...values: (string | number)[]) => out.push(...values.map(String));

  const layers = DRAWING_LAYERS.filter((layer) => layer.id !== "room-tint" || true);

  push(0, "SECTION", 2, "HEADER");
  push(9, "$ACADVER", 1, "AC1015");
  push(9, "$INSUNITS", 70, 6); // metres
  push(9, "$MEASUREMENT", 70, 1);
  push(9, "$LUNITS", 70, 2);
  push(9, "$LUPREC", 70, 3);
  push(0, "ENDSEC");

  push(0, "SECTION", 2, "TABLES");
  push(0, "TABLE", 2, "LAYER", 70, layers.length);
  for (const layer of layers) {
    push(0, "LAYER", 2, layer.id.toUpperCase(), 70, 0, 62, LAYER_COLORS[layer.id] ?? 7, 6, "CONTINUOUS");
  }
  push(0, "ENDTAB", 0, "ENDSEC");

  push(0, "SECTION", 2, "ENTITIES");

  const layerName = (id: Primitive["layer"]) => id.toUpperCase();
  const polyline = (points: { x: number; y: number }[], layer: string, closed: boolean) => {
    push(0, "LWPOLYLINE", 8, layer, 90, points.length, 70, closed ? 1 : 0);
    for (const point of points) push(10, point.x.toFixed(4), 20, point.y.toFixed(4));
  };
  const line = (from: { x: number; y: number }, to: { x: number; y: number }, layer: string) => {
    push(0, "LINE", 8, layer, 10, from.x.toFixed(4), 20, from.y.toFixed(4), 30, 0, 11, to.x.toFixed(4), 21, to.y.toFixed(4), 31, 0);
  };
  const text = (at: { x: number; y: number }, value: string, height: number, layer = "ANNOTATION", rotation = 0) => {
    push(0, "TEXT", 8, layer, 10, at.x.toFixed(4), 20, at.y.toFixed(4), 30, 0, 40, height.toFixed(3), 1, value, 50, rotation.toFixed(2), 7, "STANDARD");
  };

  for (const primitive of scene.primitives) {
    switch (primitive.kind) {
      case "polygon":
        polyline(primitive.points, layerName(primitive.layer), true);
        break;
      case "polyline":
        polyline(primitive.points, layerName(primitive.layer), primitive.closed ?? false);
        break;
      case "line":
        line(primitive.from, primitive.to, layerName(primitive.layer));
        break;
      case "arc": {
        const start = (primitive.startDeg * Math.PI) / 180;
        const end = (primitive.endDeg * Math.PI) / 180;
        const a = { x: primitive.center.x + primitive.radiusM * Math.cos(start), y: primitive.center.y + primitive.radiusM * Math.sin(start) };
        const b = { x: primitive.center.x + primitive.radiusM * Math.cos(end), y: primitive.center.y + primitive.radiusM * Math.sin(end) };
        push(
          0, "ARC", 8, layerName(primitive.layer),
          10, primitive.center.x.toFixed(4), 20, primitive.center.y.toFixed(4), 30, 0,
          40, primitive.radiusM.toFixed(4),
          50, primitive.startDeg.toFixed(2), 51, primitive.endDeg.toFixed(2),
        );
        void a;
        void b;
        break;
      }
      case "text":
        text(primitive.at, primitive.text, Math.max(0.18, primitive.heightM), layerName(primitive.layer), primitive.rotateDeg ?? 0);
        break;
      default:
        break;
    }
  }

  // Title/metadata annotations in model space (metres).
  const box = scene.sheet.modelBox;
  const titleY = box.y + box.h + 0.6;
  text({ x: box.x, y: titleY }, `HERMICAD ${scene.schemeCode} - ${scene.levelName} - 1:${scene.sheet.scaleDenominator} - UNITS: METRE`, 0.45, "ANNOTATION");
  text(
    { x: box.x, y: titleY + 0.6 },
    `PLOT ${scene.meta.plotAreaM2.toFixed(1)} m2 | PLATE ${scene.meta.plateAreaM2.toFixed(1)} m2 | WALLS ${scene.meta.wallCount} | OPENINGS ${scene.meta.openingCount}`,
    0.32,
    "ANNOTATION",
  );
  for (const issue of scene.issues.slice(0, 12)) {
    text({ x: issue.at.x, y: issue.at.y }, `! ${issue.id}`, 0.3, "ISSUE");
  }

  push(0, "ENDSEC", 0, "EOF");
  return out.join("\r\n");
}
