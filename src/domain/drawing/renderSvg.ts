import { DRAWING_LAYERS, type DrawingScene, type Primitive } from "./scene";

/**
 * SVG renderer for the canonical drawing scene.
 *
 * The viewBox is the SHEET in millimetres (A3 = 420×297), so the exported file
 * is a true-scale sheet: measuring the rendered drawing gives the printed
 * dimensions. Model → sheet is a pure scale+translate, therefore any coordinate
 * in the SVG can be converted back to model metres exactly.
 */

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SvgRenderOptions {
  /** show the parcel/setback context (already part of the scene when enabled) */
  showTitleBlock?: boolean;
  highlightIssueIds?: string[];
}

export function sceneToSheet(scene: DrawingScene) {
  const { frameMm, modelBox, mmPerMetre } = scene.sheet;
  // Keep aspect ratio: fit the model box inside the printable frame, centred.
  const drawW = modelBox.w * mmPerMetre;
  const drawH = modelBox.h * mmPerMetre;
  const offsetX = frameMm.x + (frameMm.w - drawW) / 2;
  const offsetY = frameMm.y + (frameMm.h - drawH) / 2;
  const toSheet = (point: { x: number; y: number }) => ({
    // sheet Y grows downward, model Y grows north (up) → flip
    x: offsetX + (point.x - modelBox.x) * mmPerMetre,
    y: offsetY + (modelBox.y + modelBox.h - point.y) * mmPerMetre,
  });
  const toModel = (point: { x: number; y: number }) => ({
    x: modelBox.x + (point.x - offsetX) / mmPerMetre,
    y: modelBox.y + modelBox.h - (point.y - offsetY) / mmPerMetre,
  });
  return { toSheet, toModel, drawW, drawH, offsetX, offsetY };
}

function textSizeMm(scene: DrawingScene, heightM: number): number {
  const mm = heightM * scene.sheet.mmPerMetre;
  return Math.max(1.6, Math.min(6, mm));
}

function primitiveSvg(scene: DrawingScene, primitive: Primitive, toSheet: (p: { x: number; y: number }) => { x: number; y: number }): string {
  const layer = DRAWING_LAYERS.find((entry) => entry.id === primitive.layer);
  const stroke = layer?.color ?? "#0f172a";
  const widthMm = layer?.lineWidthMm ?? 0.2;
  switch (primitive.kind) {
    case "polygon": {
      const points = primitive.points.map((p) => {
        const s = toSheet(p);
        return `${s.x.toFixed(3)},${s.y.toFixed(3)}`;
      });
      const fill = primitive.fill ?? "none";
      const opacity = primitive.fillOpacity ?? 1;
      const dash = primitive.dashed ? ` stroke-dasharray="${(widthMm * 4).toFixed(2)} ${(widthMm * 2.5).toFixed(2)}"` : "";
      return `<polygon points="${points.join(" ")}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${widthMm}"${dash} data-id="${esc(primitive.id)}"/>`;
    }
    case "polyline": {
      const points = primitive.points.map((p) => {
        const s = toSheet(p);
        return `${s.x.toFixed(3)},${s.y.toFixed(3)}`;
      });
      const dash = primitive.dashed ? ` stroke-dasharray="${(widthMm * 4).toFixed(2)} ${(widthMm * 2.5).toFixed(2)}"` : "";
      return `<polyline points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${widthMm}"${dash} data-id="${esc(primitive.id)}"/>`;
    }
    case "line": {
      const a = toSheet(primitive.from);
      const b = toSheet(primitive.to);
      const dash = primitive.dashed ? ` stroke-dasharray="${(widthMm * 4).toFixed(2)} ${(widthMm * 2.5).toFixed(2)}"` : "";
      return `<line x1="${a.x.toFixed(3)}" y1="${a.y.toFixed(3)}" x2="${b.x.toFixed(3)}" y2="${b.y.toFixed(3)}" stroke="${stroke}" stroke-width="${widthMm}"${dash} data-id="${esc(primitive.id)}"/>`;
    }
    case "arc": {
      const c = toSheet(primitive.center);
      const r = primitive.radiusM * scene.sheet.mmPerMetre;
      const start = (primitive.startDeg * Math.PI) / 180;
      const end = (primitive.endDeg * Math.PI) / 180;
      // model Y is flipped on the sheet, so sweep the other way
      const p1 = { x: c.x + r * Math.cos(start), y: c.y - r * Math.sin(start) };
      const p2 = { x: c.x + r * Math.cos(end), y: c.y - r * Math.sin(end) };
      const sweep = primitive.endDeg > primitive.startDeg ? 0 : 1;
      return `<path d="M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 ${sweep} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}" fill="none" stroke="${stroke}" stroke-width="${widthMm}" stroke-dasharray="${(widthMm * 3).toFixed(2)} ${(widthMm * 2).toFixed(2)}" data-id="${esc(primitive.id)}"/>`;
    }
    case "text": {
      const at = toSheet(primitive.at);
      const size = textSizeMm(scene, primitive.heightM);
      const anchor = primitive.anchor === "middle" ? "middle" : primitive.anchor === "end" ? "end" : "start";
      const rotate = primitive.rotateDeg ? ` transform="rotate(${primitive.rotateDeg} ${at.x.toFixed(3)} ${at.y.toFixed(3)})"` : "";
      const weight = primitive.bold ? ' font-weight="700"' : "";
      return `<text x="${at.x.toFixed(3)}" y="${at.y.toFixed(3)}" font-size="${size.toFixed(2)}" text-anchor="${anchor}" fill="${primitive.layer === "issue" ? "#be123c" : stroke}"${rotate}${weight} data-id="${esc(primitive.id)}">${esc(primitive.text)}</text>`;
    }
    default:
      return "";
  }
}

