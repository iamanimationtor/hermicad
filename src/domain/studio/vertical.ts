/**
 * HERMICAD Studio — نمای ساختمان و برش
 *
 * چرا وجود دارد: پلان به‌تنهایی برگهٔ اجرایی نیست. دفاتر ایرانی برای هر پروژه
 * «نمای شمالی/جنوبی/شرقی/غربی» و «برش» می‌خواهند و بدون آن‌ها نقشه قابل ارائه
 * به شهرداری و ناظر نیست. این ماژول همان برگه‌ها را از همان مدل پلان می‌سازد:
 *
 *  - هر نما: دیوارها، ستون‌ها، بازشوها (با ارتفاع کف‌نشیمن و ارتفاع خود بازشو)،
 *    کف طبقات، پی (زیر تراز صفر)، جان‌پناه بام و تراز طبقات.
 *  - برش: همان منطق، محدود به اجزایی که با نوار برش تقاطع دارند.
 *  - برگهٔ نماها: چهار نما در یک برگه، با کادر و عنوان مستقل هر نما.
 *
 * ارتفاع هر جزء از متادیتای کتابخانه (defaultSize.h) می‌آید و ارتفاع طبقه از
 * DEFAULT_FLOOR_HEIGHT؛ بنابراین یک منبع حقیقت واحد برای هر دو خروجی.
 */

import { CATALOG_BY_ID, type StudioLayerId } from "./catalog";
import { DxfWriter, dxfText } from "./dxf";
import { documentFingerprint, renderableItems, sheetSizeMm, todayJalali, type StudioDocument, type StudioItem } from "./document";
import { faNumber } from "./sheetKit";

export type ElevationDirection = "north" | "south" | "east" | "west";

export const ELEVATION_LABELS: Record<ElevationDirection, string> = {
  north: "نمای شمالی",
  south: "نمای جنوبی",
  east: "نمای شرقی",
  west: "نمای غربی",
};

/** ارتفاع کف تا کف هر طبقه (متر). */
export const DEFAULT_FLOOR_HEIGHT = 3.2;

/**
 * ارتفاع کف‌نشیمن و ارتفاع خود بازشو — تنها منبع حقیقت برای نما، جدول درها و
 * پنجره‌ها و جزئیات. تغییر این اعداد همهٔ خروجی‌ها را هم‌زمان درست می‌کند.
 */
export const OPENING_HEIGHTS: Record<string, { sill: number; height: number }> = {
  "door-single": { sill: 0, height: 2.1 },
  "door-double": { sill: 0, height: 2.1 },
  "door-garage": { sill: 0, height: 2.4 },
  window: { sill: 0.9, height: 1.3 },
};

interface ElevationBlock {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  layer: StudioLayerId;
  kind: "solid" | "opening" | "column";
  /** فاصله از ناظر؛ برای مرتب‌سازی نزدیک روی دور */
  depth: number;
  /** شناسهٔ کتابخانه — برای تمایز در/پنجره و انتخاب نماد نما */
  catalogId?: string;
}

const n = (value: number): string => (Math.round(value * 1000) / 1000).toString();

const LAYER_STYLE: Record<string, { stroke: string; fill: string; width: number }> = {
  walls: { stroke: "#0f172a", fill: "#e2e8f0", width: 0.35 },
  structure: { stroke: "#b91c1c", fill: "#cbd5e1", width: 0.3 },
  foundation: { stroke: "#7c2d12", fill: "#e7e5e4", width: 0.3 },
};

/** بازهٔ افقی شیء روی محور نمای داده‌شده و فاصله‌اش از ناظر. */
function project(item: StudioItem, direction: ElevationDirection): { x0: number; x1: number; depth: number } {
  const radians = (item.rotationDeg * Math.PI) / 180;
  const extentX = Math.abs(item.w * Math.cos(radians)) + Math.abs(item.d * Math.sin(radians));
  const extentY = Math.abs(item.w * Math.sin(radians)) + Math.abs(item.d * Math.cos(radians));
  if (direction === "north" || direction === "south") {
    return { x0: item.x - extentX / 2, x1: item.x + extentX / 2, depth: item.y };
  }
  return { x0: item.y - extentY / 2, x1: item.y + extentY / 2, depth: item.x };
}

