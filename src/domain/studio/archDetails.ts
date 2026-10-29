/**
 * HERMICAD Studio — برگهٔ جزئیات اجرایی معماری
 *
 * چرا وجود دارد: برگهٔ جزئیات سازه (آرماتوربندی) فقط بخشی از «جزئیات اجرایی»
 * است. آنچه پیمانکار برای اجرا لازم دارد، مقاطع لایه‌های ساختمانی است: دیوار
 * خارجی، آب‌بندی سرویس، جان‌پناه بام و کف‌سازی. بدون این مقاطع، نقشهٔ معماری
 * «قابل اجرا» نیست و کار به تفسیر پیمانکار می‌افتد.
 *
 * اصول:
 *  • هر مقطع از «لایه» ساخته می‌شود؛ ضخامت‌ها واقعی (میلی‌متر) و مقیاس ۱:۵ است
 *    تا ضخامت‌های ۵ میلی‌متری عایق هم روی کاغذ دیده شوند.
 *  • هر لایه بافت (hatch) اختصاصی خودش را دارد: بتن، آجر، بلوک، عایق، ملات،
 *    کاشی، خاک. تفکیک بافتی، زبان مشترک نقشه‌های اجرایی است.
 *  • ضخامت کل و ضخامت هر لایه نوشته می‌شود (اندازه‌گذاری زنجیره‌ای).
 *  • همان زبان ترسیم مشترک (`Scene`) → SVG، PDF و DXF از یک منبع.
 *
 * هشدار: مقادیر، «نمونهٔ متعارف» مطابق عرف اجرایی ایران است (مبحث ۵ و ۸ و
 * نشریه‌های سازمان برنامه) و باید با مشخصات فنی پروژه تطبیق داده شود.
 */

import { documentFingerprint, sheetSizeMm, todayJalali, type StudioDocument } from "./document";
import { Scene, scenePdfOps, sceneSvg } from "./draw";
import { assemblePdf, type SheetLayout } from "./pdf/sheetPdf";
import { PdfText } from "./pdf/text";
import { loadTypeface } from "./pdf/typeface";
import { sceneToDxf } from "./sceneDxf";
import { faNumber, MARGIN, HEADER_H, FOOTER_H } from "./sheetKit";

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

type BandKind = "concrete" | "brick" | "block" | "insulation" | "mortar" | "tile" | "soil" | "gypsum" | "metal" | "gravel";

interface Band {
  /** ضخامت واقعی (میلی‌متر) */
  thickness: number;
  label: string;
  kind: BandKind;
}

/* ───────────────────────────── بافت لایه‌ها ───────────────────────────── */