function northArrow(scene: DrawingScene): string {
  const { widthMm, heightMm, marginMm } = scene.sheet;
  const x = widthMm - marginMm - 16;
  const y = marginMm + 16;
  return [
    `<g id="layer-annotation" data-layer="annotation">`,
    `<circle cx="${x}" cy="${y}" r="7.5" fill="#ffffff" stroke="#0f172a" stroke-width="0.3"/>`,
    `<line x1="${x}" y1="${y + 5.4}" x2="${x}" y2="${y - 5.4}" stroke="#0f172a" stroke-width="0.4"/>`,
    `<polygon points="${x - 1.9},${y - 2.0} ${x + 1.9},${y - 2.0} ${x},${y - 6.2}" fill="#0f172a"/>`,
    `<text x="${x}" y="${y + 9.6}" font-size="3" text-anchor="middle" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif">N</text>`,
    `</g>`,
  ].join("");
}

function scaleBar(scene: DrawingScene): string {
  const { frameMm, mmPerMetre, scaleDenominator } = scene.sheet;
  const metres = mmPerMetre > 0 ? Math.min(10, Math.max(1, Math.round(40 / mmPerMetre))) : 5;
  const lengthMm = metres * mmPerMetre;
  const x = frameMm.x;
  const y = scene.sheet.heightMm - scene.sheet.marginMm - 6;
  const segments = 4;
  const partMm = lengthMm / segments;
  const rects: string[] = [];
  for (let i = 0; i < segments; i++) {
    rects.push(
      `<rect x="${(x + i * partMm).toFixed(2)}" y="${(y - 1.4).toFixed(2)}" width="${partMm.toFixed(2)}" height="1.4" fill="${i % 2 === 0 ? "#0f172a" : "#ffffff"}" stroke="#0f172a" stroke-width="0.15"/>`,
    );
  }
  return [
    `<g id="layer-annotation" data-layer="annotation">`,
    ...rects,
    `<text x="${(x + lengthMm).toFixed(2)}" y="${(y + 3.6).toFixed(2)}" font-size="2.8" text-anchor="end" fill="#0f172a">${metres} m</text>`,
    `<text x="${x.toFixed(2)}" y="${(y + 3.6).toFixed(2)}" font-size="2.8" fill="#0f172a">0</text>`,
    `<text x="${(x + lengthMm / 2).toFixed(2)}" y="${(y - 2.6).toFixed(2)}" font-size="2.8" text-anchor="middle" fill="#334155">مقیاس ۱:${scaleDenominator}</text>`,
    `</g>`,
  ].join("");
}