/** آیا شیء در نوار برش قرار دارد؟ */
function inSection(item: StudioItem, direction: ElevationDirection, at: number, width: number): boolean {
  const span = project(item, direction);
  const depth = span.depth;
  // عمق واقعی: برای نماهای شمالی/جنوبی محور y و برای شرقی/غربی محور x
  return depth >= at - width / 2 && depth <= at + width / 2;
}

function collectBlocks(doc: StudioDocument, direction: ElevationDirection, section?: { at: number; width: number }): ElevationBlock[] {
  const blocks: ElevationBlock[] = [];
  const wantLayers = new Set<string>(["walls", "structure", "foundation"]);
  for (const item of renderableItems({ ...doc, classification: "all" })) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    if (!wantLayers.has(definition.layer)) continue;
    // در نما همهٔ دیوارها روی هم می‌افتند (دیوار نزدیک، دور را می‌پوشاند).
    // در برش فقط اجزایی که با نوار برش تقاطع دارند باقی می‌مانند.
    if (section && !inSection(item, direction, section.at, section.width)) continue;
    const span = project(item, direction);
    const base = item.level * DEFAULT_FLOOR_HEIGHT;
    const opening = OPENING_HEIGHTS[item.catalogId];
    if (opening) {
      blocks.push({
        x0: span.x0,
        x1: span.x1,
        y0: base + opening.sill,
        y1: base + opening.sill + opening.height,
        layer: definition.layer,
        kind: "opening",
        depth: span.depth,
        catalogId: definition.id,
      });
      continue;
    }
    if (definition.category === "foundation") {
      // در نما، پی زیر خاک است و دیده نمی‌شود؛ فقط در برش (که بریده می‌شود) می‌آید.
      if (!section) continue;
      blocks.push({ x0: span.x0, x1: span.x1, y0: -Math.max(0.6, definition.defaultSize.h * 2), y1: 0, layer: definition.layer, kind: "solid", depth: span.depth });
      continue;
    }
    if (definition.id.startsWith("beam-")) continue; // در ضخامت کف پنهان است
    blocks.push({
      x0: span.x0,
      x1: span.x1,
      y0: base,
      y1: base + (definition.defaultSize.h || DEFAULT_FLOOR_HEIGHT),
      layer: definition.layer,
      kind: definition.id.startsWith("column") ? "column" : "solid",
      depth: span.depth,
    });
  }
  /**
   * پنهان‌سازی بازشوهای داخلی در نما.
   *
   * چرا: نما بدون حذف خطوط پنهان رسم می‌شود، پس در/پنجرهٔ دیوارهای داخلی از
   * پشت نمای بیرونی «دیده» می‌شد و نقشه بی‌معنا می‌شد (دری که زیر پنجرهٔ نما
   * آویزان است). فقط بازشوهایی می‌مانند که روی پوستهٔ بیرونیِ همان جهت‌اند.
   */
  if (!section) {
    const depthOf = (block: ElevationBlock): number => block.depth;
    const wallDepths = blocks.filter((block) => block.kind === "solid").map(depthOf);
    if (wallDepths.length > 0) {
      const viewerFromLow = direction === "south" || direction === "west";
      const facade = viewerFromLow ? Math.min(...wallDepths) : Math.max(...wallDepths);
      for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index];
        if (block.kind !== "opening") continue;
        if (Math.abs(block.depth - facade) > 0.5) blocks.splice(index, 1);
      }
    }
  }
  return blocks;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VerticalViewOptions {
  direction?: ElevationDirection;
  /** اگر داده شود، برش رسم می‌شود */
  sectionAt?: number;
  sectionWidth?: number;
  title?: string;
}