/** بافت اختصاصی هر مصالح؛ خطوط همیشه داخل کادر بریده می‌شوند. */
function paintBand(scene: Scene, x: number, y: number, w: number, h: number, kind: BandKind): void {
  switch (kind) {
    case "concrete":
      scene.hatch(x, y, w, h, 2.4, { gray: 0.62, width: 0.14 });
      for (let index = 0; index < 3; index += 1) {
        const cy = y + h * (0.25 + index * 0.25);
        scene.circle(x + w * (0.2 + index * 0.28), cy, 0.5, { fill: 0.35, width: 0.1 });
      }
      break;
    case "gravel":
      scene.hatch(x, y, w, h, 1.9, { gray: 0.7, width: 0.12 });
      for (let index = 0; index < 6; index += 1) {
        const cx = x + w * (0.12 + (index % 3) * 0.3);
        const cy = y + h * (index < 3 ? 0.3 : 0.72);
        scene.circle(cx, cy, 0.7, { fill: 0.55, width: 0.12 });
      }
      break;
    case "brick": {
      // آجر: ردیف‌های افقی با بندهای کشیده‌شده (نمای مقطع)
      const rows = Math.max(2, Math.round(h / 3));
      const rowH = h / rows;
      for (let index = 0; index < rows; index += 1) {
        const ry = y + index * rowH;
        scene.line(x, ry, x + w, ry, { width: 0.16, gray: 0.35 });
        scene.line(x, ry + rowH, x + w, ry + rowH, { width: 0.16, gray: 0.35 });
        const cols = Math.max(1, Math.round(w / 6));
        for (let col = 0; col < cols; col += 1) {
          const cx = x + (col + (index % 2 === 0 ? 0.5 : 0)) * (w / cols);
          if (cx > x && cx < x + w) scene.line(cx, ry, cx, ry + rowH, { width: 0.12, gray: 0.45 });
        }
      }
      break;
    }
    case "block":
      // بلوک سیمانی: دو حفرهٔ مستطیلی در هر ردیف
      for (let row = 0; row < Math.max(1, Math.round(h / 9)); row += 1) {
        const ry = y + row * (h / Math.max(1, Math.round(h / 9)));
        const cellH = h / Math.max(1, Math.round(h / 9));
        scene.rect(x + 1, ry + 0.8, w - 2, cellH - 1.6, { width: 0.18, gray: 0.3 });
        scene.line(x + w / 2, ry + 0.8, x + w / 2, ry + cellH - 0.8, { width: 0.18, gray: 0.3 });
      }
      break;
    case "insulation":
      // عایق: موج پیاپی
      for (let cy = y + 0.9; cy < y + h; cy += 1.8) {
        const points: [number, number][] = [];
        for (let step = 0; step <= 12; step += 1) {
          points.push([x + (step / 12) * w, cy + Math.sin((step / 12) * Math.PI * 4) * 0.45]);
        }
        scene.poly(points, { closed: false, width: 0.14, gray: 0.4 });
      }
      break;
    case "mortar":
      scene.rect(x, y, w, h, { fill: 0.88, width: 0.12, gray: 0.45 });
      break;
    case "tile":
      for (let cx = x; cx < x + w; cx += 3) {
        scene.line(cx, y, cx, y + h, { width: 0.1, gray: 0.5 });
      }
      scene.line(x, y, x + w, y, { width: 0.2, gray: 0.3 });
      break;
    case "soil": {
      for (let index = 0; index < 26; index += 1) {
        const cx = x + ((index * 37) % 100) / 100 * w;
        const cy = y + ((index * 61) % 100) / 100 * h;
        scene.line(cx - 0.5, cy, cx + 0.5, cy, { width: 0.12, gray: 0.5 });
      }
      break;
    }
    case "metal":
      scene.line(x, y, x + w, y + h, { width: 0.14, gray: 0.35 });
      scene.line(x, y + h, x + w, y, { width: 0.14, gray: 0.35 });
      break;
    case "gypsum":
      scene.rect(x, y, w, h, { fill: 0.95, width: 0.12, gray: 0.5 });
      break;
  }
  scene.rect(x, y, w, h, { width: 0.3, gray: 0.25 });
}

/* ───────────────────────── مقاطع ساخته‌شده از لایه ───────────────────────── */

interface SectionOptions {
  /** مقیاس: میلی‌متر کاغذ بر متر واقعی */
  scale: number;
  /** گوشهٔ بالا-چپ مقطع */
  x: number;
  y: number;
  /** جهت چیدمان: دیوار (افقی) یا کف/بام (عمودی) */
  direction: "horizontal" | "vertical";
  bands: Band[];
  /** ارتفاع/طول برش در کاغذ (میلی‌متر) */
  extent: number;
}

/**
 * رسم مقطع لایه‌ای با اندازه‌گذاری زنجیره‌ای و **شمارهٔ راهنما** روی هر لایه.
 *
 * چرا شماره و راهنما (legend): در مقاطع اجرایی، ضخامت لایه‌ها ۵ تا ۱۵ میلی‌متر
 * کاغذ است و نوشتن نام روی خودِ لایه، کادر را پر و ناخوانا می‌کرد. روش متعارف
 * نقشه‌های اجرایی: شمارهٔ کوچک روی لایه + فهرست «لایه‌ها» در کنار مقطع.
 */
