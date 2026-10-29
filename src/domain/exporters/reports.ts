import { ifcGuid, stepText } from "./step";
export { ifcGuid } from "./step";
import { bbox } from "../geometry";
import { DISCLAIMER } from "../constants";
import { FORMULAS, EXTERNAL_SPEC_REFERENCES, type FormulaRecord } from "../engineering/registry";
import { normalizeScreeningScheme } from "../engineering/screening";
import { assertMethodOutputsExportable } from "../engineering/methodValidity";
import { normalizeStoredReport } from "../rules/compat";
import { buildFloorPlanScene, buildSiteScene } from "../drawing/scene";
import { renderSceneSvg } from "../drawing/renderSvg";
import { renderSceneDxf } from "../drawing/renderDxf";
import { PDF_LIMITATIONS, pdfPageSize, sceneToPdfOperations } from "../drawing/renderPdf";
import { composeArchitecturalSheet, composeElevationSheet, sheetAreaSummary } from "../drawing/sheet";
import { renderSheetPdfOps, renderSheetSvg, sheetPageGeometry } from "../drawing/renderSheet";
import { renderElevationsDxf } from "../drawing/renderElevationDxf";
import { roomCode, schemeDxf, sitePlanSvg } from "./vector";
import type { CanonicalScheme, ExportResult, Level, Rect, ValidationReport, Vec2 } from "../types";

/* ------------------------------------------------------------------ PDF ---- */

class PdfPage {
  ops: string[] = [];
}

const BASIS_FORMULA_IDS = [
  "GEO-SHOELACE",
  "GEO-SETBACK-HALFPLANE",
  "GEO-INSCRIBED-RECT",
  "STRUCT-GRID",
  "STRUCT-AXIAL-SCREEN",
  "STRUCT-BEAM-DEPTH",
  "STRUCT-SLAB-DEPTH",
  "STRUCT-SEISMIC-CW",
  "STRUCT-FOOTING-SCREEN",
  "MEP-WATER-DEMAND",
  "MEP-PIPE-FLOW",
  "MEP-ELECTRICAL-DEMAND",
  "PARKING-BRUTE-AREA",
  "CIRC-TRAVEL-LOWERBOUND",
  "DAYLIGHT-PROXY",
  "COST-RELATIVE-INDEX",
];

function basisRecords(): FormulaRecord[] {
  return BASIS_FORMULA_IDS.map((id) => FORMULAS[id]).filter((f): f is FormulaRecord => !!f);
}

const ADVISORY_CLAIM =
  "ADVISORY ONLY - compliance and safety are NOT established. Thresholds are internal or project-supplied; the code set is unverified.";

function ascii(input: string): string {
  return input.replace(/[^\x20-\x7E]/g, "?");
}