interface DrawnView {
  svg: string;
  scale: number;
  minX: number;
  maxX: number;
}

/** هندسهٔ یک نما/برش روی برگه (میلی‌متر) — مشترک بین خروجی SVG و PDF. */
export interface ViewGeometry {
  direction: ElevationDirection;
  isSection: boolean;
  blocks: ElevationBlock[];
  /** ترتیب رسم: پی، دیوارها (دور به نزدیک)، بقیه، بازشوها، ستون‌ها */
  ordered: ElevationBlock[];
  scale: number;
  mmPerMetre: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  frame: Frame;
  map: (x: number, y: number) => { x: number; y: number };
}

export function viewGeometry(doc: StudioDocument, options: VerticalViewOptions, frame: Frame): ViewGeometry {
  const direction = options.direction ?? "south";
  const isSection = options.sectionAt != null;
  const blocks = collectBlocks(doc, direction, isSection ? { at: options.sectionAt!, width: options.sectionWidth ?? 1.0 } : undefined);

  const minX = blocks.length ? Math.min(...blocks.map((block) => block.x0)) : 0;
  const maxX = blocks.length ? Math.max(...blocks.map((block) => block.x1)) : 12;
  const minY = blocks.length ? Math.min(0, ...blocks.map((block) => block.y0)) : 0;
  const maxY = Math.max(doc.levels * DEFAULT_FLOOR_HEIGHT + 0.9, ...blocks.map((block) => block.y1));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 2);

  const candidates = [20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  let scale = candidates[candidates.length - 1];
  const usableW = frame.w - 26; // جای ترازها و حاشیه
  const usableH = frame.h - 20; // جای عنوان و مقیاس
  for (const candidate of candidates) {
    if ((spanX * 1000) / candidate <= usableW && (spanY * 1000) / candidate <= usableH) {
      scale = candidate;
      break;
    }
  }
  const mmPerMetre = 1000 / scale;
  const drawingW = spanX * mmPerMetre;
  const drawingH = spanY * mmPerMetre;
  const originX = frame.x + (frame.w - drawingW) / 2 + drawingW;
  // تراز عمودی: نقشه در فضای زیر عنوان «وسط‌چین» می‌شود (نه چسبیده به کف کادر)
  const topPad = 20;
  const bottomPad = 10;
  const originY = frame.y + topPad + Math.max(0, (frame.h - topPad - bottomPad - drawingH) / 2) + drawingH;
  const map = (x: number, y: number) => ({ x: originX - (x - minX) * mmPerMetre, y: originY - (y - minY) * mmPerMetre });

  const near = direction === "south" || direction === "west";
  const walls = blocks.filter((block) => block.layer === "walls" && block.kind === "solid").sort((a, b) => (near ? b.depth - a.depth : a.depth - b.depth));
  const openings = blocks.filter((block) => block.kind === "opening");
  const columns = blocks.filter((block) => block.kind === "column");
  const footing = blocks.filter((block) => block.layer === "foundation");
  const rest = blocks.filter((block) => !walls.includes(block) && !openings.includes(block) && !columns.includes(block) && !footing.includes(block));
  const ordered = [...footing, ...walls, ...rest, ...openings, ...columns];

  return {
    direction,
    isSection,
    blocks,
    ordered,
    scale,
    mmPerMetre,
    minX,
    maxX,
    minY,
    maxY,
    frame,
    map,
  };
}