function drawSection(scene: Scene, options: SectionOptions): { totalPaper: number } {
  const { x, y, bands, direction, scale, extent } = options;
  const factor = scale / 1000; // میلی‌متر واقعی → میلی‌متر کاغذ
  const sizes = bands.map((band) => Math.max(1.2, band.thickness * factor));
  const totalPaper = sizes.reduce((sum, size) => sum + size, 0);
  // عدد روی اندازه‌گذاری، ضخامت واقعی است نه میلی‌متر کاغذ
  const realTotalCm = round(bands.reduce((sum, band) => sum + band.thickness, 0) / 10, 1);
  const dimLabel = `${faNumber(realTotalCm, Number.isInteger(realTotalCm) ? 0 : 1)} سانتی‌متر`;

  // موقعیت شروع: افقی از چپ، عمودی از پایین به بالا
  let cursor = direction === "horizontal" ? x : y + extent;
  bands.forEach((band, index) => {
    const size = sizes[index];
    if (direction === "horizontal") {
      paintBand(scene, cursor, y, size, extent, band.kind);
      // شمارهٔ راهنما در وسط نوار، در ارتفاع ۲۵٪ (جای خالی از خط راهنما)
      marker(scene, cursor + size / 2, y + extent * 0.3, index + 1);
      cursor += size;
    } else {
      paintBand(scene, x, cursor - size, extent, size, band.kind);
      marker(scene, x + extent * 0.25, cursor - size / 2, index + 1);
      cursor -= size;
    }
  });

  // اندازه‌گذاری زنجیره‌ای
  const dimGray = 0.4;
  if (direction === "horizontal") {
    const dimY = y + extent + 5;
    scene.line(x, dimY, x + totalPaper, dimY, { width: 0.2, gray: dimGray });
    let tick = x;
    for (const size of sizes) {
      scene.line(tick, dimY - 1.2, tick, dimY + 1.2, { width: 0.2, gray: dimGray });
      tick += size;
    }
    scene.line(tick, dimY - 1.2, tick, dimY + 1.2, { width: 0.2, gray: dimGray });
    scene.text((x + tick) / 2, dimY + 4, dimLabel, 1.9, { anchor: "middle", gray: dimGray });
  } else {
    const dimX = x - 5;
    scene.line(dimX, y, dimX, y + extent, { width: 0.2, gray: dimGray });
    let tick = y + extent;
    for (const size of sizes) {
      scene.line(dimX - 1.2, tick, dimX + 1.2, tick, { width: 0.2, gray: dimGray });
      tick -= size;
    }
    scene.line(dimX - 1.2, tick, dimX + 1.2, tick, { width: 0.2, gray: dimGray });
    scene.text(dimX - 2.6, y + extent / 2, dimLabel, 1.9, {
      anchor: "middle",
      gray: dimGray,
      rotate: -90,
    });
  }
  return { totalPaper };
}

/** شمارهٔ راهنمای کوچک روی لایه (دایره + رقم فارسی). */
function marker(scene: Scene, cx: number, cy: number, index: number): void {
  scene.circle(cx, cy, 1.7, { fill: 1, width: 0.2, gray: 0.15 });
  scene.text(cx, cy + 0.95, faNumber(index, 0), 2.2, { anchor: "middle", gray: 0.1, direction: "ltr" });
}

/** فهرست لایه‌ها در ستون کنار مقطع: شماره + نام + ضخامت. */
function drawLayerLegend(scene: Scene, bands: Band[], x: number, y: number, width: number): void {
  scene.text(x + width, y - 3, "لایه‌ها — شمارهٔ راهنما روی مقطع", 1.75, { anchor: "end", gray: 0.45 });
  bands.forEach((band, index) => {
    const rowY = y + 1.4 + index * 4.4;
    marker(scene, x + width - 1.5, rowY - 0.7, index + 1);
    const cm = band.thickness / 10;
    scene.text(x + width - 5, rowY, `${band.label} — ${faNumber(cm, Number.isInteger(cm) ? 0 : 1)} سانتی‌متر`, 1.85, {
      anchor: "end",
      gray: 0.2,
    });
  });
}

/* ─────────────────────────── چهار مقطع برگه ─────────────────────────── */