function esc(input: string): string {
  return ascii(input).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function text(page: PdfPage, x: number, y: number, size: number, value: string, opts: { bold?: boolean; color?: [number, number, number]; align?: "left" | "right" } = {}) {
  const font = opts.bold ? "/F2" : "/F1";
  const width = value.length * size * 0.5;
  const px = opts.align === "right" ? x - width : x;
  const [r, g, b] = opts.color ?? [0.08, 0.12, 0.18];
  page.ops.push(`BT ${r} ${g} ${b} rg ${font} ${size} Tf 1 0 0 1 ${px.toFixed(2)} ${y.toFixed(2)} Tm (${esc(value)}) Tj ET`);
}

function line(page: PdfPage, x1: number, y1: number, x2: number, y2: number, width = 0.6, color: [number, number, number] = [0.35, 0.42, 0.52]) {
  page.ops.push(`${color[0]} ${color[1]} ${color[2]} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
}

function poly(page: PdfPage, points: Vec2[], opts: { fill?: [number, number, number]; stroke?: [number, number, number]; width?: number } = {}) {
  if (points.length < 3) return;
  const path = points.map((p, i) => `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${i === 0 ? "m" : "l"}`).join(" ");
  if (opts.fill) page.ops.push(`${opts.fill[0]} ${opts.fill[1]} ${opts.fill[2]} rg ${path} h f`);
  if (opts.stroke) page.ops.push(`${opts.stroke[0]} ${opts.stroke[1]} ${opts.stroke[2]} RG 0.7 w ${path} h S`);
}

function tableRow(page: PdfPage, y: number, cells: string[], x: number, widths: number[], size = 8) {
  let cx = x;
  cells.forEach((cell, i) => {
    text(page, cx, y, size, cell, { bold: i === 0 });
    cx += widths[i];
  });
  line(page, x, y - 4, x + widths.reduce((s, w) => s + w, 0), y - 4, 0.25, [0.8, 0.85, 0.9]);
}

/**
 * Single-page PDF builder for composed sheets: page size is passed in points so
 * an A1/A2 sheet keeps its true physical size.
 */
function buildSheetPdf(title: string, geometry: { widthPt: number; heightPt: number }, ops: string[]): Buffer {
  const objects: string[] = [];
  const content = ops.join("\n");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[5] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  objects[6] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Math.round(geometry.widthPt)} ${Math.round(geometry.heightPt)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 5 0 R >>`;
  objects[2] = "<< /Type /Pages /Kids [6 0 R] /Count 1 >>";
  objects[7] = `<< /Title (${title.replace(/[^\x20-\x7E]/g, "")}) /Creator (HERMICAD) >>`;
  objects[8] = "<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R >>";
  void objects[8];
  let out = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets: number[] = [];
  for (let i = 1; i <= 7; i++) {
    const body = objects[i];
    if (!body) continue;
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${body}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out, "latin1");
  out += `xref\n0 8\n0000000000 65535 f \n`;
  for (let i = 1; i <= 7; i++) out += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

function buildPdf(pages: PdfPage[]): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font regular, 4 font bold
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  let id = 5;
  for (const page of pages) {
    const content = page.ops.join("\n");
    const contentId = id++;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    const pageId = id++;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1191 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    const body = objects[i];
    if (!body) continue;
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${body}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    const offset = offsets[i] ?? 0;
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

function mapWorld(rect: Rect, box: { x: number; y: number; w: number; h: number }) {
  const scale = Math.min(rect.w / Math.max(1, box.w), rect.h / Math.max(1, box.h));
  const offsetX = rect.x + (rect.w - box.w * scale) / 2;
  const offsetY = rect.y + (rect.h - box.h * scale) / 2;
  return (p: Vec2): Vec2 => ({
    x: offsetX + (p.x - box.x) * scale,
    y: offsetY + (box.y + box.h - p.y) * scale,
  });
}

function drawLevel(page: PdfPage, scheme: CanonicalScheme, level: Level, rect: Rect) {
  const all = level.plateRects.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
  const box = bbox(all);
  const map = mapWorld(rect, { x: box.x - 2, y: box.y - 2, w: box.w + 6, h: box.h + 6 });
  for (const plate of level.plateRects) {
    const pts = [
      { x: plate.x, y: plate.y },
      { x: plate.x + plate.w, y: plate.y },
      { x: plate.x + plate.w, y: plate.y + plate.h },
      { x: plate.x, y: plate.y + plate.h },
    ].map(map);
    poly(page, pts, { fill: [0.93, 0.95, 0.97], stroke: [0.1, 0.15, 0.2], width: 1 });
  }
  for (const room of level.rooms) {
    const pts = room.polygon.map(map);
    const fill: [number, number, number] = room.habitable ? [0.72, 0.87, 0.94] : room.kind === "core" ? [0.95, 0.75, 0.82] : [0.88, 0.9, 0.93];
    poly(page, pts, { fill, stroke: [0.25, 0.31, 0.38], width: 0.5 });
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (room.areaM2 > 3) {
      text(page, cx - 9, cy + 1, 5.5, roomCode(room));
      text(page, cx - 9, cy - 6, 5, `${room.areaM2.toFixed(1)} m2`);
    }
  }
  for (const corridor of level.corridors) {
    const pts = [
      { x: corridor.x, y: corridor.y },
      { x: corridor.x + corridor.w, y: corridor.y },
      { x: corridor.x + corridor.w, y: corridor.y + corridor.h },
      { x: corridor.x, y: corridor.y + corridor.h },
    ].map(map);
    poly(page, pts, { fill: [0.6, 0.66, 0.74], stroke: [0.2, 0.25, 0.3], width: 0.5 });
  }
  // Wall bands and openings so the printed plan is not a room-block diagram.
  const walls = level.walls ?? [];
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const nx = (-dy / len) * (wall.thicknessM / 2);
    const ny = (dx / len) * (wall.thicknessM / 2);
    const band = [
      { x: wall.start.x + nx, y: wall.start.y + ny },
      { x: wall.end.x + nx, y: wall.end.y + ny },
      { x: wall.end.x - nx, y: wall.end.y - ny },
      { x: wall.start.x - nx, y: wall.start.y - ny },
    ].map(map);
    const shade: [number, number, number] = wall.kind === "exterior" ? [0.12, 0.16, 0.24] : wall.kind === "shaft" ? [0.45, 0.2, 0.6] : [0.3, 0.36, 0.44];
    poly(page, band, { fill: shade, stroke: [0.05, 0.05, 0.05], width: 0.4 });
  }
  for (const opening of level.openings ?? []) {
    const wall = walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) continue;
    const alongX = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
    const half = opening.widthM / 2;
    const t = wall.thicknessM / 2 + 0.02;
    const gap = alongX
      ? [
          { x: opening.center.x - half, y: opening.center.y - t },
          { x: opening.center.x + half, y: opening.center.y - t },
          { x: opening.center.x + half, y: opening.center.y + t },
          { x: opening.center.x - half, y: opening.center.y + t },
        ]
      : [
          { x: opening.center.x - t, y: opening.center.y - half },
          { x: opening.center.x + t, y: opening.center.y - half },
          { x: opening.center.x + t, y: opening.center.y + half },
          { x: opening.center.x - t, y: opening.center.y + half },
        ];
    poly(page, gap.map(map), { fill: [1, 1, 1], stroke: [0.6, 0.6, 0.6], width: 0.3 });
    const centre = map(opening.center);
    text(
      page,
      centre.x - 8,
      centre.y - 6,
      4.6,
      `${opening.kind === "window" ? "W" : "D"}${opening.widthM.toFixed(2)}`,
      { color: opening.kind === "window" ? [0.02, 0.35, 0.6] : [0.45, 0.18, 0.05] },
    );
  }
  // Overall dimensions
  for (const dim of level.dimensions ?? []) {
    const a = map(dim.start);
    const b = map(dim.end);
    const horizontal = Math.abs(dim.start.y - dim.end.y) < Math.abs(dim.start.x - dim.end.x);
    const ox = horizontal ? 0 : dim.offsetM;
    const oy = horizontal ? dim.offsetM : 0;
    line(page, a.x + ox, a.y + oy, b.x + ox, b.y + oy, 0.4, [0.15, 0.15, 0.15]);
    text(page, (a.x + b.x) / 2 + ox - 6, (a.y + b.y) / 2 + oy - 4, 4.8, `${dim.valueM.toFixed(2)}m`, { color: [0.1, 0.1, 0.1] });
  }
  const sx = rect.x + 8;
  const sy = rect.y + 8;
  line(page, sx, sy, sx + 40, sy, 1, [0.1, 0.1, 0.1]);
  text(page, sx + 44, sy - 3, 7, "scale reference (10 m at plan scale is schematic)");
}

export function schemePdf(scheme: CanonicalScheme, report: ValidationReport): Buffer {
  scheme = normalizeScreeningScheme(scheme);
  assertMethodOutputsExportable(scheme);
  report = normalizeStoredReport(report, scheme) ?? report;
  const pages: PdfPage[] = [];
  // Built once: the plan sheet, its metadata and the cover facts all read it.
  const planScene = buildFloorPlanScene(scheme, 0, { includeSiteContext: true });
  const far = scheme.grossFloorAreaM2 / Math.max(1, scheme.plotAreaM2);

  // Cover
  const cover = new PdfPage();
  cover.ops.push("0.05 0.09 0.14 rg 0 0 1191 842 re f");
  text(cover, 60, 742, 34, "HERMICAD", { bold: true, color: [0.85, 0.95, 1] });
  text(cover, 60, 716, 12, "AUTONOMOUS BUILDING-ENGINEERING INTELLIGENCE - ENGINEERING REPORT", { color: [0.55, 0.7, 0.8] });
  line(cover, 60, 700, 700, 700, 1, [0.2, 0.4, 0.5]);
  text(cover, 60, 660, 20, `SCHEME ${scheme.code}`, { bold: true, color: [1, 1, 1] });
  text(cover, 60, 636, 11, `STRATEGY ${scheme.strategy.toUpperCase()}`, { color: [0.7, 0.85, 0.9] });
  text(cover, 60, 620, 10, `ENGINE ${scheme.engineVersion}  |  SEED ${scheme.seed}  |  GENERATED ${scheme.generatedAt}`, { color: [0.6, 0.72, 0.8] });
  const facts = [
    ["Plot area", `${scheme.plotAreaM2} m2`],
    ["Buildable area after setbacks", `${scheme.buildableAreaM2} m2`],
    ["Footprint", `${scheme.footprintAreaM2} m2`],
    ["Gross floor area", `${scheme.grossFloorAreaM2} m2`],
    ["FAR", far.toFixed(2)],
    ["Floors x units/floor", `${scheme.floors} x ${scheme.unitsPerFloor}`],
    ["Dwellings delivered / requested", `${scheme.unitsTotal} / ${scheme.requirements.dwellings.reduce((s, d) => s + d.count, 0)}`],
    ["Parking provided / required", `${scheme.parking.providedStalls} / ${scheme.parking.requiredStalls}`],
    ["Seismic base shear", scheme.structural.seismicBaseShearKN === null ? (scheme.structural.seismicScreening?.status === "outside-domain" ? "NOT CALCULATED - OUTSIDE METHOD DOMAIN" : "NOT CALCULATED - INSUFFICIENT DATA") : `${scheme.structural.seismicBaseShearKN} kN`],
    ["Transformer", `${scheme.mep.transformerKVA} kVA`],
    ["Threshold checks within / warn / outside", `${report.passed} / ${report.warnings} / ${report.failed}`],
    ["Plan sheet / scale", `${planScene.sheet.format} / 1:${planScene.sheet.scaleDenominator}`],
    ["Plan issues marked", String(planScene.issues.length)],
    ["Code set", `${report.codeSetCode} @ ${report.codeSetEdition}`],
  ];
  facts.forEach(([label, value], i) => {
    const y = 560 - i * 26;
    text(cover, 60, y, 10, label, { color: [0.65, 0.78, 0.85] });
    text(cover, 600, y, 12, value, { bold: true, color: [1, 1, 1], align: "right" });
  });
  text(cover, 60, 120, 9, "DISCLAIMER: Algorithmic output requires review and approval by a licensed engineer.", { color: [0.95, 0.75, 0.55] });
  text(cover, 60, 104, 9, "Persian labels are rendered in SVG/DXF/UI exports; this PDF uses Latin labels (no embedded Persian font).", { color: [0.6, 0.7, 0.78] });
  text(cover, 60, 88, 9, "Reproducibility is not established by seed and code-set name alone; retain inputs, engine and dependencies.", { color: [0.6, 0.7, 0.78] });
  pages.push(cover);

  // Site plan
  const sitePage = new PdfPage();
  sitePage.ops.push("1 1 1 rg 0 0 1191 842 re f");
  text(sitePage, 50, 800, 18, `SITE PLAN - ${scheme.code}`, { bold: true });
  text(sitePage, 50, 780, 9, `Boundary vertices: ${scheme.site.boundary.length} | Setbacks N/E/S/W: ${scheme.site.setbacks.north}/${scheme.site.setbacks.east}/${scheme.site.setbacks.south}/${scheme.site.setbacks.west} m | Spot levels: ${scheme.site.spotLevels.length}`);
  const siteBox = bbox(scheme.site.boundary);
  const siteMap = mapWorld({ x: 60, y: 130, w: 780, h: 610 }, { x: siteBox.x - 3, y: siteBox.y - 3, w: siteBox.w + 6, h: siteBox.h + 6 });
  poly(sitePage, scheme.site.boundary.map(siteMap), { fill: [0.9, 0.96, 0.91], stroke: [0.12, 0.4, 0.2], width: 1.2 });
  if (scheme.buildablePolygon.length >= 3) {
    poly(sitePage, scheme.buildablePolygon.map(siteMap), { stroke: [0.7, 0.4, 0.1], width: 0.8 });
  }
  for (const rect of scheme.footprintRects) {
    poly(
      sitePage,
      [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x, y: rect.y + rect.h },
      ].map(siteMap),
      { fill: [0.15, 0.22, 0.3], stroke: [0.1, 0.1, 0.1], width: 1 },
    );
  }
  scheme.site.spotLevels.forEach((p) => {
    const q = siteMap(p);
    text(sitePage, q.x, q.y, 7, p.z.toFixed(1), { color: [0.05, 0.4, 0.6] });
  });
  text(sitePage, 60, 100, 9, "Green: parcel boundary | Orange dashed: buildable region (half-plane setback clipping, conservative for concave parcels) | Dark: building footprint");
  text(sitePage, 60, 84, 9, `Slope direction ${scheme.trace[0]?.output ?? ""}`);
  pages.push(sitePage);

  // Typical floor
  const floorPage = new PdfPage();
  floorPage.ops.push("1 1 1 rg 0 0 1191 842 re f");
  text(floorPage, 50, 800, 18, `TYPICAL FLOOR - ${scheme.levels[0]?.name ?? "Level 1"}`, { bold: true });
  text(floorPage, 50, 780, 9, `Plate ${scheme.levels[0]?.plateAreaM2.toFixed(1)} m2 | Net ${scheme.levels[0]?.netAreaM2.toFixed(1)} m2 | Corridor ${scheme.levels[0]?.corridorWidthM.toFixed(1)} m | Units ${scheme.unitsPerFloor}`);
  drawLevel(floorPage, scheme, scheme.levels[0], { x: 60, y: 120, w: 1070, h: 630 });
  text(floorPage, 50, 90, 8, "Schematic plan: wall thickness and openings ARE modelled; furniture, sections and MEP routing are not. Net areas = 0.88 x gross. Dimensions are reference strings, not a construction survey.");
  const typical = scheme.levels[0];
  const stair = typical?.stair;
  if (stair) text(floorPage, 50, 80, 8, `Stair: ${stair.riserCount} risers @ ${stair.riserHeightM} m, going ${stair.goingM} m, required depth ${stair.requiredDepthM} m, available ${stair.availableDepthM} m -> ${stair.fits ? "fits" : "DOES NOT FIT"}`);
  pages.push(floorPage);

  // Construction-ready plan sheet (true scale, A3 landscape, scene-driven)
  const planPage = new PdfPage();
  planPage.ops.push("1 1 1 rg 0 0 1191 842 re f");
  for (const op of sceneToPdfOperations(planScene)) planPage.ops.push(op);
  const pageMm = pdfPageSize(planScene);
  text(
    planPage,
    30,
    24,
    8,
    `SHEET ${planScene.sheet.format} ${pageMm.widthPt}x${pageMm.heightPt} pt | SCALE 1:${planScene.sheet.scaleDenominator} | UNITS METRE | WALLS ${planScene.meta.wallCount} | OPENINGS ${planScene.meta.openingCount}`,
    { color: [0.1, 0.1, 0.1] },
  );
  text(planPage, 30, 14, 7.5, PDF_LIMITATIONS.note, { color: [0.6, 0.2, 0.1] });
  text(planPage, 30, 6, 7, `STATUS: ${planScene.readiness.label} - not a construction approval. Issues marked: ${planScene.issues.length}.`, { color: [0.7, 0.2, 0.1] });
  pages.push(planPage);

  // Validation
  const valPage = new PdfPage();
  valPage.ops.push("1 1 1 rg 0 0 1191 842 re f");
  text(valPage, 50, 800, 16, `RULE ENGINE RESULTS - ${report.codeSetCode} @ ${report.codeSetEdition}`, { bold: true });
  text(valPage, 50, 782, 9, `Iteration ${report.iteration} | Within threshold ${report.passed} | Warn ${report.warnings} | Outside ${report.failed} | Critical block: ${report.blocked ? "YES" : "NO"}`);
  const widths = [190, 60, 110, 110, 130, 180];
  tableRow(valPage, 760, ["RULE ID", "STATUS", "EVIDENCE", "OBSERVED", "REQUIRED", "EDITION"], 50, widths, 9);
  report.evaluations.slice(0, 22).forEach((e, i) => {
    tableRow(
      valPage,
      740 - i * 29,
      [
        e.ruleId,
        ({ pass: "WITHIN", fail: "OUTSIDE", warn: "WARNING", insufficient: "NO DATA", na: "N/A" } as const)[e.status],
        e.evidence,
        `${ascii(String(e.observed))} ${ascii(e.unit)}`,
        e.required === null ? "UNKNOWN" : `${ascii(String(e.required))} ${ascii(e.unit)}`,
        e.edition,
      ],
      50,
      widths,
      8,
    );
  });
  text(valPage, 50, 110, 8, "WITHIN is only a comparison with an internal or user-supplied threshold; it is not legal approval or proof of safety.");
  text(valPage, 50, 96, 8, `Critical block: ${report.blocked ? "YES" : "NOT RECORDED"}. Unevaluated: ${report.insufficient ?? 0}. Code set: ${report.codeSetVerification ?? "unverified"}. Regulatory compliance: NOT ESTABLISHED.`);
  text(valPage, 50, 82, 8, ADVISORY_CLAIM, { color: [0.7, 0.25, 0.15] });
  text(valPage, 50, 68, 7.5, `Evidence tiers: ${Object.entries(report.evidenceSummary ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(" | ")}`);
  text(valPage, 50, 56, 7.5, `Data completeness: ${(report.dataCompleteness ?? [])
    .map((d) => `${ascii(d.item)}=${d.present ? "present" : "MISSING"}`)
    .join(" | ")}`);
  pages.push(valPage);

  // Metrics
  const mPage = new PdfPage();
  mPage.ops.push("1 1 1 rg 0 0 1191 842 re f");
  text(mPage, 50, 800, 16, "QUANTITATIVE METRICS & ASSUMPTIONS", { bold: true });
  const mWidths = [320, 110, 80, 420];
  tableRow(mPage, 760, ["METRIC", "VALUE", "UNIT", "ASSUMPTION BASIS"], 50, mWidths, 9);
  scheme.metrics.slice(0, 18).forEach((m, i) => {
    tableRow(mPage, 738 - i * 25, [ascii(m.id), String(m.value), ascii(m.unit), ascii(m.id === "far" ? "gross floor area / plot area" : m.id === "efficiency" ? "net / gross" : "derived from CEM geometry")], 50, mWidths, 8);
  });
  text(mPage, 50, 232, 9, "ENGINEERING FORMULA BASIS (classification states trust level)", { bold: true });
  basisRecords().slice(0, 10).forEach((f, i) => {
    text(mPage, 50, 220 - i * 8.5, 6.8, `- ${f.id} [${f.classification}] ${ascii(f.expression).slice(0, 78)} (${ascii(f.resultUnit)})`);
  });
  text(mPage, 50, 210, 11, "MODEL ASSUMPTIONS", { bold: true });
  scheme.assumptions.slice(0, 9).forEach((a, i) => {
    text(mPage, 50, 194 - i * 9, 6.6, `- ${ascii(a.id)}: ${ascii(a.value)} ${ascii(a.unit)} | ${ascii(a.confidence)}`);
  });
  pages.push(mPage);

  return buildPdf(pages);
}

/* ------------------------------------------------------------------ CSV ---- */

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function schemeCsv(scheme: CanonicalScheme, report: ValidationReport): string {
  scheme = normalizeScreeningScheme(scheme);
  assertMethodOutputsExportable(scheme);
  report = normalizeStoredReport(report, scheme) ?? report;
  const lines: string[] = [];
  const row = (...cells: (string | number)[]) => lines.push(cells.map(csvEscape).join(","));
  row("HERMICAD EXPORT", scheme.code, scheme.strategyLabel, scheme.generatedAt);
  row("ENGINE", scheme.engineVersion, "CODE SET", `${report.codeSetCode}@${report.codeSetEdition}`);
  lines.push("");
  row("METRICS");
  row("id", "label", "value", "unit", "category");
  for (const m of scheme.metrics) row(m.id, m.label, m.value, m.unit, m.category);
  if (scheme.structural.seismicBaseShearKN === null) row("baseShear", "Seismic base shear", scheme.structural.seismicScreening?.status === "outside-domain" ? "NOT CALCULATED - OUTSIDE METHOD DOMAIN" : "NOT CALCULATED - INSUFFICIENT DATA", "kN", "structure");
  lines.push("");
  row("ROOMS (typical floor)");
  row("id", "kind", "label", "unit", "area_m2", "net_m2", "min_m2", "habitable", "facade_m", "daylight_ratio");
  for (const r of scheme.levels[0].rooms) {
    row(r.id, r.kind, r.label, r.unitIndex, r.areaM2, (r.areaM2 * 0.88).toFixed(2), r.minAreaM2, r.habitable ? "yes" : "no", r.facadeM, r.daylightFactorProxy);
  }
  lines.push("");
  row("VALIDATION");
  row("rule", "status", "severity", "evidence", "observed", "required", "unit", "message", "source", "edition", "document_title", "document_version", "document_clause", "verification", "limitations", "regulatory_compliance");
  for (const e of report.evaluations)
    row(
      e.ruleId,
      e.status,
      e.severity,
      e.evidence,
      e.observed,
      e.required ?? "",
      e.unit,
      e.message,
      e.source,
      e.edition,
      e.document?.title ?? "",
      e.document?.version ?? "",
      e.document?.clause ?? "",
      e.verification,
      e.limitations,
      "not-established",
    );
  row("REPORT_PROVENANCE", report.codeSetStatus ?? "", report.codeSetVerification ?? "", report.codeSetNote ?? "", `insufficient=${report.insufficient ?? 0}`, "regulatory_compliance=not-established");
  row("STATUS_MEANING", "pass is a threshold comparison only; it does not establish legal compliance or safety.");
  lines.push("");
  row("ASSUMPTIONS");
  row("id", "label", "value", "unit", "basis", "confidence");
  for (const a of scheme.assumptions) row(a.id, a.label, a.value, a.unit, a.basis, a.confidence);
  lines.push("");
  row("TRACE");
  row("step", "detail", "output");
  for (const t of scheme.trace) row(t.step, t.detail, t.output);
  lines.push("");
  row("ENGINEERING_BASIS");
  row("formula_id", "classification", "expression", "result_unit", "verification", "validity_domain", "limitations");
  for (const f of basisRecords())
    row(f.id, f.classification, f.expression, f.resultUnit, f.verification, f.validity.domain, f.limitations);
  row("ADVISORY", ADVISORY_CLAIM);
  row("EXTERNAL_SPEC_REFERENCES", EXTERNAL_SPEC_REFERENCES.map((r) => `${r.id} (${r.verified ? "verified-spec" : "unverified"})`).join(" ; "));
  lines.push("");
  row("DISCLAIMER", DISCLAIMER);
  return "\uFEFF" + lines.join("\n");
}

/* ----------------------------------------------------------------- XLSX ---- */

function crc32(buf: Buffer): number {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
declare namespace crc32 {
  let table: Int32Array | undefined;
}

/** ساخت آرشیو ZIP بدون فشرده‌سازی (ذخیره‌ای) — برای XLSX/DOCX داخلی. */
export function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // نام فایل UTF-8 (از جمله راهنمای فارسی)
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, file.data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(file.data.length, 20);
    dir.writeUInt32LE(file.data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + file.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

export function colName(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cellXml(value: string | number, ref: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
}

export function sheetXml(rows: (string | number)[][]): string {
  const rowsXml = rows
    .map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cellXml(cell, `${colName(c)}${r + 1}`)).join("")}</row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

export function schemeXlsx(scheme: CanonicalScheme, report: ValidationReport): Buffer {
  scheme = normalizeScreeningScheme(scheme);
  assertMethodOutputsExportable(scheme);
  report = normalizeStoredReport(report, scheme) ?? report;
  const metrics: (string | number)[][] = [
    ["HERMICAD", scheme.code, scheme.strategyLabel],
    ["Engine", scheme.engineVersion, scheme.generatedAt],
    ["Code set", report.codeSetCode, report.codeSetEdition],
    [],
    ["id", "label", "value", "unit", "direction", "category"],
    ...scheme.metrics.map((m) => [m.id, m.label, m.value, m.unit, m.better, m.category]),
    ...(scheme.structural.seismicBaseShearKN === null ? [["baseShear", "Seismic base shear", scheme.structural.seismicScreening?.status === "outside-domain" ? "NOT CALCULATED - OUTSIDE METHOD DOMAIN" : "NOT CALCULATED - INSUFFICIENT DATA", "kN", "lower", "structure"]] : []),
  ];
  const units: (string | number)[][] = [
    ["index", "type", "label", "level", "area_m2", "facade_m"],
    ...scheme.units.map((u) => [u.index, u.type, u.label, u.level, u.areaM2, u.facadeM]),
  ];
  const rooms: (string | number)[][] = [
    ["id", "kind", "label", "unit", "area_m2", "net_m2", "min_m2", "habitable", "facade_m", "daylight_ratio"],
    ...scheme.levels[0].rooms.map((r) => [r.id, r.kind, r.label, r.unitIndex, r.areaM2, Number((r.areaM2 * 0.88).toFixed(2)), r.minAreaM2, r.habitable ? "yes" : "no", r.facadeM, r.daylightFactorProxy]),
  ];
  const issues: (string | number)[][] = [
    ["rule", "status", "severity", "evidence", "observed", "required", "unit", "message", "source", "edition", "document_title", "document_version", "document_clause", "verification", "regulatory_compliance"],
    ...report.evaluations.map((e) => [
      e.ruleId,
      e.status,
      e.severity,
      e.evidence,
      e.observed,
      e.required ?? "",
      e.unit,
      e.message,
      e.source,
      e.edition,
      e.document?.title ?? "",
      e.document?.version ?? "",
      e.document?.clause ?? "",
      e.verification,
      "not-established",
    ]),
  ];
  const assumptions: (string | number)[][] = [
    ["id", "label", "value", "unit", "basis", "confidence"],
    ...scheme.assumptions.map((a) => [a.id, a.label, a.value, a.unit, a.basis, a.confidence]),
  ];
  const basis: (string | number)[][] = [
    ["ADVISORY", ADVISORY_CLAIM],
    ["STATUS_MEANING", "pass is a threshold comparison only; it does not establish legal compliance or safety."],
    ["regulatory_compliance", "not-established"],
    [],
    ["formula_id", "classification", "expression", "result_unit", "verification", "validity_domain", "limitations"],
    ...basisRecords().map((f) => [f.id, f.classification, f.expression, f.resultUnit, f.verification, f.validity.domain, f.limitations]),
    [],
    ["external_spec_id", "body", "document", "url", "verified"],
    ...EXTERNAL_SPEC_REFERENCES.map((r) => [r.id, r.body, r.document, r.url, r.verified ? "yes" : "no"]),
    [],
    ["analysis_stage", scheme.analysisStatus?.level ?? "preliminary-screening"],
    ["not_for_construction", "true"],
    ["geometry_exact", scheme.geometryStatus?.exact ? "true" : "false"],
    ["geometry_note", scheme.geometryStatus?.note ?? ""],
  ];
  const sheets = [
    { name: "Metrics", rows: metrics },
    { name: "Units", rows: units },
    { name: "Rooms", rows: rooms },
    { name: "Validation", rows: issues },
    { name: "Assumptions", rows: assumptions },
    { name: "Basis", rows: basis },
  ];
  const files: { name: string; data: Buffer }[] = [];
  files.push({
    name: "[Content_Types].xml",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
  });
  files.push({
    name: "_rels/.rels",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
  });
  files.push({
    name: "xl/workbook.xml",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
  });
  files.push({
    name: "xl/styles.xml",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`,
    ),
  });
  sheets.forEach((sheet, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(sheet.rows)) });
  });
  return zipStore(files);
}

/* ------------------------------------------------------------------ IFC ---- */

function ifcText(value: string): string {
  return stepText(value).slice(1,-1);
}

export function schemeIfc(scheme: CanonicalScheme): string {
  const code=ifcText(scheme.code);
  const lines: string[] = [];
  let id = 1;
  const next = () => id++;
  const owner = next();
  const origin = next();
  const dir = next();
  const axis = next();
  const context = next();
  const siLength = next();
  const siArea = next();
  const units = next();
  const sitePlacement = next();
  const project = next();
  const site = next();
  const building = next();
  const projectPlacement = next();
  const buildingPlacement = next();
  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push(`FILE_DESCRIPTION(('HERMICAD IFC4 spatial subset: spaces only, no walls/MEP'),'2;1');`);
  lines.push(`FILE_NAME('${code}.ifc','${new Date(scheme.generatedAt).toISOString()}',('HERMICAD'),('HERMICAD'),'HERMICAD ${scheme.engineVersion}','HERMICAD','');`);
  lines.push("FILE_SCHEMA(('IFC4'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");
  const person = next();
  const organization = next();
  const personOrg = next();
  const app = next();
  lines.push(`#${person}=IFCPERSON($,$,'HERMICAD',$,$,$,$,$);`);
  lines.push(`#${organization}=IFCORGANIZATION($,'HERMICAD',$,$,$);`);
  lines.push(`#${personOrg}=IFCPERSONANDORGANIZATION(#${person},#${organization},$);`);
  lines.push(`#${app}=IFCAPPLICATION(#${organization},'1.0','HERMICAD','HERMICAD');`);
  lines.push(`#${owner}=IFCOWNERHISTORY(#${personOrg},#${app},$,.ADDED.,0,$,$,0);`);
  lines.push(`#${origin}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`#${dir}=IFCDIRECTION((0.,0.,1.));`);
  lines.push(`#${axis}=IFCAXIS2PLACEMENT3D(#${origin},$,$);`);
  lines.push(`#${context}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axis},$);`);
  lines.push(`#${siLength}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  lines.push(`#${siArea}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  lines.push(`#${units}=IFCUNITASSIGNMENT((#${siLength},#${siArea}));`);
  lines.push(`#${projectPlacement}=IFCAXIS2PLACEMENT3D(#${origin},$,$);`);
  lines.push(`#${project}=IFCPROJECT('${ifcGuid("project" + scheme.id)}',$, '${code}','HERMICAD scheme','IFC4 subset',$,$,(#${context}),#${units});`);
  lines.push(`#${sitePlacement}=IFCLOCALPLACEMENT($,#${axis});`);
  lines.push(`#${site}=IFCSITE('${ifcGuid("site" + scheme.id)}',$, 'Site','Parcel',$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$);`);
  lines.push(`#${buildingPlacement}=IFCLOCALPLACEMENT(#${sitePlacement},#${axis});`);
  lines.push(`#${building}=IFCBUILDING('${ifcGuid("building" + scheme.id)}',$, '${code}','Residential',$,#${buildingPlacement},$,$,.ELEMENT.,$,$,$);`);

  const storeys: number[] = [];
  scheme.levels.forEach((level, levelIndex) => {
    const placement = next();
    const elevation = levelIndex * scheme.floorHeightM;
    const storey = next();
    const levelPoint=next(),levelAxis=next();
    lines.push(`#${levelPoint}=IFCCARTESIANPOINT((0.,0.,${elevation.toFixed(3)}));`);
    lines.push(`#${levelAxis}=IFCAXIS2PLACEMENT3D(#${levelPoint},$,$);`);
    lines.push(`#${placement}=IFCLOCALPLACEMENT(#${buildingPlacement},#${levelAxis});`);
    lines.push(`#${storey}=IFCBUILDINGSTOREY('${ifcGuid(`storey-${scheme.id}-${levelIndex}`)}',$, '${level.name.replace(/[^\x20-\x7E]/g, "") || `L${levelIndex + 1}`}','Level ${levelIndex + 1}',$,#${placement},$,$,.ELEMENT.,${elevation.toFixed(3)});`);
    storeys.push(storey);
    const spaces: number[] = [];
    level.rooms.forEach((room, roomIndex) => {
      const xs = room.polygon.map((pt) => pt.x);
      const ys = room.polygon.map((pt) => pt.y);
      const ox = Math.min(...xs);
      const oy = Math.min(...ys);
      const pointIds = room.polygon.map((pt) => {
        const pid = next();
        lines.push(`#${pid}=IFCCARTESIANPOINT((${(pt.x - ox).toFixed(3)},${(pt.y - oy).toFixed(3)}));`);
        return pid;
      });
      const curveId = next();
      lines.push(`#${curveId}=IFCPOLYLINE((${[...pointIds,pointIds[0]].map(pid=>`#${pid}`).join(",")}));`);
      const profileId = next();
      lines.push(`#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'SPACE-${roomIndex}',#${curveId});`);
      const solidAxis = next();
      lines.push(`#${solidAxis}=IFCAXIS2PLACEMENT3D(#${origin},$,$);`);
      const solid = next();
      lines.push(`#${solid}=IFCEXTRUDEDAREASOLID(#${profileId},#${solidAxis},#${dir},${scheme.floorHeightM.toFixed(3)});`);
      const shape = next();
      lines.push(`#${shape}=IFCSHAPEREPRESENTATION(#${context},'Body','SweptSolid',(#${solid}));`);
      // IfcSpace.Representation expects IfcProductDefinitionShape, not a raw
      // IfcShapeRepresentation (IFC4 schema compliance fix).
      const productShape = next();
      lines.push(`#${productShape}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}));`);
      const roomPlacement = next();
      const localPoint = next();
      lines.push(`#${localPoint}=IFCCARTESIANPOINT((${ox.toFixed(3)},${oy.toFixed(3)},0.));`);
      const localAxis = next();
      lines.push(`#${localAxis}=IFCAXIS2PLACEMENT3D(#${localPoint},$,$);`);
      lines.push(`#${roomPlacement}=IFCLOCALPLACEMENT(#${placement},#${localAxis});`);
      const space = next();
      const predefined = "NOTDEFINED";
      lines.push(
        `#${space}=IFCSPACE('${ifcGuid(`space-${scheme.id}-${levelIndex}-${roomIndex}`)}',$, '${roomCode(room)}-${levelIndex + 1}-${roomIndex + 1}','${ifcText(room.label)}',$,#${roomPlacement},#${productShape},'${ifcText(room.label)}',.ELEMENT.,.${predefined}.,$);`,
      );
      spaces.push(space);
    });
    if (spaces.length) {
      lines.push(`#${next()}=IFCRELAGGREGATES('${ifcGuid(`rel-${scheme.id}-${levelIndex}`)}',$, 'Spaces',$,#${storey},(${spaces.map((s) => `#${s}`).join(",")}));`);
    }
  });
  lines.push(`#${next()}=IFCRELAGGREGATES('${ifcGuid("agg-building"+scheme.id)}',$,$,$,#${building},(${storeys.map((s) => `#${s}`).join(",")}));`);
  lines.push(`#${next()}=IFCRELAGGREGATES('${ifcGuid("agg-site"+scheme.id)}',$,$,$,#${site},(#${building}));`);
  lines.push(`#${next()}=IFCRELAGGREGATES('${ifcGuid("agg-project"+scheme.id)}',$,$,$,#${project},(#${site}));`);
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  return lines.join("\n");
}

/* ------------------------------------------------------------- orchestrator */

export function exportScheme(scheme: CanonicalScheme, report: ValidationReport, format: string): ExportResult {
  // حتی فراخوانی مستقیم صادرکننده هم مدل قدیمی خارج‌دامنه را به عدد قابل استفاده تبدیل نمی‌کند.
  scheme = normalizeScreeningScheme(scheme);
  assertMethodOutputsExportable(scheme);
  report = normalizeStoredReport(report, scheme) ?? report;
  const base = `${scheme.code}-${scheme.strategy}`;
  switch (format) {
    case "svg": {
      const scene = buildFloorPlanScene(scheme, 0, { includeSiteContext: true });
      return {
        filename: `${base}-plan-1-${scene.sheet.scaleDenominator}.svg`,
        mime: "image/svg+xml",
        data: Buffer.from(renderSceneSvg(scene), "utf8"),
        meta: {
          kind: "floor-plan-sheet",
          sheet: scene.sheet.format,
          scaleDenominator: scene.sheet.scaleDenominator,
          units: "metre",
          layers: scene.layers.length,
          issues: scene.issues.length,
          consistency: scene.consistency,
          readiness: scene.readiness.status,
          engine: scheme.engineVersion,
        },
      };
    }
    case "dxf": {
      const scene = buildFloorPlanScene(scheme, 0);
      return {
        filename: `${base}-plan-1-${scene.sheet.scaleDenominator}.dxf`,
        mime: "image/vnd.dxf",
        data: Buffer.from(renderSceneDxf(scene), "utf8"),
        meta: {
          layers: scene.layers.length,
          units: "metres",
          acadVersion: "AC1015",
          scaleDenominator: scene.sheet.scaleDenominator,
          note: "همه مختصات در فضای مدل بر حسب متر و برابر با مدل مرکزی است؛ مقیاس فقط در عنوان درج می‌شود.",
          engine: scheme.engineVersion,
        },
      };
    }
    case "pdf": {
      const pdfScene = buildFloorPlanScene(scheme, 0, { includeSiteContext: true });
      return {
        filename: `${base}.pdf`,
        mime: "application/pdf",
        data: schemePdf(scheme, report),
        meta: {
          pages: 6,
          planSheet: { format: pdfScene.sheet.format, scaleDenominator: pdfScene.sheet.scaleDenominator, units: "metre" },
          planIssues: pdfScene.issues.length,
          pdfText: PDF_LIMITATIONS,
          engine: scheme.engineVersion,
          codeSet: report.codeSetEdition,
        },
      };
    }
    case "sheet-svg": {
      const doc = composeArchitecturalSheet(scheme);
      const stats = sheetAreaSummary(doc);
      return {
        filename: `${base}-${doc.sheetNumber}.svg`,
        mime: "image/svg+xml",
        data: Buffer.from(renderSheetSvg(doc), "utf8"),
        meta: {
          kind: "architectural-sheet",
          sheetNumber: doc.sheetNumber,
          format: doc.format,
          widthMm: doc.widthMm,
          heightMm: doc.heightMm,
          blocks: stats.blocks,
          drawings: stats.drawings,
          tables: stats.tables,
          scales: doc.scaleSummary,
          units: "metre",
          readiness: doc.readiness.status,
          engine: scheme.engineVersion,
        },
      };
    }
    case "sheet-pdf": {
      const doc = composeArchitecturalSheet(scheme);
      const geometry = sheetPageGeometry(doc);
      const ops = renderSheetPdfOps(doc);
      return {
        filename: `${base}-${doc.sheetNumber}.pdf`,
        mime: "application/pdf",
        data: buildSheetPdf(doc.title, geometry, ops),
        meta: {
          kind: "architectural-sheet-pdf",
          sheetNumber: doc.sheetNumber,
          format: doc.format,
          pageWidthPt: geometry.widthPt,
          pageHeightPt: geometry.heightPt,
          blocks: doc.blocks.length,
          scales: doc.scaleSummary,
          pdfText: PDF_LIMITATIONS,
          engine: scheme.engineVersion,
        },
      };
    }
    case "elevations-svg": {
      const doc = composeElevationSheet(scheme);
      return {
        filename: `${base}-${doc.sheetNumber}.svg`,
        mime: "image/svg+xml",
        data: Buffer.from(renderSheetSvg(doc), "utf8"),
        meta: {
          kind: "elevation-sheet",
          sheetNumber: doc.sheetNumber,
          format: doc.format,
          views: doc.blocks.length,
          scales: doc.scaleSummary,
          units: "metre",
          readiness: doc.readiness.status,
          engine: scheme.engineVersion,
        },
      };
    }
    case "elevations-dxf": {
      const result = renderElevationsDxf(scheme);
      return {
        filename: `${base}-elevations.dxf`,
        mime: "image/vnd.dxf",
        data: Buffer.from(result.data, "utf8"),
        meta: {
          kind: "elevation-section-dxf",
          views: result.offsets.length,
          offsets: result.offsets,
          units: "metres",
          acadVersion: "AC1015",
          note: "u = بعد افقی نما، v = ارتفاع از تراز نسبی ±۰٫۰۰؛ بام/شالوده تعریف نشده‌اند.",
          engine: scheme.engineVersion,
        },
      };
    }
    case "csv":
      return {
        filename: `${base}.csv`,
        mime: "text/csv; charset=utf-8",
        data: Buffer.from(schemeCsv(scheme, report), "utf8"),
        meta: { sections: ["metrics", "rooms", "validation", "assumptions", "trace"], engine: scheme.engineVersion },
      };
    case "xlsx":
      return {
        filename: `${base}.xlsx`,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data: schemeXlsx(scheme, report),
        meta: { sheets: ["Metrics", "Units", "Rooms", "Validation", "Assumptions", "Basis"], stored: true },
      };
    case "ifc":
      return {
        filename: `${base}.ifc`,
        mime: "model/ifc",
        data: Buffer.from(schemeIfc(scheme), "utf8"),
        meta: {
          schema: "IFC4",
          scope: "spaces-only spatial subset",
          schemaValidation: "not-performed (no EXPRESS/STEP validator installed on this host)",
          structuralChecks: "syntax, reference integrity and official IfcProduct propositions only",
          engine: scheme.engineVersion,
        },
      };
    case "json":
    default:
      return {
        filename: `${base}.json`,
        mime: "application/json",
        data: Buffer.from(
          JSON.stringify(
            {
              canonicalModel: scheme,
              validation: report,
              engineeringBasis: {
                advisoryClaim: ADVISORY_CLAIM,
                analysisStage: scheme.analysisStatus?.level ?? "preliminary-screening",
                notForConstruction: true,
                formulas: basisRecords().map((f) => ({
                  id: f.id,
                  classification: f.classification,
                  expression: f.expression,
                  resultUnit: f.resultUnit,
                  verification: f.verification,
                  validity: f.validity,
                  assumptions: f.assumptions,
                  limitations: f.limitations,
                })),
                externalSpecReferences: EXTERNAL_SPEC_REFERENCES,
              },
              exportedAt: new Date().toISOString(),
              engineVersion: scheme.engineVersion,
            },
            null,
            2,
          ),
          "utf8",
        ),
        meta: { schema: "hermicad-cem-v1", engine: scheme.engineVersion },
      };
  }
}
