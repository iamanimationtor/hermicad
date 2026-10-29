/**
 * HERMICAD Studio — «صحنهٔ ترسیم» مشترک بین SVG و PDF
 *
 * چرا وجود دارد: اگر جزئیات اجرایی را یک بار برای SVG و یک بار برای PDF بنویسیم،
 * دیر یا زود دو نسخه از هم جدا می‌شوند (همان اشتباهی که در نما/برش با استخراج
 * `viewGeometry` جلوی آن گرفته شد). این ماژول زبان مشترک ترسیم است:
 *
 *   خط، مستطیل، چندضلعی، دایره، هاشور و متن — با مختصات میلی‌متر و مبدأ بالا-چپ
 *
 * یک بار صحنه ساخته می‌شود، بعد به SVG یا به عملگرهای PDF تبدیل می‌شود. رنگ‌ها
 * عمداً «خاکستری» تعریف شده‌اند تا برگهٔ چاپی سیاه‌وسفید همیشه همان چیزی باشد که
 * روی صفحه دیده می‌شود.
 */

import type { PdfText } from "./pdf/text";

const MM_TO_PT = 72 / 25.4;

export type Anchor = "start" | "middle" | "end";

interface Base {
  /** خاکستری ۰ (سیاه) تا ۱ (سفید) */
  gray?: number;
  /**
   * رنگ خط برای خروجی SVG (مثل `#0ea5e9`). PDF سیاه‌وسفید چاپ می‌شود، پس رنگ
   * با روشنایی به خاکستری هم‌ارز تبدیل می‌شود؛ بنابراین یک صحنه هم رنگ صفحه را
   * می‌دهد و هم برگهٔ چاپی معتبر.
   */
  color?: string;
  width?: number;
  dash?: [number, number];
  /** شفافیت ۰..۱ (در PDF با روشن‌کردن خاکستری شبیه‌سازی می‌شود) */
  opacity?: number;
  /** صفت‌های data-* برای قلاب آزمون/انتخاب در SVG */
  data?: string;
  /**
   * بافت مقطع برای خروجی DXF: بتن یا بنایی. در SVG همان خطوط هاشور دیده می‌شود،
   * اما در اتوکد به‌جای پرشدگی توپر، HATCH الگودار (ANSI31 / AR-B816) نوشته می‌شود.
   */
  pattern?: HatchPattern;
}

/** بافت‌های مقطعی که به الگوی هاشور DXF نگاشت می‌شوند. */
export type HatchPattern = "concrete" | "masonry";

export type Prim =
  | ({ kind: "line"; x1: number; y1: number; x2: number; y2: number } & Base)
  | ({ kind: "rect"; x: number; y: number; w: number; h: number; fill?: number | null; fillColor?: string } & Base)
  | ({ kind: "poly"; points: [number, number][]; fill?: number | null; fillColor?: string; closed?: boolean } & Base)
  | ({ kind: "circle"; cx: number; cy: number; r: number; fill?: number | null; fillColor?: string } & Base)
  | ({
      kind: "text";
      x: number;
      y: number;
      value: string;
      size: number;
      anchor?: Anchor;
      bold?: boolean;
      direction?: "rtl" | "ltr";
      rotate?: number;
    } & Base);

/** صحنهٔ ترسیم با مختصات میلی‌متری. */
export class Scene {
  readonly prims: Prim[] = [];