const EXTERIOR_WALL: Band[] = [
  { thickness: 25, label: "نمای آجر نما", kind: "brick" },
  { thickness: 25, label: "ملات ماسه‌سیمان ۱:۴", kind: "mortar" },
  { thickness: 150, label: "بلوک سیمانی", kind: "block" },
  { thickness: 40, label: "عایق حرارتی (پشم سنگ)", kind: "insulation" },
  { thickness: 20, label: "اندود گچ و خاک", kind: "gypsum" },
];

const WET_AREA: Band[] = [
  { thickness: 200, label: "دال بتنی سقف", kind: "concrete" },
  { thickness: 30, label: "ملات شیب‌بندی ۱٪", kind: "mortar" },
  { thickness: 6, label: "عایق رطوبتی دو لایه", kind: "insulation" },
  { thickness: 30, label: "ملات ماسه‌سیمان", kind: "mortar" },
  { thickness: 10, label: "کاشی سرامیک", kind: "tile" },
];

const ROOF_PARAPET: Band[] = [
  { thickness: 200, label: "دال بام", kind: "concrete" },
  { thickness: 30, label: "ملات شیب‌بندی", kind: "mortar" },
  { thickness: 5, label: "عایق رطوبتی", kind: "insulation" },
  { thickness: 40, label: "عایق حرارتی", kind: "insulation" },
  { thickness: 40, label: "بتن سبک پوشش", kind: "concrete" },
];

const FLOOR_BUILDUP: Band[] = [
  { thickness: 300, label: "خاک طبیعی کوبیده", kind: "soil" },
  { thickness: 100, label: "بتن مگر (۱۵۰)", kind: "gravel" },
  { thickness: 5, label: "عایق رطوبتی", kind: "insulation" },
  { thickness: 100, label: "بتن کف (۲۵۰)", kind: "concrete" },
  { thickness: 30, label: "ملات ماسه‌سیمان", kind: "mortar" },
  { thickness: 10, label: "سرامیک کف", kind: "tile" },
];

interface DetailCell {
  title: string;
  note: string;
  bands: Band[];
  direction: "horizontal" | "vertical";
  scale: number;
}

/** چهار جزئیات متعارف؛ مقادیر از عرف اجرایی و قابل تغییر در مشخصات فنی. */
export const ARCH_DETAILS: DetailCell[] = [
  {
    title: "مقطع دیوار خارجی",
    note: "درزهای آجرنما با ملات ۱:۴ · بلوک سیمانی ۱۵ سانتی‌متر · عایق حرارتی پیوسته",
    bands: EXTERIOR_WALL,
    direction: "horizontal",
    scale: 190,
  },
  {
    title: "آب‌بندی کف سرویس",
    note: "عایق تا ارتفاع ۱۵ سانتی‌متر روی کرسی‌چین بالا می‌آید · شیب ۱٪ به کفشوی",
    bands: WET_AREA,
    direction: "vertical",
    scale: 150,
  },
  {
    title: "جزئیات جان‌پناه بام",
    note: "ارتفاع جان‌پناه ۱۱۰ سانتی‌متر · آبگِرد فلزی با ورق گالوانیزه و درزگیر",
    bands: ROOF_PARAPET,
    direction: "vertical",
    scale: 150,
  },
  {
    title: "مقطع کف‌سازی همکف",
    note: "تراکم خاک ۹۵٪ · عایق رطوبتی روی بتن مگر · کف‌سازی ۱۰ سانتی‌متر",
    bands: FLOOR_BUILDUP,
    direction: "vertical",
    scale: 110,
  },
];

/**
 * مقطع بام و جان‌پناه (۱:۲۰).
 *
 * چرا جدا از قالب «انباشت لایه»: جان‌پناه عمودی است و روی بام می‌نشیند؛ نمایش
 * آن با نوارهای افقی ممکن نیست. ارتفاع ۱۱۰ سانتی‌متر، کف‌سازی، آبگِرد فلزی و
 * ورق پوشش، همان چیزی است که ناظر برای کنترل ارتفاع و آب‌بندی می‌خواهد.
 */