/** رسم یک نما/برش داخل کادر مشخص (میلی‌متر) — خروجی SVG. */
function drawView(doc: StudioDocument, options: VerticalViewOptions, frame: Frame): DrawnView {
  const view = viewGeometry(doc, options, frame);
  const { direction, isSection, blocks, ordered, scale, mmPerMetre, minX, maxX, minY, maxY, map } = view;
  const pieces: string[] = [];

  // کف طبقات و بام
  for (let level = 0; level <= doc.levels; level += 1) {
    const y = level * DEFAULT_FLOOR_HEIGHT;
    const a = map(minX - 0.3, y - 0.2);
    const b = map(maxX + 0.3, y + 0.02);
    pieces.push(
      `<rect x="${n(Math.min(a.x, b.x))}" y="${n(Math.min(a.y, b.y))}" width="${n(Math.abs(a.x - b.x))}" height="${n(Math.abs(a.y - b.y))}" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.25" data-slab="1"/>`,
    );
  }
  // جان‌پناه بام
  // جان‌پناه بام: در نما «حجم» است، نه خط پنهان؛ با کف‌سازی و کفسنگی بالای آن
  const parapetA = map(minX - 0.3, doc.levels * DEFAULT_FLOOR_HEIGHT);
  const parapetB = map(maxX + 0.3, doc.levels * DEFAULT_FLOOR_HEIGHT + 0.9);
  const px = Math.min(parapetA.x, parapetB.x);
  const py = Math.min(parapetA.y, parapetB.y);
  const pw = Math.abs(parapetA.x - parapetB.x);
  const ph = Math.abs(parapetA.y - parapetB.y);
  pieces.push(
    `<rect x="${n(px)}" y="${n(py)}" width="${n(pw)}" height="${n(ph)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.35" data-parapet="1"/>`,
    `<rect x="${n(px - 0.8)}" y="${n(py - 1.1)}" width="${n(pw + 1.6)}" height="${n(1.1)}" fill="#e2e8f0" stroke="#0f172a" stroke-width="0.3" data-coping="1"/>`,
  );

  // ترتیب رسم در نما:
  //   ۱) دیوارها از دور به نزدیک (نزدیک‌ترین دیوار روی بقیه می‌افتد)
  //   ۲) بازشوها روی دیوارِ نزدیک‌ترین جبهه (تا هرگز پشت دیوار پنهان نشوند)
  //   ۳) ستون‌ها روی همه (در نما، ستون همیشه در جلوی دیوار دیده می‌شود)
  //   ۴) پی‌ها زیر تراز صفر
  // این ترتیب همان چیزی است که در نمای واقعی دیده می‌شود؛ ترتیب صرفاً هندسی
  // (عمق) باعث می‌شد بازشوی دیوار دور، از روی دیوار نزدیک دیده شود.
  for (const block of ordered) {
    const style = LAYER_STYLE[block.layer] ?? LAYER_STYLE.walls;
    const p0 = map(block.x0, block.y0);
    const p1 = map(block.x1, block.y1);
    const x = Math.min(p0.x, p1.x);
    const y = Math.min(p0.y, p1.y);
    const w = Math.max(Math.abs(p1.x - p0.x), 0.3);
    const h = Math.max(Math.abs(p1.y - p0.y), 0.3);
    // در برش، اجزای بریده‌شده «پوشیده» (poché) رسم می‌شوند تا از نمای بیرونی
    // قابل تفکیک باشند — قاعدهٔ ترسیم استاندارد برش.
    const isCut = isSection && block.kind !== "opening";
    const cutFill = isCut ? (block.kind === "column" ? "#64748b" : "#cbd5e1") : null;
    if (block.kind === "opening") {
      const isDoor = (block.catalogId ?? "").startsWith("door");
      // نماد نما: پنجره = لنگهٔ شیشه‌ای با آستانه و کف‌نشیمن؛ در = لنگهٔ توپر با
      // آستانه. خط وسط و کادر داخلی، عمق و بازشوندگی را نشان می‌دهد.
      pieces.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#ffffff" stroke="${style.stroke}" stroke-width="0.35" data-opening="1" data-opening-kind="${isDoor ? "door" : "window"}"/>`,
        `<rect x="${n(x + 0.6)}" y="${n(y + 0.6)}" width="${n(Math.max(w - 1.2, 0.4))}" height="${n(Math.max(h - 1.2, 0.4))}" fill="none" stroke="${style.stroke}" stroke-width="0.18"/>`,
      );
      if (isDoor) {
        // لنگهٔ در + دستگیره
        pieces.push(
          `<line x1="${n(x + w / 2)}" y1="${n(y + 0.6)}" x2="${n(x + w / 2)}" y2="${n(y + h - 0.6)}" stroke="${style.stroke}" stroke-width="0.15"/>`,
          `<circle cx="${n(x + w / 2 - 0.8)}" cy="${n(y + h / 2)}" r="0.28" fill="${style.stroke}"/>`,
        );
      } else {
        // آستانهٔ پنجره: خط کوتاه بیرون‌زده در پایین، و تقسیم عمودی لنگه‌ها
        pieces.push(
          `<line x1="${n(x - 0.9)}" y1="${n(y + h)}" x2="${n(x + w + 0.9)}" y2="${n(y + h)}" stroke="${style.stroke}" stroke-width="0.35"/>`,
          `<line x1="${n(x + w / 2)}" y1="${n(y + 0.6)}" x2="${n(x + w / 2)}" y2="${n(y + h - 0.6)}" stroke="${style.stroke}" stroke-width="0.15"/>`,
          `<line x1="${n(x + 0.6)}" y1="${n(y + h * 0.62)}" x2="${n(x + w - 0.6)}" y2="${n(y + h * 0.62)}" stroke="${style.stroke}" stroke-width="0.15"/>`,
        );
      }
      continue;
    }
    pieces.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${cutFill ?? (block.kind === "column" ? "#94a3b8" : style.fill)}" stroke="${style.stroke}" stroke-width="${style.width}" data-kind="${block.kind}"${isCut ? ' data-cut="1"' : ""}${block.y0 < 0 ? ' data-below-grade="1"' : ""}/>`,
    );
  }

  // خط زمین و هاشور زیر تراز صفر (خاک)
  const groundA = map(minX - 0.6, 0);
  const groundB = map(maxX + 0.3, 0);
  const lower = map(minX - 0.6, minY);
  const soilHeight = Math.max(lower.y - groundA.y, 0);
  const hatch: string[] = [];
  for (let x = groundA.x; x < groundB.x + soilHeight; x += 2.4) {
    hatch.push(`<line x1="${n(x)}" y1="${n(groundA.y + soilHeight)}" x2="${n(x + soilHeight)}" y2="${n(groundA.y)}" stroke="#94a3b8" stroke-width="0.18"/>`);
  }
  pieces.push(
    `<g clip-path="url(#soilClip)" data-soil="1">${hatch.join("")}</g>`,
    `<clipPath id="soilClip"><rect x="${n(groundA.x)}" y="${n(groundA.y)}" width="${n(groundB.x - groundA.x)}" height="${n(soilHeight)}"/></clipPath>`,
    `<line x1="${n(groundA.x)}" y1="${n(groundA.y)}" x2="${n(groundB.x)}" y2="${n(groundB.y)}" stroke="#0f172a" stroke-width="0.7" data-ground="1"/>`,
  );

  // تراز طبقات + ارتفاع‌گذاری کل
  for (let level = 0; level <= doc.levels; level += 1) {
    const y = level * DEFAULT_FLOOR_HEIGHT;
    const point = map(minX, y);
    const leftEdge = map(maxX, y);
    const label = level === 0 ? "±0.00" : `+${y.toFixed(2)}`;
    pieces.push(
      // ترازها در حاشیهٔ چپ نوشته می‌شوند و خط راهنما فقط تا لبهٔ چپ نقشه می‌آید
      // (اگر تا لبهٔ راست کشیده شود، از روی خود نقشه می‌گذرد).
      `<line x1="${n(frame.x + 13)}" y1="${n(point.y)}" x2="${n(leftEdge.x - 1.5)}" y2="${n(point.y)}" stroke="#94a3b8" stroke-width="0.15" stroke-dasharray="3 2"/>`,
      `<text direction="ltr" x="${n(frame.x + 1)}" y="${n(point.y + 0.8)}" font-size="2" fill="#334155" font-family="Vazirmatn, Tahoma, sans-serif">${label}</text>`,
    );
  }
  // ارتفاع‌گذاری کل در سمت راست نقشه (بیرون از خط دیوار)
  const dimA = map(minX - 0.55, 0);
  const dimB = map(minX - 0.55, doc.levels * DEFAULT_FLOOR_HEIGHT);
  pieces.push(
    `<line x1="${n(dimA.x)}" y1="${n(dimA.y)}" x2="${n(dimB.x)}" y2="${n(dimB.y)}" stroke="#334155" stroke-width="0.2"/>`,
    `<line x1="${n(dimA.x - 1)}" y1="${n(dimA.y)}" x2="${n(dimA.x + 1)}" y2="${n(dimA.y)}" stroke="#334155" stroke-width="0.2"/>`,
    `<line x1="${n(dimB.x - 1)}" y1="${n(dimB.y)}" x2="${n(dimB.x + 1)}" y2="${n(dimB.y)}" stroke="#334155" stroke-width="0.2"/>`,
    `<text direction="ltr" x="${n(dimA.x + 1.4)}" y="${n((dimA.y + dimB.y) / 2)}" font-size="2" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif" transform="rotate(-90 ${n(dimA.x + 1.4)} ${n((dimA.y + dimB.y) / 2)})">${(doc.levels * DEFAULT_FLOOR_HEIGHT).toFixed(2)}</text>`,
  );

  // مقیاس
  const barY = frame.y + frame.h - 6;
  pieces.push(
    `<rect x="${n(frame.x + 4)}" y="${n(barY)}" width="${n(mmPerMetre)}" height="1.6" fill="#0f172a"/>`,
    `<text direction="rtl" x="${n(frame.x + 6 + mmPerMetre)}" y="${n(barY + 1.4)}" font-size="1.9" fill="#334155" font-family="Vazirmatn, Tahoma, sans-serif">1 متر — 1:${scale}</text>`,
  );

  const title = options.title ?? (isSection ? `برش A-A (در ${options.sectionAt!.toFixed(2)} متر)` : ELEVATION_LABELS[direction]);
  return {
    svg: `<g data-view="${isSection ? "section" : "elevation"}" data-direction="${direction}"><text direction="rtl" x="${n(frame.x + frame.w - 2)}" y="${n(frame.y + 5)}" font-size="3.4" text-anchor="end" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif" font-weight="600">${title}</text>${pieces.join("")}</g>`,
    scale,
    minX,
    maxX,
  };
}