  line(x1: number, y1: number, x2: number, y2: number, options: Base = {}): void {
    this.prims.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      gray: options.gray ?? 0.1,
      color: options.color,
      width: options.width ?? 0.25,
      dash: options.dash,
      opacity: options.opacity,
      data: options.data,
    });
  }

  rect(x: number, y: number, w: number, h: number, options: Base & { fill?: number | null; fillColor?: string } = {}): void {
    this.prims.push({
      kind: "rect",
      x,
      y,
      w,
      h,
      fill: options.fill ?? null,
      fillColor: options.fillColor,
      gray: options.gray ?? 0.1,
      color: options.color,
      width: options.width ?? 0.25,
      dash: options.dash,
      opacity: options.opacity,
      data: options.data,
    });
  }

  poly(
    points: [number, number][],
    options: Base & { fill?: number | null; fillColor?: string; closed?: boolean } = {},
  ): void {
    if (points.length < 2) return;
    this.prims.push({
      kind: "poly",
      points,
      fill: options.fill ?? null,
      fillColor: options.fillColor,
      closed: options.closed ?? true,
      gray: options.gray ?? 0.1,
      color: options.color,
      width: options.width ?? 0.25,
      dash: options.dash,
      opacity: options.opacity,
      data: options.data,
    });
  }

  circle(cx: number, cy: number, r: number, options: Base & { fill?: number | null; fillColor?: string } = {}): void {
    this.prims.push({
      kind: "circle",
      cx,
      cy,
      r,
      fill: options.fill ?? null,
      fillColor: options.fillColor,
      gray: options.gray ?? 0.1,
      color: options.color,
      width: options.width ?? 0.25,
      opacity: options.opacity,
      data: options.data,
    });
  }

  text(
    x: number,
    y: number,
    value: string,
    size: number,
    options: Base & { anchor?: Anchor; bold?: boolean; direction?: "rtl" | "ltr"; rotate?: number } = {},
  ): void {
    if (!value.trim()) return;
    this.prims.push({
      kind: "text",
      x,
      y,
      value,
      size,
      anchor: options.anchor ?? "start",
      bold: options.bold ?? false,
      direction: options.direction ?? "rtl",
      rotate: options.rotate,
      gray: options.gray ?? 0.1,
      color: options.color,
      opacity: options.opacity,
      data: options.data,
    });
  }

  /**
   * هاشور مورب ۴۵ درجه داخل مستطیل.
   * هر خط با پارامتر `t` (حرکت روی قطر کادر) دقیقاً به کادر بریده می‌شود تا
   * هیچ خطی از لبه بیرون نزند — همان چیزی که در نقشه‌های اجرایی لازم است.
   */
  hatch(x: number, y: number, w: number, h: number, step = 2, options: Base = {}): void {
    if (w <= 0 || h <= 0) return;
    const gray = options.gray ?? 0.65;
    const width = options.width ?? 0.15;
    const pattern = options.pattern;
    if (pattern) {
      // ناحیهٔ بافت: در SVG بی‌رنگ است، در DXF به HATCH الگودار تبدیل می‌شود
      this.prims.push({
        kind: "rect",
        x,
        y,
        w,
        h,
        fill: null,
        width: 0,
        gray: 1,
        pattern,
        data: `data-hatch-region="${pattern}"`,
      });
    }
    for (let offset = 0; offset <= w + h; offset += step) {
      const from = Math.max(0, offset - w);
      const to = Math.min(h, offset);
      if (to - from < 0.2) continue;
      // خطوط هاشور در DXF نوشته نمی‌شوند (الگوی HATCH جای آن‌ها را می‌گیرد)
      this.line(x + offset - from, y + from, x + offset - to, y + to, {
        gray,
        width,
        data: pattern ? 'data-hatch-line="1"' : undefined,
      });
    }
  }
}

/* ───────────────────────────── SVG ───────────────────────────── */

const num = (value: number): string => String(Math.round(value * 1000) / 1000);
const grayColor = (gray: number): string => {
  const channel = Math.round(Math.max(0, Math.min(1, gray)) * 255);
  return `rgb(${channel},${channel},${channel})`;
};