function titleBlock(scene: DrawingScene): string {
  const { titleBlock: block, scaleDenominator, format, widthMm } = scene.sheet;
  const rows = [
    [`HERMICAD — ${scene.kind === "site-plan" ? "پلان زمین" : `پلان طبقه ${scene.levelName}`}`, scene.schemeCode],
    [`مقیاس ۱:${scaleDenominator} · برگ ${format} · واحد: متر`, `موتور: ${scene.engineVersion}`],
    [`مساحت زمین ${scene.meta.plotAreaM2.toFixed(1)} m² · سطح اشغال ${scene.meta.plateAreaM2.toFixed(1)} m²`, `${scene.meta.wallCount} دیوار · ${scene.meta.openingCount} بازشو`],
    [scene.readiness.label, "عقب‌نشینی: سطح خارجی دیوار"],
  ];
  const parts = [
    `<g id="layer-annotation" data-layer="annotation">`,
    `<rect x="${block.x}" y="${block.y}" width="${block.w}" height="${block.h}" fill="#ffffff" stroke="#0f172a" stroke-width="0.4"/>`,
    `<line x1="${block.x}" y1="${block.y + block.h / 2}" x2="${block.x + block.w}" y2="${block.y + block.h / 2}" stroke="#94a3b8" stroke-width="0.2"/>`,
    `<line x1="${block.x + block.w * 0.62}" y1="${block.y}" x2="${block.x + block.w * 0.62}" y2="${block.y + block.h}" stroke="#94a3b8" stroke-width="0.2"/>`,
  ];
  rows.forEach((row, index) => {
    const y = block.y + 8 + index * 10;
    const right = block.x + block.w - 3;
    const left = block.x + block.w * 0.62 - 3;
    parts.push(`<text x="${right}" y="${y}" font-size="3.2" text-anchor="end" fill="#0f172a" ${index === 0 ? 'font-weight="700"' : ""}>${esc(row[0])}</text>`);
    parts.push(`<text x="${left}" y="${y}" font-size="2.8" text-anchor="end" fill="#334155">${esc(row[1])}</text>`);
  });
  // disclaimer strip
  parts.push(
    `<text x="${widthMm - scene.sheet.marginMm}" y="${scene.sheet.heightMm - scene.sheet.marginMm + 0.2}" font-size="2.3" text-anchor="end" fill="#b91c1c">${esc(scene.readiness.disclaimer)}</text>`,
  );
  parts.push(`</g>`);
  return parts.join("");
}

export function renderSceneSvg(scene: DrawingScene, options: SvgRenderOptions = {}): string {
  const { toSheet } = sceneToSheet(scene);
  const byLayer = new Map<string, string[]>();
  for (const primitive of scene.primitives) {
    const svg = primitiveSvg(scene, primitive, toSheet);
    if (!svg) continue;
    const list = byLayer.get(primitive.layer) ?? [];
    list.push(svg);
    byLayer.set(primitive.layer, list);
  }
  const layerGroups: string[] = [];
  for (const layer of DRAWING_LAYERS) {
    const content = byLayer.get(layer.id);
    if (!content || content.length === 0) continue;
    layerGroups.push(
      `<g id="layer-${layer.id}" data-layer="${layer.id}" style="${layer.defaultVisible ? "" : "display:none"}">${content.join("")}</g>`,
    );
  }
  const highlight = options.highlightIssueIds ?? [];
  const highlightGroup =
    highlight.length > 0
      ? `<g id="layer-highlight" data-layer="issue">${scene.issues
          .filter((issue) => highlight.includes(issue.id))
          .map((issue) => {
            const at = toSheet(issue.at);
            return `<circle cx="${at.x.toFixed(2)}" cy="${at.y.toFixed(2)}" r="7" fill="none" stroke="#e11d48" stroke-width="0.8"/>`;
          })
          .join("")}</g>`
      : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.sheet.widthMm}mm" height="${scene.sheet.heightMm}mm" viewBox="0 0 ${scene.sheet.widthMm} ${scene.sheet.heightMm}" font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl" role="img" aria-label="${esc(`نقشه ${scene.schemeCode} ${scene.levelName}`)}" data-sheet-format="${scene.sheet.format}" data-scale="${scene.sheet.scaleDenominator}" data-mm-per-metre="${scene.sheet.mmPerMetre.toFixed(4)}" data-level-index="${scene.levelIndex}">`,
    `<rect x="0" y="0" width="${scene.sheet.widthMm}" height="${scene.sheet.heightMm}" fill="#ffffff"/>`,
    `<rect x="${scene.sheet.frameMm.x}" y="${scene.sheet.frameMm.y}" width="${scene.sheet.frameMm.w}" height="${scene.sheet.frameMm.h}" fill="none" stroke="#cbd5e1" stroke-width="0.25"/>`,
    ...(options.showTitleBlock === false ? [] : [titleBlock(scene)]),
    ...layerGroups,
    highlightGroup,
    northArrow(scene),
    scaleBar(scene),
    `<text x="${scene.sheet.widthMm - scene.sheet.marginMm}" y="${scene.sheet.marginMm + 34}" font-size="3" text-anchor="end" fill="#334155">واحد نقشه: متر · ابعاد به متر</text>`,
    `</svg>`,
  ].join("\n");
}