function frameSvg(frame: Frame): string {
  // قاب هر نما خط نازک ممتد است (نه نقطه‌چین)؛ نقطه‌چین در نقشه معنای «پنهان/بالا»
  // دارد و قاب نما نباید با آن اشتباه شود.
  return `<rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.w)}" height="${n(frame.h)}" fill="none" stroke="#cbd5e1" stroke-width="0.2"/>`;
}

function sheetBase(doc: StudioDocument, title: string, subtitle: string, body: string, footerNote: string): string {
  const size = sheetSizeMm(doc);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}mm" height="${size.h}mm" viewBox="0 0 ${size.w} ${size.h}">
  <defs>
    <pattern id="soil" width="2.4" height="2.4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="2.4" stroke="#94a3b8" stroke-width="0.18"/>
    </pattern>
  </defs>
  <rect width="${size.w}" height="${size.h}" fill="#ffffff"/>
  <rect x="6" y="6" width="${size.w - 12}" height="${size.h - 12}" fill="none" stroke="#0f172a" stroke-width="0.5"/>
  <rect x="10" y="10" width="${size.w - 20}" height="${size.h - 20}" fill="none" stroke="#94a3b8" stroke-width="0.25"/>
  <text direction="rtl" x="${size.w - 14}" y="20" font-size="5.4" text-anchor="end" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif" font-weight="700">${title}</text>
  <text direction="rtl" x="${size.w - 14}" y="27" font-size="2.6" text-anchor="end" fill="#334155" font-family="Vazirmatn, Tahoma, sans-serif">${subtitle}</text>
  ${body}
  <line x1="12" y1="${size.h - 34}" x2="${size.w - 12}" y2="${size.h - 34}" stroke="#0f172a" stroke-width="0.35"/>
  <text direction="rtl" x="${size.w - 14}" y="${size.h - 27}" font-size="2.8" text-anchor="end" fill="#0f172a" font-family="Vazirmatn, Tahoma, sans-serif">${doc.project.code} · ${doc.project.name} · ${doc.project.designer} · ${doc.project.date} · ویرایش ${doc.revision}</text>
  <text direction="ltr" x="14" y="${size.h - 27}" font-size="2.2" fill="#475569" font-family="Vazirmatn, Tahoma, sans-serif">${documentFingerprint(doc)} · ${todayJalali()}</text>
  <text direction="rtl" x="${size.w - 14}" y="${size.h - 13}" font-size="2.2" text-anchor="end" fill="#64748b" font-family="Vazirmatn, Tahoma, sans-serif">${footerNote}</text>