/** تبدیل صحنه به بدنهٔ SVG (بدون تگ svg بیرونی). */
export function sceneSvg(scene: Scene): string {
  return scene.prims
    .map((prim) => {
      const stroke = prim.color ?? grayColor(prim.gray ?? 0.1);
      const dash = prim.dash ? ` stroke-dasharray="${num(prim.dash[0])} ${num(prim.dash[1])}"` : "";
      const width = ` stroke-width="${num(prim.width ?? 0.25)}"`;
      const opacity = prim.opacity != null && prim.opacity < 1 ? ` opacity="${num(prim.opacity)}"` : "";
      const data = prim.data ? ` ${prim.data}` : "";
      const fillOf = (fill?: number | null, fillColor?: string) =>
        fillColor ?? (fill != null ? grayColor(fill) : "none");
      switch (prim.kind) {
        case "line":
          return `<line x1="${num(prim.x1)}" y1="${num(prim.y1)}" x2="${num(prim.x2)}" y2="${num(prim.y2)}" stroke="${stroke}"${width}${dash}${opacity}${data}/>`;
        case "rect": {
          const fill = fillOf(prim.fill, prim.fillColor);
          return `<rect x="${num(prim.x)}" y="${num(prim.y)}" width="${num(prim.w)}" height="${num(prim.h)}" fill="${fill}" stroke="${stroke}"${width}${dash}${opacity}${data}/>`;
        }
        case "poly": {
          const fill = fillOf(prim.fill, prim.fillColor);
          const points = prim.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");
          if (prim.closed === false) {
            return `<polyline points="${points}" fill="${fill}" stroke="${stroke}"${width}${dash}${opacity}${data}/>`;
          }
          return `<polygon points="${points}" fill="${fill}" stroke="${stroke}"${width}${dash}${opacity}${data}/>`;
        }
        case "circle": {
          const fill = fillOf(prim.fill, prim.fillColor);
          return `<circle cx="${num(prim.cx)}" cy="${num(prim.cy)}" r="${num(prim.r)}" fill="${fill}" stroke="${stroke}"${width}${opacity}${data}/>`;
        }
        case "text": {
          /*
           * لنگر متن در صحنه «مطلق» است: start یعنی متن از x به راست، end یعنی متن
           * به چپِ x کشیده می‌شود، middle یعنی x مرکز متن است. نقاش PDF و رندرگر
           * PNG همین قرارداد را دارند.
           *
           * چرا `direction` صریح نوشته نمی‌شود: در SVG، مقدار start/end نسبت به
           * «جهت پایه» تعبیر می‌شود؛ مرورگرها با direction="rtl" آن را آینه
           * می‌کنند ولی رندرگرهای غیرمرورگری (resvg و نویسندهٔ PDF) آن را مطلق
           * می‌گیرند. نتیجهٔ قبلی این بود که نقشهٔ روی صفحه با فایل PDF یکی نبود و
           * برچسب‌ها روی خط راهنما می‌افتادند. ترتیب داخلی حروف فارسی به‌کمک
           * الگوریتم دوسویه (bidi) انجام می‌شود و به direction نیاز ندارد؛
           * unicode-bidi="plaintext" هم ترتیبِ رشته‌های ترکیبی فارسی/لاتین را
           * بر پایهٔ نخستین نویسهٔ قوی تعیین می‌کند.
           */
          const anchor = ` text-anchor="${prim.anchor ?? "start"}"`;
          const weight = prim.bold ? ' font-weight="700"' : "";
          const rotate = prim.rotate ? ` transform="rotate(${num(prim.rotate)} ${num(prim.x)} ${num(prim.y)})"` : "";
          const escaped = prim.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `<text x="${num(prim.x)}" y="${num(prim.y)}" font-size="${num(prim.size)}" fill="${stroke}" font-family="Vazirmatn, Tahoma, sans-serif"${anchor}${weight} unicode-bidi="plaintext"${rotate}${opacity}${data}>${escaped}</text>`;
        }
      }
    })
    .join("");
}

/* ───────────────────────────── PDF ───────────────────────────── */

/** تبدیل صحنه به عملگرهای PDF (مختصات میلی‌متر، صفحه با ارتفاع داده‌شده). */
/**
 * رنگ صفحه (hex یا rgba) به خاکستری چاپی.
 *
 * چرا: برگهٔ PDF برای چاپ تک‌رنگ ساخته می‌شود؛ اگر رنگ‌های صفحه بی‌تبدیل به PDF
 * بروند، دستگاه چاپ آن‌ها را به سیاه یکدست تبدیل می‌کند و تفکیک لایه‌ها از بین
 * می‌رود. با روشنایی (luma) همان سلسله‌مراتبی که روی صفحه دیده می‌شود حفظ می‌شود.
 */
export function colorToGray(color: string): number | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = parseInt(hex[1], 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 100) / 100;
  }
  const rgba = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color.trim());
  if (rgba) {
    const [r, g, b] = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
    return Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 100) / 100;
  }
  return null;
}

/** روشن‌کردن خاکستری برای شبیه‌سازی شفافیت روی کاغذ سفید. */
const applyOpacity = (gray: number, opacity?: number): number =>
  opacity == null || opacity >= 1 ? gray : Math.round((1 - (1 - gray) * opacity) * 100) / 100;