function drawParapetDetail(scene: Scene, cellX: number, cellY: number, cellW: number, legendX: number, top: number): void {
  const scale = 50; // ۱:۲۰ → ۵۰ میلی‌متر کاغذ بر متر
  const factor = scale / 1000;
  const roof = ROOF_PARAPET;
  const roofH = roof.reduce((sum, band) => sum + Math.max(0.8, band.thickness * factor), 0);
  const roofW = Math.min(cellW * 0.4, 58);
  const parapetH = 1100 * factor; // ۱۱۰ سانتی‌متر
  const parapetW = 200 * factor; // دیوار ۲۰ سانتی‌متری
  const secX = cellX + cellW - 12 - roofW;
  const roofBottom = top + parapetH + roofH;

  // لایه‌های بام
  let cursor = roofBottom;
  roof.forEach((band, index) => {
    const size = Math.max(0.8, band.thickness * factor);
    paintBand(scene, secX, cursor - size, roofW, size, band.kind);
    marker(scene, secX + roofW * 0.72, cursor - size / 2, index + 1);
    cursor -= size;
  });

  // دیوار جان‌پناه روی لبهٔ بام + پوشش
  scene.rect(secX, roofBottom - roofH - parapetH, parapetW, parapetH + roofH, { width: 0.3 });
  scene.hatch(secX, roofBottom - roofH - parapetH, parapetW, parapetH + roofH, 2.6, { gray: 0.6, width: 0.14 });
  marker(scene, secX + parapetW / 2, roofBottom - roofH - parapetH * 0.55, roof.length + 1);
  // ورق پوشش (کاپینگ) و آبگِرد فلزی
  scene.rect(secX - 1.6, roofBottom - roofH - parapetH - 2.2, parapetW + 3.2, 2.2, { width: 0.3, gray: 0.15 });
  scene.line(secX + parapetW, roofBottom - roofH - parapetH + 6, secX + parapetW + 9, roofBottom - roofH - 0.5, {
    width: 0.25,
    gray: 0.2,
  });
  marker(scene, secX + parapetW + 4.5, roofBottom - roofH - parapetH * 0.45, roof.length + 2);

  // اندازه‌گذاری ارتفاع جان‌پناه
  const dimX = secX - 6;
  scene.line(dimX, roofBottom - roofH - parapetH, dimX, roofBottom - roofH, { width: 0.2, gray: 0.4 });
  for (const dy of [roofBottom - roofH - parapetH, roofBottom - roofH]) {
    scene.line(dimX - 1.2, dy, dimX + 1.2, dy, { width: 0.2, gray: 0.4 });
  }
  scene.text(dimX - 2.6, roofBottom - roofH - parapetH / 2, "۱۱۰ سانتی‌متر", 1.9, { anchor: "middle", gray: 0.4, rotate: -90 });
  scene.text(secX + roofW / 2, roofBottom + 4.5, "مقطع بام — لایه‌ها از پایین به بالا", 1.7, { anchor: "middle", gray: 0.45 });

  // فهرست لایه‌ها + آیتم‌های جان‌پناه
  const rows = [
    ...roof.map((band) => ({ label: band.label, cm: band.thickness / 10 })),
    { label: "دیوار جان‌پناه (بلوکاژ/بتن)", cm: 20 },
    { label: "ورق پوشش + آبگِرد فلزی", cm: 5 },
  ];
  scene.text(legendX + (secX - 14 - legendX), top - 4, "لایه‌ها — شمارهٔ راهنما روی مقطع", 1.75, { anchor: "end", gray: 0.45 });
  rows.forEach((row, index) => {
    const rowY = top + 2 + index * 4.4;
    marker(scene, secX - 16, rowY - 0.7, index + 1);
    scene.text(legendX + (secX - 21 - legendX), rowY, `${row.label} — ${faNumber(row.cm, Number.isInteger(row.cm) ? 0 : 1)} سانتی‌متر`, 1.8, {
      anchor: "end",
      gray: 0.2,
    });
  });
}

/* ─────────────────────────── برگهٔ جزئیات معماری ─────────────────────────── */

