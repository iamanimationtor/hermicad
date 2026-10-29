import { sceneToSheet } from "./renderSvg";
import type { DrawingScene, Primitive } from "./scene";
import { DRAWING_LAYERS } from "./scene";
import type { ComposedBlock, SheetDocument } from "./sheet";
import type { ScheduleTable } from "./tables";

/**
 * Sheet renderers (stage C). SVG and PDF share the same block placement maths so
 * the two outputs cannot drift: a block is a scene placed at (xMm, yMm) inside
 * the sheet, and the scene→mm transform comes from the scene itself.
 */

const MM_TO_PT = 72 / 25.4;

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Placed {
  x: number;
  y: number;
}

function sceneTransform(scene: DrawingScene, block: ComposedBlock) {
  const base = sceneToSheet(scene);
  const offset = scene.blockOffset ?? { xMm: 0, yMm: 0 };
  const shift = { x: block.xMm + offset.xMm, y: block.yMm + offset.yMm };
  return {
    toSheet: (point: { x: number; y: number }): Placed => {
      const local = base.toSheet(point);
      return { x: local.x + shift.x, y: local.y + shift.y };
    },
    shift,
  };
}

function primitiveSvg(scene: DrawingScene, primitive: Primitive, toSheet: (p: { x: number; y: number }) => Placed): string {
  const layer = DRAWING_LAYERS.find((entry) => entry.id === primitive.layer);
  const stroke = layer?.color ?? "#0f172a";
  const width = Math.max(0.16, layer?.lineWidthMm ?? 0.2);
  const dash = (dashed?: boolean) => (dashed ? ` stroke-dasharray="${(width * 4).toFixed(2)} ${(width * 2.5).toFixed(2)}"` : "");
  if (primitive.kind === "polygon") {
    const points = primitive.points.map((p) => {
      const s = toSheet(p);
      return `${s.x.toFixed(2)},${s.y.toFixed(2)}`;
    });
    return `<polygon points="${points.join(" ")}" fill="${primitive.fill ?? "none"}" fill-opacity="${primitive.fillOpacity ?? 1}" stroke="${stroke}" stroke-width="${width}"${dash(primitive.dashed)}/>`;
  }
  if (primitive.kind === "polyline") {
    const points = primitive.points.map((p) => {
      const s = toSheet(p);
      return `${s.x.toFixed(2)},${s.y.toFixed(2)}`;
    });
    return `<polyline points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash(primitive.dashed)}/>`;
  }
  if (primitive.kind === "line") {
    const a = toSheet(primitive.from);
    const b = toSheet(primitive.to);
    return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${stroke}" stroke-width="${width}"${dash(primitive.dashed)}/>`;
  }
  if (primitive.kind === "arc") {
    const c = toSheet(primitive.center);
    const r = primitive.radiusM * scene.sheet.mmPerMetre;
    const start = (primitive.startDeg * Math.PI) / 180;
    const end = (primitive.endDeg * Math.PI) / 180;
    const p1 = { x: c.x + r * Math.cos(start), y: c.y - r * Math.sin(start) };
    const p2 = { x: c.x + r * Math.cos(end), y: c.y - r * Math.sin(end) };
    const sweep = primitive.endDeg > primitive.startDeg ? 0 : 1;
    return `<path d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweep} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
  }
  const at = toSheet(primitive.at);
  const size = Math.max(1.5, Math.min(4.6, primitive.heightM * scene.sheet.mmPerMetre));
  const anchor = primitive.anchor === "middle" ? "middle" : primitive.anchor === "end" ? "end" : "start";
  const rotate = primitive.rotateDeg ? ` transform="rotate(${primitive.rotateDeg} ${at.x.toFixed(2)} ${at.y.toFixed(2)})"` : "";
  return `<text x="${at.x.toFixed(2)}" y="${at.y.toFixed(2)}" font-size="${size.toFixed(2)}" text-anchor="${anchor}" fill="${primitive.layer === "issue" ? "#be123c" : stroke}"${rotate}>${esc(primitive.text)}</text>`;
}

function tableSvg(table: ScheduleTable, block: ComposedBlock): string {
  const parts: string[] = [];
  const pad = 2;
  const titleH = 7;
  const headerH = 6;
  const footerH = table.totals.length > 0 ? 5 * table.totals.length + 4 : 4;
  const usableH = block.heightMm - titleH - headerH - footerH - pad;
  const rowH = Math.max(3.2, Math.min(6, usableH / Math.max(1, table.rows.length)));
  const totalW = table.columns.reduce((sum, column) => sum + column.widthMm, 0);
  const factor = (block.widthMm - pad * 2) / totalW;
  parts.push(
    `<text x="${(block.xMm + block.widthMm - pad).toFixed(2)}" y="${(block.yMm + 4.4).toFixed(2)}" font-size="3.6" text-anchor="end" font-weight="700" fill="#0f172a">${esc(table.title)}</text>`,
    `<text x="${(block.xMm + block.widthMm - pad).toFixed(2)}" y="${(block.yMm + 8).toFixed(2)}" font-size="2.5" text-anchor="end" fill="#475569">${esc(table.subtitle)}</text>`,
  );
  // header (RTL: first column at the right edge)
  let x = block.xMm + block.widthMm - pad;
  const headerY = block.yMm + titleH + pad;
  parts.push(`<rect x="${(block.xMm + pad).toFixed(2)}" y="${headerY.toFixed(2)}" width="${(block.widthMm - pad * 2).toFixed(2)}" height="${headerH.toFixed(2)}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.2"/>`);
  for (const column of table.columns) {
    const w = column.widthMm * factor;
    parts.push(
      `<text x="${(x - w / 2).toFixed(2)}" y="${(headerY + 4).toFixed(2)}" font-size="2.4" text-anchor="middle" fill="#0f172a" font-weight="700">${esc(column.label)}</text>`,
    );
    x -= w;
  }
  table.rows.forEach((row, index) => {
    const y = headerY + headerH + index * rowH;
    if (y + rowH > block.yMm + block.heightMm - footerH) return;
    if (index % 2 === 1) {
      parts.push(`<rect x="${(block.xMm + pad).toFixed(2)}" y="${y.toFixed(2)}" width="${(block.widthMm - pad * 2).toFixed(2)}" height="${rowH.toFixed(2)}" fill="#f8fafc"/>`);
    }
    let cx = block.xMm + block.widthMm - pad;
    for (const column of table.columns) {
      const w = column.widthMm * factor;
      const data = row.cells[column.key];
      const text = data?.value ?? "—";
      const fill = data?.available === false ? "#b45309" : "#0f172a";
      parts.push(
        `<text x="${(cx - w / 2).toFixed(2)}" y="${(y + rowH * 0.72).toFixed(2)}" font-size="2.15" text-anchor="middle" fill="${fill}">${esc(text.length > 30 ? `${text.slice(0, 29)}…` : text)}</text>`,
      );
      cx -= w;
    }
    parts.push(`<line x1="${(block.xMm + pad).toFixed(2)}" y1="${(y + rowH).toFixed(2)}" x2="${(block.xMm + block.widthMm - pad).toFixed(2)}" y2="${(y + rowH).toFixed(2)}" stroke="#cbd5e1" stroke-width="0.12"/>`);
  });
  let fy = block.yMm + block.heightMm - footerH + 3;
  for (const total of table.totals) {
    parts.push(
      `<text x="${(block.xMm + block.widthMm - pad).toFixed(2)}" y="${fy.toFixed(2)}" font-size="2.3" text-anchor="end" fill="#334155">${esc(`${total.label}: ${total.value}`)}</text>`,
    );
    fy += 5;
  }
  if (table.emptyReason) {
    parts.push(`<text x="${(block.xMm + block.widthMm - pad).toFixed(2)}" y="${(headerY + headerH + 6).toFixed(2)}" font-size="2.4" text-anchor="end" fill="#b45309">${esc(table.emptyReason)}</text>`);
  }
  if (table.missingFields.length > 0) {
    parts.push(
      `<text x="${(block.xMm + block.widthMm - pad).toFixed(2)}" y="${(block.yMm + block.heightMm - 1).toFixed(2)}" font-size="1.9" text-anchor="end" fill="#b45309">${esc(`در مدل موجود نیست: ${table.missingFields.join("، ")}`)}</text>`,
    );
  }
  return parts.join("");
}

function titleBlockSvg(doc: SheetDocument): string {
  const block = doc.titleBlock;
  const rows = [
    [doc.title, doc.sheetNumber],
    [`طرح ${doc.project.schemeCode} · ${doc.project.levelName}`, `مقیاس‌ها: ${doc.scaleSummary.map((entry) => `1:${entry.scaleDenominator}`).join(" · ")}`],
    [`موتور ${doc.project.engineVersion} · تاریخ ${doc.project.date}`, `برگ ${doc.format} · ${doc.widthMm}×${doc.heightMm} mm`],
    [doc.readiness.label, "واحد: متر"],
  ];
  const parts = [
    `<rect x="${block.xMm}" y="${block.yMm}" width="${block.widthMm}" height="${block.heightMm}" fill="#ffffff" stroke="#0f172a" stroke-width="0.4"/>`,
    `<line x1="${block.xMm + block.widthMm * 0.55}" y1="${block.yMm}" x2="${block.xMm + block.widthMm * 0.55}" y2="${block.yMm + block.heightMm}" stroke="#94a3b8" stroke-width="0.2"/>`,
  ];
  rows.forEach((row, index) => {
    const y = block.yMm + 7 + index * 9;
    parts.push(`<text x="${block.xMm + block.widthMm - 3}" y="${y}" font-size="3.1" text-anchor="end" fill="#0f172a"${index === 0 ? ' font-weight="700"' : ""}>${esc(row[0])}</text>`);
    parts.push(`<text x="${block.xMm + block.widthMm * 0.55 - 3}" y="${y}" font-size="2.5" text-anchor="end" fill="#334155">${esc(row[1])}</text>`);
  });
  return parts.join("");
}

export function renderSheetSvg(doc: SheetDocument): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.widthMm}mm" height="${doc.heightMm}mm" viewBox="0 0 ${doc.widthMm} ${doc.heightMm}" font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl" data-sheet="${doc.sheetNumber}" data-format="${doc.format}" data-blocks="${doc.blocks.length}">`,
    `<rect x="0" y="0" width="${doc.widthMm}" height="${doc.heightMm}" fill="#ffffff"/>`,
  );
  // sheet header
  parts.push(`<text x="${doc.widthMm - 10}" y="12" font-size="4.4" text-anchor="end" font-weight="700" fill="#0f172a">${esc(doc.title)}</text>`);
  parts.push(`<text x="${doc.widthMm - 10}" y="18" font-size="2.6" text-anchor="end" fill="#475569">${esc(`برگ ${doc.sheetNumber} · ${doc.format} · واحد متر · ${doc.blocks.length} قاب`)}</text>`);
  parts.push(`<line x1="10" y1="21" x2="${doc.widthMm - 10}" y2="21" stroke="#0f172a" stroke-width="0.4"/>`);

  for (const block of doc.blocks) {
    parts.push(`<rect x="${block.xMm}" y="${block.yMm}" width="${block.widthMm}" height="${block.heightMm}" fill="none" stroke="#cbd5e1" stroke-width="0.25"/>`);
    if (block.scene) {
      const transform = sceneTransform(block.scene, block);
      parts.push(
        `<text x="${block.xMm + block.widthMm - 2}" y="${block.yMm + 4}" font-size="2.9" text-anchor="end" font-weight="700" fill="#0f172a">${esc(block.title)}</text>`,
        `<text x="${block.xMm + block.widthMm - 2}" y="${block.yMm + 7.6}" font-size="2.3" text-anchor="end" fill="#475569">${esc(`مقیاس ۱:${block.scaleDenominator} · متر`)}</text>`,
      );
      for (const primitive of block.scene.primitives) parts.push(primitiveSvg(block.scene, primitive, transform.toSheet));
    }
    if (block.table) parts.push(tableSvg(block.table, block));
  }

  parts.push(titleBlockSvg(doc));

  // notes + missing data strip
  const noteY = doc.titleBlock.yMm + doc.titleBlock.heightMm + 4;
  doc.notes.forEach((note, index) => {
    parts.push(`<text x="${doc.widthMm - 10}" y="${(noteY + index * 3.4).toFixed(2)}" font-size="2.3" text-anchor="end" fill="#334155">${esc(note)}</text>`);
  });
  parts.push(
    `<text x="10" y="${(noteY + 0.5).toFixed(2)}" font-size="2.2" text-anchor="start" fill="#b45309">${esc(`عناصر تعریف‌نشده: ${doc.missingData.map((row) => row.item).join("، ")}`)}</text>`,
  );
  parts.push(
    `<text x="10" y="${(noteY + 4).toFixed(2)}" font-size="2.2" text-anchor="start" fill="#b91c1c">${esc(doc.readiness.disclaimer)}</text>`,
  );
  parts.push(`</svg>`);
  return parts.join("\n");
}

export interface SheetPageGeometry {
  widthPt: number;
  heightPt: number;
}

export function sheetPageGeometry(doc: SheetDocument): SheetPageGeometry {
  return {
    widthPt: Number((doc.widthMm * MM_TO_PT).toFixed(2)),
    heightPt: Number((doc.heightMm * MM_TO_PT).toFixed(2)),
  };
}

export function renderSheetPdfOps(doc: SheetDocument): string[] {
  const ops: string[] = [];
  const pageHpt = doc.heightMm * MM_TO_PT;
  const toPt = (x: number, y: number) => ({ x: x * MM_TO_PT, y: pageHpt - y * MM_TO_PT });
  const text = (x: number, y: number, size: number, value: string, grey = 0.08) => {
    const safe = value.replace(/[^\x20-\x7E]/g, "");
    if (!safe.trim()) return;
    const pt = toPt(x, y);
    ops.push(`BT ${grey} ${grey} ${grey} rg /F1 ${(size * 0.92).toFixed(2)} Tf 1 0 0 1 ${pt.x.toFixed(2)} ${pt.y.toFixed(2)} Tm (${safe.replace(/[()\\]/g, "")}) Tj ET`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, grey = 0.55, widthMm = 0.2) => {
    const a = toPt(x1, y1);
    const b = toPt(x2, y2);
    ops.push(`${grey} ${grey} ${grey} RG ${widthMm} w ${a.x.toFixed(2)} ${a.y.toFixed(2)} m ${b.x.toFixed(2)} ${b.y.toFixed(2)} l S`);
  };
  const rect = (x: number, y: number, w: number, h: number, grey = 0.8) => {
    const a = toPt(x, y + h);
    ops.push(`${grey} ${grey} ${grey} RG 0.2 w ${a.x.toFixed(2)} ${a.y.toFixed(2)} ${(w * MM_TO_PT).toFixed(2)} ${(h * MM_TO_PT).toFixed(2)} re S`);
  };

  text(doc.widthMm - 10, 12, 4.4, `${doc.title} - ${doc.sheetNumber}`, 0.05);
  line(10, 21, doc.widthMm - 10, 21, 0.2, 0.4);

  for (const block of doc.blocks) {
    rect(block.xMm, block.yMm, block.widthMm, block.heightMm);
    if (block.scene) {
      const transform = sceneTransform(block.scene, block);
      text(block.xMm + block.widthMm - 2, block.yMm + 4.2, 2.6, `${block.title}  1:${block.scaleDenominator}`, 0.1);
      for (const primitive of block.scene.primitives) {
        if (primitive.kind === "text") continue; // Persian labels are SVG/UI only
        if (primitive.kind === "line") {
          const a = transform.toSheet(primitive.from);
          const b = transform.toSheet(primitive.to);
          line(a.x, a.y, b.x, b.y, primitive.layer === "issue" ? 0.75 : 0.3, primitive.dashed ? 0.15 : 0.22);
          continue;
        }
        if (primitive.kind === "arc") {
          const c = transform.toSheet(primitive.center);
          const r = primitive.radiusM * block.scene.sheet.mmPerMetre;
          ops.push(`${0.4} ${0.4} ${0.4} RG 0.18 w ${c.x.toFixed(2)} ${(pageHpt - c.y * 1).toFixed(2)} m ${r.toFixed(2)} ${r.toFixed(2)} 0 0 360 re S`);
          continue;
        }
        const pts = primitive.points.map((p) => transform.toSheet(p));
        if (pts.length < 2) continue;
        const path = pts
          .map((p, index) => {
            const pt = toPt(p.x, p.y);
            return `${pt.x.toFixed(2)} ${pt.y.toFixed(2)} ${index === 0 ? "m" : "l"}`;
          })
          .join(" ");
        const grey = primitive.layer === "wall-exterior" ? 0.1 : primitive.layer === "issue" ? 0.75 : 0.35;
        ops.push(`${grey} ${grey} ${grey} RG ${primitive.layer.startsWith("wall") ? 0.35 : 0.2} w ${path} h S`);
      }
    }
    const table = block.table;
    if (table) {
      text(block.xMm + block.widthMm - 2, block.yMm + 4.4, 2.9, `${block.title} (${table.rows.length} rows)`, 0.08);
      const rowH = Math.max(3.2, Math.min(6, (block.heightMm - 14) / Math.max(1, table.rows.length)));
      table.rows.forEach((row, index) => {
        const y = block.yMm + 12 + index * rowH;
        if (y > block.yMm + block.heightMm - 4) return;
        const values = table.columns.map((column) => row.cells[column.key]?.value ?? "");
        text(block.xMm + block.widthMm - 2, y, 1.9, values.join(" | ").slice(0, 150), 0.15);
      });
      let fy = block.yMm + block.heightMm - 3;
      for (const total of table.totals.slice(0, 3)) {
        text(block.xMm + block.widthMm - 2, fy, 2, `${total.label}: ${total.value}`, 0.2);
        fy -= 3;
      }
    }
  }

  const tb = doc.titleBlock;
  rect(tb.xMm, tb.yMm, tb.widthMm, tb.heightMm, 0.2);
  text(tb.xMm + tb.widthMm - 3, tb.yMm + 8, 3, `${doc.sheetNumber} - ${doc.project.schemeCode}`, 0.05);
  text(tb.xMm + tb.widthMm - 3, tb.yMm + 16, 2.4, `SCALES ${doc.scaleSummary.map((entry) => `1:${entry.scaleDenominator}`).join(" / ")}`, 0.2);
  text(tb.xMm + tb.widthMm - 3, tb.yMm + 24, 2.4, `${doc.format} ${doc.widthMm}x${doc.heightMm} mm - UNITS METRE - ${doc.project.date}`, 0.2);
  text(tb.xMm + tb.widthMm - 3, tb.yMm + 32, 2.2, "REVIEW REQUIRED - NOT A CONSTRUCTION APPROVAL", 0.7);
  return ops;
}

export function scheduleToCsv(table: ScheduleTable): string {
  const header = table.columns.map((column) => column.label).join(",");
  const rows = table.rows.map((row) =>
    table.columns
      .map((column) => {
        const value = row.cells[column.key]?.value ?? "";
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      })
      .join(","),
  );
  return [header, ...rows, "", `MISSING_IN_MODEL,${table.missingFields.join(" | ")}`].join("\n");
}