</svg>`;
}

/** یک نما/برش روی یک برگه کامل. */
export function renderStudioVertical(doc: StudioDocument, options: VerticalViewOptions = {}): string {
  const size = sheetSizeMm(doc);
  const frame: Frame = { x: 16, y: 34, w: size.w - 32, h: size.h - 34 - 40 };
  const view = drawView(doc, options, frame);
  const subtitle = `${doc.project.code} · مقیاس 1:${view.scale} · ${doc.sheet.format}`;
  return sheetBase(doc, options.title ?? (options.sectionAt != null ? "برش" : ELEVATION_LABELS[options.direction ?? "south"]), subtitle, view.svg, "نما از مدل پلان ساخته می‌شود؛ کنترل نهایی با مهندس دارای صلاحیت است.");
}

/**
 * برگهٔ نماها: چهار نمای اصلی + برش، در یک برگه.
 * تراز عمودی همهٔ نماها یکسان است تا ارتفاع طبقات قابل مقایسه باشد.
 */
export function renderStudioElevationSheet(doc: StudioDocument): string {
  const size = sheetSizeMm(doc);
  const margin = 14;
  const top = 34;
  const footer = 40;
  const rows = 2;
  const cols = 2;
  const gap = 4;
  const cellW = (size.w - margin * 2 - gap) / cols;
  const cellH = (size.h - top - footer - gap * rows) / rows;
  const directions: ElevationDirection[] = ["south", "north", "east", "west"];
  const frames: Frame[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      frames.push({ x: margin + col * (cellW + gap), y: top + row * (cellH + gap), w: cellW, h: cellH });
    }
  }
  const views = directions.map((direction, index) => drawView(doc, { direction }, frames[index]));
  const body = frames.map((frame, index) => frameSvg(frame) + views[index].svg).join("");
  const scaleText = views
    .map((view) => `۱:${faNumber(view.scale, 0)}`)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" / ");
  return sheetBase(doc, "برگهٔ نماها و برش", `${doc.project.code} · مقیاس ${scaleText} · ${doc.sheet.format}`, body, "نماها از مدل پلان ساخته می‌شوند؛ کنترل نهایی با مهندس دارای صلاحیت است.");
}

/* ───────────────────────────── DXF نما و برش ───────────────────────────── */

/**
 * نما/برش به‌صورت DXF در مقیاس واقعی (متر).
 *
 * چرا در متر و نه روی برگه: کاربر اتوکد می‌خواهد نمای ۱:۱ را در مدل‌اسپیس داشته
 * باشد و خودش مقیاس چاپ را انتخاب کند؛ تبدیل به میلی‌متر برگه در DXF یعنی
 * دو بار مقیاس‌کردن و ابعاد نادرست. این خروجی از همان `collectBlocks` نما
 * استفاده می‌کند تا با SVG/PDF هم‌هندسه بماند.
 */
const VERTICAL_DXF_LAYERS: { name: string; color: number }[] = [
  { name: "WALLS", color: 7 },
  { name: "STRUCTURE", color: 1 },
  { name: "FOUNDATION", color: 30 },
  { name: "OPENINGS", color: 4 },
  { name: "LEVELS", color: 8 },
  { name: "LABELS", color: 8 },
];

const LAYER_TO_DXF: Record<string, string> = {
  walls: "WALLS",
  structure: "STRUCTURE",
  foundation: "FOUNDATION",
};

/**
 * یک یا چند نما/برش را در مدل‌اسپیس DXF می‌نویسد.
 * `views` پشت سر هم روی محور X با فاصلهٔ `gapM` متر چیده می‌شوند.
 */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** عدد با ارقام فارسی و ممیز «٫» برای متن‌های DXF. */
function faFixed(value: number, digits = 2): string {
  return value
    .toFixed(digits)
    .replace(".", "٫")
    .replace(/[0-9]/g, (digit) => FA_DIGITS[Number(digit)]);
}

export function studioVerticalDxf(
  doc: StudioDocument,
  views: { direction?: ElevationDirection; sectionAt?: number; sectionWidth?: number; title?: string }[],
  gapM = 4,
): string {
  const writer = new DxfWriter(VERTICAL_DXF_LAYERS);
  let offsetX = 0;
  for (const spec of views) {
    const isSection = spec.sectionAt != null;
    const direction = spec.direction ?? "south";
    const blocks = collectBlocks(
      doc,
      direction,
      isSection ? { at: spec.sectionAt!, width: spec.sectionWidth ?? 1.2 } : undefined,
    );
    const minX = blocks.length ? Math.min(...blocks.map((block) => block.x0)) : 0;
    const maxX = blocks.length ? Math.max(...blocks.map((block) => block.x1)) : 12;
    const spanX = Math.max(maxX - minX, 1);
    // در پلان محور x از راست به چپ است؛ در DXF هم همان ترتیب دیداری حفظ می‌شود.
    const mapX = (value: number) => offsetX + (maxX - value);

    for (const block of blocks) {
      const layer = block.kind === "opening" ? "OPENINGS" : LAYER_TO_DXF[block.layer] ?? "WALLS";
      const points: [number, number][] = [
        [mapX(block.x1), block.y0],
        [mapX(block.x0), block.y0],
        [mapX(block.x0), block.y1],
        [mapX(block.x1), block.y1],
      ];
      if (isSection && block.kind !== "opening") writer.solid(points, layer);
      else writer.polyline(points, layer);
    }

    // خطوط تراز: کف هر طبقه، بام و جان‌پناه
    for (let level = 0; level <= doc.levels; level += 1) {
      const y = level * DEFAULT_FLOOR_HEIGHT;
      writer.line(mapX(maxX + 0.3), y, mapX(minX - 0.3), y, "LEVELS");
      writer.text(
        mapX(minX - 0.35),
        y + 0.06,
        0.22,
        dxfText(`تراز ${level === 0 ? "±۰٫۰۰" : `+${faFixed(y)}`}`),
        "LABELS",
      );
    }
    const roofLevel = doc.levels * DEFAULT_FLOOR_HEIGHT;
    writer.line(mapX(maxX + 0.3), roofLevel + 0.9, mapX(minX - 0.3), roofLevel + 0.9, "LEVELS");

    const title = spec.title ?? (isSection ? "برش" : ELEVATION_LABELS[direction]);
    writer.text(offsetX + spanX / 2, -0.8, 0.35, dxfText(`${title} — مقیاس ۱:۱ (متر)`), "LABELS");
    offsetX += spanX + gapM;
  }
  return writer.build();
}