export function archDetailScene(doc: StudioDocument): Scene {
  const size = sheetSizeMm(doc);
  const sheet = { width: size.w, height: size.h };
  const area = {
    x: MARGIN + 3,
    y: MARGIN + HEADER_H + 4,
    w: size.w - (MARGIN + 3) * 2,
    h: size.h - HEADER_H - FOOTER_H - MARGIN * 2 - 6,
  };
  const scene = new Scene();
  drawArchChrome(scene, doc, sheet);

  const notesH = 26;
  const gridH = area.h - notesH;
  const cellW = area.w / 2;
  const cellH = gridH / 2;

  ARCH_DETAILS.forEach((detail, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = area.x + col * cellW;
    const y = area.y + row * cellH;
    scene.text(x + cellW - 8, y + 5, detail.title, 2.9, { anchor: "end", bold: true, gray: 0.12 });
    scene.text(x + cellW - 8, y + 9.4, detail.note, 1.75, { anchor: "end", gray: 0.45 });

    // مقطع در سمت چپ سلول، ستون برچسب در سمت راست
    // چیدمان داخل سلول (راست‌به‌چپ): عنوان بالای راست، مقطع در راست، فهرست لایه‌ها در چپ
    const sectionTop = y + 15;
    const extent = Math.min(cellH - 40, 64);
    const factor = detail.scale / 1000;
    const bandTotal = detail.bands.reduce((sum, band) => sum + Math.max(1.2, band.thickness * factor), 0);
    const rightEdge = x + cellW - 9;
    if (detail.direction === "horizontal") {
      const secX = rightEdge - bandTotal;
      drawSection(scene, {
        scale: detail.scale,
        x: secX,
        y: sectionTop,
        direction: "horizontal",
        bands: detail.bands,
        extent,
      });
      drawLayerLegend(scene, detail.bands, x + 10, sectionTop + 6, secX - 18 - x);
    } else if (detail.title.includes("جان‌پناه")) {
      drawParapetDetail(scene, x, y, cellW, x + 10, sectionTop);
    } else {
      const secX = rightEdge - extent;
      drawSection(scene, {
        scale: detail.scale,
        x: secX,
        y: sectionTop,
        direction: "vertical",
        bands: detail.bands,
        extent,
      });
      drawLayerLegend(scene, detail.bands, x + 10, sectionTop + 6, secX - 18 - x);
    }
  });

  // نوار یادداشت‌های فنی
  const notesTop = area.y + gridH + 2;
  scene.line(area.x, notesTop, area.x + area.w, notesTop, { width: 0.25, gray: 0.5 });
  scene.text(area.x + area.w, notesTop + 5, "یادداشت‌های فنی", 2.4, { anchor: "end", bold: true, gray: 0.2 });
  const notes = [
    "۱) همهٔ مقاطع با مقیاس ۱:۵ رسم شده‌اند؛ اعداد روی مقطع، ضخامت واقعی لایه‌ها به سانتی‌متر است.",
    "۲) عایق رطوبتی سرویس تا ۱۵ سانتی‌متر روی کف بالا می‌آید و لبه‌ها با نوار گوشه تقویت می‌شود.",
    "۳) ضخامت لایه‌ها «نمونهٔ متعارف» است؛ اولویت با مشخصات فنی و دفترچهٔ پروژه است.",
  ];
  notes.forEach((note, index) => {
    scene.text(area.x + area.w - 2, notesTop + 10.5 + index * 4.4, note, 1.9, { anchor: "end", gray: 0.35 });
  });

  return scene;
}