export function scenePdfOps(scene: Scene, heightMm: number, text: PdfText): string[] {
  const ops: string[] = [];
  const toPt = (x: number, y: number) => ({ x: x * MM_TO_PT, y: heightMm * MM_TO_PT - y * MM_TO_PT });
  const dash = (value?: [number, number]) =>
    value ? `[${value.map((part) => (part * MM_TO_PT).toFixed(2)).join(" ")}] 0 d` : "[] 0 d";

  for (const prim of scene.prims) {
    const gray = applyOpacity(prim.color ? (colorToGray(prim.color) ?? (prim.gray ?? 0.1)) : (prim.gray ?? 0.1), prim.opacity);
    const widthPt = ((prim.width ?? 0.25) * MM_TO_PT).toFixed(2);
    if (prim.kind === "text") {
      const at = toPt(prim.x, prim.y);
      text.draw(ops, at, prim.value, {
        sizePt: prim.size * MM_TO_PT,
        gray,
        anchor: prim.anchor ?? "start",
        bold: prim.bold ?? false,
        direction: prim.direction ?? "rtl",
        rotateDeg: prim.rotate ?? 0,
      });
      continue;
    }
    if (prim.kind === "line") {
      const a = toPt(prim.x1, prim.y1);
      const b = toPt(prim.x2, prim.y2);
      ops.push(
        `${dash(prim.dash)} ${gray} ${gray} ${gray} RG ${widthPt} w ${a.x.toFixed(2)} ${a.y.toFixed(2)} m ${b.x.toFixed(2)} ${b.y.toFixed(2)} l S`,
      );
      continue;
    }
    // خاکستری پرشدگی: یا رنگ پرشدگی (تبدیل‌شده) یا خاکستری صریح
    const fillGray =
      "fillColor" in prim && prim.fillColor
        ? colorToGray(prim.fillColor)
        : (prim as { fill?: number | null }).fill ?? null;
    if (prim.kind === "rect") {
      if (prim.w <= 0 || prim.h <= 0) continue;
      const corner = toPt(prim.x, prim.y);
      if (fillGray != null) ops.push(`${fillGray} ${fillGray} ${fillGray} rg`);
      ops.push(
        `${dash(prim.dash)} ${gray} ${gray} ${gray} RG ${widthPt} w ` +
          `${corner.x.toFixed(2)} ${(corner.y - prim.h * MM_TO_PT).toFixed(2)} ${(prim.w * MM_TO_PT).toFixed(2)} ${(prim.h * MM_TO_PT).toFixed(2)} re ` +
          (fillGray != null ? "B" : "S"),
      );
      continue;
    }
    if (prim.kind === "poly") {
      const points = prim.points.map(([x, y]) => toPt(x, y));
      if (points.length < 2) continue;
      if (fillGray != null) ops.push(`${fillGray} ${fillGray} ${fillGray} rg`);
      ops.push(`${dash(prim.dash)} ${gray} ${gray} ${gray} RG ${widthPt} w ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} m`);
      for (const point of points.slice(1)) ops.push(`${point.x.toFixed(2)} ${point.y.toFixed(2)} l`);
      if (prim.closed !== false) ops.push("h");
      ops.push(fillGray != null ? "b" : "S");
      continue;
    }
    // دایره با چهار منحنی بزیه
    const c = toPt(prim.cx, prim.cy);
    const r = prim.r * MM_TO_PT;
    const k = 0.5523 * r;
    if (fillGray != null) ops.push(`${fillGray} ${fillGray} ${fillGray} rg`);
    ops.push(
      `${gray} ${gray} ${gray} RG ${widthPt} w ${(c.x + r).toFixed(2)} ${c.y.toFixed(2)} m`,
      `${(c.x + r).toFixed(2)} ${(c.y + k).toFixed(2)} ${(c.x + k).toFixed(2)} ${(c.y + r).toFixed(2)} ${c.x.toFixed(2)} ${(c.y + r).toFixed(2)} c`,
      `${(c.x - k).toFixed(2)} ${(c.y + r).toFixed(2)} ${(c.x - r).toFixed(2)} ${(c.y + k).toFixed(2)} ${(c.x - r).toFixed(2)} ${c.y.toFixed(2)} c`,
      `${(c.x - r).toFixed(2)} ${(c.y - k).toFixed(2)} ${(c.x - k).toFixed(2)} ${(c.y - r).toFixed(2)} ${c.x.toFixed(2)} ${(c.y - r).toFixed(2)} c`,
      `${(c.x + k).toFixed(2)} ${(c.y - r).toFixed(2)} ${(c.x + r).toFixed(2)} ${(c.y - k).toFixed(2)} ${(c.x + r).toFixed(2)} ${c.y.toFixed(2)} c h`,
      fillGray != null ? "b" : "S",
    );
  }
  return ops;
}
