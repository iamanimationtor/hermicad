/**
 * HERMICAD Studio — تبدیل صحنهٔ برگه (Scene) به DXF
 *
 * چرا وجود دارد: برگه‌های «جزئیات سازه»، «جدول‌ها» و «نما/برش» با موتور ترسیم
 * مشترک `draw.ts` ساخته می‌شوند (SVG/PDF). دفاتر فنی همان برگه را برای
 * ادامهٔ کار در اتوکد می‌خواهند. اگر برای هر برگه یک تبدیل جداگانه می‌نوشتیم،
 * DXF با SVG/PDF اختلاف پیدا می‌کرد؛ پس یک تبدیل عمومی «صحنه → DXF» داریم که
 * از همان منبع می‌خواند.
 *
 * قواعد تبدیل:
 *  • مختصات صحنه میلی‌متر است، DXF بر حسب متر ($INSUNITS = 6) → تقسیم بر ۱۰۰۰.
 *  • محور Y در صحنه رو به پایین است و در DXF رو به بالا → آینه می‌شود.
 *  • پرشدگی‌ها HATCH توپر می‌شوند (نه SOLID) تا دایره هم درست پر شود.
 *  • متن‌ها با `dxfText` (شکل نمایشی RTL) و تراز افقی صحیح نوشته می‌شوند.
 *  • هر نقش، لایهٔ خودش را دارد تا در اتوکد قابل خاموش/روشن کردن باشد.
 */

import { STUDIO_LAYERS } from "./catalog";
import { Scene, type Prim } from "./draw";
import { DxfWriter, dxfText, type DxfLayer } from "./dxf";

const MM = 1000;

/** لایه‌های برگه؛ رنگ‌ها بر پایهٔ ACI (۷ = مشکی/سفید، ۲۵۳ = خاکستری روشن). */
const SHEET_LAYERS: DxfLayer[] = [
  { name: "SHEET", color: 7 },
  { name: "GEOMETRY", color: 7 },
  { name: "HATCH", color: 253 },
  { name: "TEXT", color: 7 },
  { name: "REBAR", color: 1 },
];

/** لایه‌های مدل (پلان) برای صحنه‌هایی که `data-layer` دارند. */
const MODEL_LAYERS: DxfLayer[] = STUDIO_LAYERS.map((layer) => ({
  name: layer.id.toUpperCase(),
  color: 7,
}));

export interface SceneDxfOptions {
  /** عرض و ارتفاع برگه (میلی‌متر) برای آینه‌کردن محور Y. */
  widthMm: number;
  heightMm: number;
}

const LAYER_NAMES = new Set([...SHEET_LAYERS, ...MODEL_LAYERS].map((layer) => layer.name));

/** لایهٔ هر نقش: قاب و جدول عنوان، هاشور، متن یا هندسه. */
function layerOf(prim: Prim): string {
  if (prim.data) {
    const match = /data-layer="([a-z-]+)"/.exec(prim.data);
    if (match) {
      const name = match[1].toUpperCase();
      if (LAYER_NAMES.has(name)) return name;
    }
  }
  if ("fill" in prim && prim.fill != null) return "HATCH";
  if (prim.kind === "text") return "TEXT";
  if (prim.data && /data-(frame|title-block)/.test(prim.data)) return "SHEET";
  return "GEOMETRY";
}

/** نقش‌هایی که باید ضمن حفظ، پرشدگی هم بگیرند (قاب هاشور و خط دور). */
function pushFill(writer: DxfWriter, prim: Prim): void {
  // ناحیهٔ بافت: هاشور الگودار (بتن/بنایی) به‌جای پرشدگی توپر
  if (prim.pattern && prim.kind === "rect") {
    writer.patternHatch(
      [
        [prim.x / MM, prim.y / MM],
        [(prim.x + prim.w) / MM, prim.y / MM],
        [(prim.x + prim.w) / MM, (prim.y + prim.h) / MM],
        [prim.x / MM, (prim.y + prim.h) / MM],
      ],
      "HATCH",
      prim.pattern,
    );
    return;
  }
  if (!("fill" in prim) || prim.fill == null) return;
  if (prim.kind === "rect") {
    writer.solidHatch(
      [
        [prim.x / MM, prim.y / MM],
        [(prim.x + prim.w) / MM, prim.y / MM],
        [(prim.x + prim.w) / MM, (prim.y + prim.h) / MM],
        [prim.x / MM, (prim.y + prim.h) / MM],
      ],
      "HATCH",
    );
  } else if (prim.kind === "poly" && prim.points.length >= 3) {
    writer.solidHatch(
      prim.points.map(([x, y]) => [x / MM, y / MM] as [number, number]),
      "HATCH",
    );
  } else if (prim.kind === "circle") {
    writer.circleHatch(prim.cx / MM, prim.cy / MM, prim.r / MM, "HATCH");
  }
}

/**
 * تبدیل یک صحنهٔ برگه به فایل DXF کامل (R2000).
 * خروجی رشتهٔ متنی DXF است؛ همان چیزی که `DxfWriter.build()` می‌دهد.
 */
export function sceneToDxf(scene: Scene, options: SceneDxfOptions): string {
  const height = options.heightMm;
  const flip = (y: number): number => (height - y) / MM;

  const writer = new DxfWriter([...SHEET_LAYERS, ...MODEL_LAYERS]);

  // هاشورها اول نوشته می‌شوند تا خطوط روی آن‌ها بیفتند (ترتیب رسم در CAD).
  for (const prim of scene.prims) pushFill(writer, prim);

  for (const prim of scene.prims) {
    // خطوط هاشور الگودار و کادر ناحیهٔ بافت در DXF نوشته نمی‌شوند:
    // الگوی HATCH همان نقش را با موجودیت استاندارد بازی می‌کند.
    if (prim.pattern || (prim.data ?? "").includes("data-hatch-line")) continue;
    const layer = layerOf(prim);
    switch (prim.kind) {
      case "line":
        writer.line(prim.x1 / MM, flip(prim.y1), prim.x2 / MM, flip(prim.y2), layer);
        break;
      case "rect":
        writer.polyline(
          [
            [prim.x / MM, flip(prim.y)],
            [(prim.x + prim.w) / MM, flip(prim.y)],
            [(prim.x + prim.w) / MM, flip(prim.y + prim.h)],
            [prim.x / MM, flip(prim.y + prim.h)],
          ],
          layer,
          true,
        );
        break;
      case "poly": {
        const points = prim.points.map(([x, y]) => [x / MM, flip(y)] as [number, number]);
        if (prim.closed === false) {
          writer.polyline(points, layer, false);
        } else {
          writer.polyline(points, layer, true);
        }
        break;
      }
      case "circle":
        writer.circle(prim.cx / MM, flip(prim.cy), prim.r / MM, layer);
        break;
      case "text": {
        // اندازهٔ متن در DXF «ارتفاع حرف» است؛ اندازهٔ صحنه فاصلهٔ خط پایه است.
        const textHeight = Math.max(0.4, prim.size * 0.72) / MM;
        const align = prim.anchor === "middle" ? "center" : prim.anchor === "end" ? "right" : "left";
        writer.text(prim.x / MM, flip(prim.y), textHeight, dxfText(prim.value), layer, {
          align,
          rotation: prim.rotate ? -prim.rotate : undefined,
        });
        break;
      }
    }
  }

  return writer.build({ minX: 0, minY: 0, maxX: options.widthMm / MM, maxY: options.heightMm / MM });
}

/** صحنهٔ خالی فقط برای آزمون/پیش‌نمایش. */
export function emptyScene(): Scene {
  return new Scene();
}