/** کادر و کتیبهٔ برگه (همان زبان بصری برگهٔ جزئیات سازه). */
function drawArchChrome(scene: Scene, doc: StudioDocument, sheet: { width: number; height: number }): void {
  scene.rect(MARGIN, MARGIN, sheet.width - MARGIN * 2, sheet.height - MARGIN * 2, { width: 0.45, gray: 0.45 });
  scene.rect(MARGIN + 3, MARGIN + 3, sheet.width - (MARGIN + 3) * 2, sheet.height - (MARGIN + 3) * 2, { width: 0.2, gray: 0.7 });
  scene.text(sheet.width - MARGIN - 4, MARGIN + 9, `${doc.project.code} · ${doc.project.name}`, 5.2, { anchor: "end", bold: true });
  scene.text(sheet.width - MARGIN - 4, MARGIN + 14, `جزئیات اجرایی معماری · ${doc.sheet.format} · ویرایش ${doc.revision}`, 2.8, { anchor: "end", gray: 0.4 });
  scene.text(MARGIN + 4, MARGIN + 9, documentFingerprint(doc), 2.4, { direction: "ltr", gray: 0.5 });
  scene.line(MARGIN + 3, MARGIN + HEADER_H + 2, sheet.width - MARGIN - 3, MARGIN + HEADER_H + 2, { width: 0.35, gray: 0.4 });

  const top = sheet.height - MARGIN - FOOTER_H;
  scene.line(MARGIN + 3, top, sheet.width - MARGIN - 3, top, { width: 0.45, gray: 0.3 });
  const cols = [
    { title: "پروژه", value: doc.project.name, sub: `${doc.project.code} · کارفرما: ${doc.project.client || "—"}` },
    { title: "نقشه", value: "جزئیات اجرایی معماری", sub: `ویرایش ${doc.revision} · ${todayJalali()}` },
    { title: "برگه", value: `${doc.sheet.format} · افقی`, sub: "مقیاس مقاطع: ۱:۵" },
    { title: "طراح / کنترل", value: doc.project.designer || "—", sub: `${doc.project.date} · کنترل نهایی با مهندس دارای صلاحیت` },
  ];
  const startX = MARGIN + 3;
  const colW = (sheet.width - (MARGIN + 3) * 2) / cols.length;
  cols.forEach((col, index) => {
    const x0 = startX + index * colW;
    if (index > 0) scene.line(x0, top, x0, top + FOOTER_H, { width: 0.25, gray: 0.45 });
    scene.text(x0 + colW - 3, top + 5, col.title, 2.2, { anchor: "end", gray: 0.45 });
    scene.text(x0 + colW - 3, top + 12, col.value, 3.4, { anchor: "end", bold: true });
    scene.text(x0 + colW - 3, top + 17, col.sub, 2.1, { anchor: "end", gray: 0.4 });
  });
}

/** برگهٔ جزئیات معماری به‌صورت SVG کامل. */
export function renderStudioArchDetailSheet(doc: StudioDocument): string {
  const size = sheetSizeMm(doc);
  const scene = archDetailScene(doc);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}mm" height="${size.h}mm" viewBox="0 0 ${size.w} ${size.h}">
  <rect width="${size.w}" height="${size.h}" fill="#ffffff"/>
  ${sceneSvg(scene)}
</svg>`;
}

/** برگهٔ جزئیات معماری به‌صورت PDF (فونت فارسی جاسازی‌شده). */
export function renderStudioArchDetailPdf(doc: StudioDocument): Uint8Array {
  const size = sheetSizeMm(doc);
  const area = {
    x: MARGIN + 3,
    y: MARGIN + HEADER_H + 4,
    w: size.w - (MARGIN + 3) * 2,
    h: size.h - HEADER_H - FOOTER_H - MARGIN * 2 - 6,
  };
  const scene = archDetailScene(doc);
  const text = new PdfText(loadTypeface("regular"), loadTypeface("bold"));
  const layout: SheetLayout = {
    widthMm: size.w,
    heightMm: size.h,
    mmPerMetre: 200, // ۱:۵
    requestedScale: 5,
    fitted: false,
    areaMm: area,
    titleBlock: { x: MARGIN + 3, y: size.h - MARGIN - FOOTER_H, w: size.w - (MARGIN + 3) * 2, h: FOOTER_H },
    bounds: { x: 0, y: 0, w: size.w, h: size.h },
  };
  return assemblePdf([{ ops: scenePdfOps(scene, size.h, text), layout }], text, doc);
}

/** برگهٔ جزئیات معماری به‌صورت DXF (۱:۱ روی کاغذ، لایه‌بندی برگه). */
export function renderStudioArchDetailDxf(doc: StudioDocument): string {
  const size = sheetSizeMm(doc);
  return sceneToDxf(archDetailScene(doc), { widthMm: size.w, heightMm: size.h });
}
