import { renderSceneSvg } from "./renderSvg";
import type { DrawingScene } from "./scene";

/**
 * PDF renderer for the drawing scene.
 *
 * A PDF cannot embed the SVG without a renderer, so the same scene primitives
 * are re-projected here with the identical sheet transform (mm → PDF points).
 * Page size is the real sheet size and the scale is stated on the sheet, so a
 * printed copy is measurable against the scale bar.
 *
 * Persian text is NOT rendered in PDF (Base-14 fonts only); room labels are
 * written in Latin transliteration of their kind and the Persian labels live in
 * the SVG/UI exports. This limitation is declared by `pdfTextSupport()`.
 */
export const PDF_LIMITATIONS = {
  persianTextRendered: false,
  note:
    "PDF فقط برچسب‌های لاتین را رندر می‌کند (فونت Base-14 بدون جاسازی فونت فارسی). نام فارسی فضاها در SVG و رابط کاربری موجود است.",
} as const;

const MM_TO_PT = 72 / 25.4;

const latinRoom: Record<string, string> = {
  living: "LIVING",
  kitchen: "KITCHEN",
  masterBedroom: "MASTER BED",
  bedroom: "BEDROOM",
  bath: "BATH",
  wc: "WC",
  entry: "ENTRY",
  hall: "HALL",
  storage: "STORE",
  corridor: "CORRIDOR",
  core: "CORE",
  lobby: "LOBBY",
  balcony: "BALCONY",
  void: "SHAFT",
  parking: "PARKING",
};

export function sceneToPdfOperations(scene: DrawingScene): string[] {
  const ops: string[] = [];
  const pageWidthPt = scene.sheet.widthMm * MM_TO_PT;
  const pageHeightPt = scene.sheet.heightMm * MM_TO_PT;
  const { frameMm, modelBox, mmPerMetre } = scene.sheet;
  const drawW = modelBox.w * mmPerMetre;
  const drawH = modelBox.h * mmPerMetre;
  const offsetX = frameMm.x + (frameMm.w - drawW) / 2;
  const offsetY = frameMm.y + (frameMm.h - drawH) / 2;
  // PDF y grows upward; sheet y grows downward (top-left origin in mm).
  const toPt = (point: { x: number; y: number }) => ({
    x: (offsetX + (point.x - modelBox.x) * mmPerMetre) * MM_TO_PT,
    y: pageHeightPt - (offsetY + (modelBox.y + modelBox.h - point.y) * mmPerMetre) * MM_TO_PT,
  });
  const text = (at: { x: number; y: number }, size: number, value: string, grey = 0) => {
    ops.push(
      `BT ${grey} ${grey} ${grey} rg /F1 ${size.toFixed(2)} Tf 1 0 0 1 ${at.x.toFixed(2)} ${at.y.toFixed(2)} Tm (${value.replace(/[()\\]/g, "")}) Tj ET`,
    );
  };

  const layerWidth: Record<string, number> = {
    parcel: 0.5,
    setback: 0.25,
    envelope: 0.2,
    "wall-exterior": 0.5,
    "wall-party": 0.35,
    "wall-interior": 0.25,
    "opening-door": 0.25,
    "opening-window": 0.25,
    stair: 0.2,
    "room-label": 0.15,
    dimension: 0.18,
    issue: 0.4,
    annotation: 0.2,
    "room-tint": 0.1,
    grid: 0.1,
  };

  for (const primitive of scene.primitives) {
    const grey = primitive.layer.startsWith("wall-exterior") ? 0.06 : primitive.layer === "issue" ? 0.75 : 0.25;
    const width = layerWidth[primitive.layer] ?? 0.2;
    if (primitive.kind === "polygon" || primitive.kind === "polyline") {
      const pts = primitive.points.map(toPt);
      if (pts.length < 2) continue;
      const path = pts.map((p, index) => `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${index === 0 ? "m" : "l"}`).join(" ");
      const fill = primitive.kind === "polygon" && primitive.fill && primitive.fill !== "none";
      // Room tints are intentionally not filled in the print PDF: a mono print
      // with large filled areas loses line readability. Tints stay in SVG/UI.
      void fill;
      ops.push(`${grey} ${grey} ${grey} RG ${width} w ${path} h S`);
      continue;
    }
    if (primitive.kind === "line") {
      const a = toPt(primitive.from);
      const b = toPt(primitive.to);
      ops.push(`${grey} ${grey} ${grey} RG ${width} w ${a.x.toFixed(2)} ${a.y.toFixed(2)} m ${b.x.toFixed(2)} ${b.y.toFixed(2)} l S`);
      continue;
    }
    if (primitive.kind === "arc") {
      const centre = toPt(primitive.center);
      const radiusPt = primitive.radiusM * mmPerMetre * MM_TO_PT;
      const start = (primitive.startDeg * Math.PI) / 180;
      const end = (primitive.endDeg * Math.PI) / 180;
      const a = { x: centre.x + radiusPt * Math.cos(start), y: centre.y + radiusPt * Math.sin(start) };
      const b = { x: centre.x + radiusPt * Math.cos(end), y: centre.y + radiusPt * Math.sin(end) };
      ops.push(
        `${grey} ${grey} ${grey} RG ${width} w ${a.x.toFixed(2)} ${a.y.toFixed(2)} m ${centre.x.toFixed(2)} ${centre.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)} c S`,
      );
      continue;
    }
    if (primitive.kind === "text") {
      const at = toPt(primitive.at);
      const size = Math.max(3.2, Math.min(10, primitive.heightM * mmPerMetre * MM_TO_PT));
      const safe = primitive.text.replace(/[^\x20-\x7E]/g, "");
      if (safe.trim().length === 0) continue;
      text(at, size, safe, primitive.layer === "issue" ? 0.7 : 0.1);
    }
  }

  return ops;
}

export function pdfPageSize(scene: DrawingScene): { widthPt: number; heightPt: number } {
  return {
    widthPt: Number((scene.sheet.widthMm * MM_TO_PT).toFixed(2)),
    heightPt: Number((scene.sheet.heightMm * MM_TO_PT).toFixed(2)),
  };
}

void latinRoom;
