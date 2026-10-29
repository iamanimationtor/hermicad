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
  width?: number;
  dash?: [number, number];
}

export type Prim =
  | ({ kind: "line"; x1: number; y1: number; x2: number; y2: number } & Base)
  | ({ kind: "rect"; x: number; y: number; w: number; h: number; fill?: number | null } & Base)
  | ({ kind: "poly"; points: [number, number][]; fill?: number | null; closed?: boolean } & Base)
  | ({ kind: "circle"; cx: number; cy: number; r: number; fill?: number | null } & Base)
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
    this.prims.push({ kind: "line", x1, y1, x2, y2, gray: options.gray ?? 0.1, width: options.width ?? 0.25, dash: options.dash });
  }

  rect(x: number, y: number, w: number, h: number, options: Base & { fill?: number | null } = {}): void {
    this.prims.push({
      kind: "rect",
      x,
      y,
      w,
      h,
      fill: options.fill ?? null,
      gray: options.gray ?? 0.1,
      width: options.width ?? 0.25,
      dash: options.dash,
    });
  }

  poly(points: [number, number][], options: Base & { fill?: number | null; closed?: boolean } = {}): void {
    if (points.length < 2) return;
    this.prims.push({
      kind: "poly",
      points,
      fill: options.fill ?? null,
      closed: options.closed ?? true,
      gray: options.gray ?? 0.1,
      width: options.width ?? 0.25,
      dash: options.dash,
    });
  }

  circle(cx: number, cy: number, r: number, options: Base & { fill?: number | null } = {}): void {
    this.prims.push({ kind: "circle", cx, cy, r, fill: options.fill ?? null, gray: options.gray ?? 0.1, width: options.width ?? 0.25 });
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
    for (let offset = 0; offset <= w + h; offset += step) {
      const from = Math.max(0, offset - w);
      const to = Math.min(h, offset);
      if (to - from < 0.2) continue;
      this.line(x + offset - from, y + from, x + offset - to, y + to, { gray, width });
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
      const stroke = grayColor(prim.gray ?? 0.1);
      const dash = prim.dash ? ` stroke-dasharray="${num(prim.dash[0])} ${num(prim.dash[1])}"` : "";
      const width = ` stroke-width="${num(prim.width ?? 0.25)}"`;
      switch (prim.kind) {
        case "line":
          return `<line x1="${num(prim.x1)}" y1="${num(prim.y1)}" x2="${num(prim.x2)}" y2="${num(prim.y2)}" stroke="${stroke}"${width}${dash}/>`;
        case "rect": {
          const fill = prim.fill != null ? grayColor(prim.fill) : "none";
          return `<rect x="${num(prim.x)}" y="${num(prim.y)}" width="${num(prim.w)}" height="${num(prim.h)}" fill="${fill}" stroke="${stroke}"${width}${dash}/>`;
        }
        case "poly": {
          const fill = prim.fill != null ? grayColor(prim.fill) : "none";
          const points = prim.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");
          return `<polygon points="${points}" fill="${fill}" stroke="${stroke}"${width}${dash}/>`;
        }
        case "circle": {
          const fill = prim.fill != null ? grayColor(prim.fill) : "none";
          return `<circle cx="${num(prim.cx)}" cy="${num(prim.cy)}" r="${num(prim.r)}" fill="${fill}" stroke="${stroke}"${width}/>`;
        }
        case "text": {
          const anchor = prim.anchor ? ` text-anchor="${prim.anchor}"` : "";
          const weight = prim.bold ? ' font-weight="700"' : "";
          const direction = ` direction="${prim.direction ?? "rtl"}"`;
          const rotate = prim.rotate ? ` transform="rotate(${num(prim.rotate)} ${num(prim.x)} ${num(prim.y)})"` : "";
          const escaped = prim.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `<text x="${num(prim.x)}" y="${num(prim.y)}" font-size="${num(prim.size)}" fill="${stroke}" font-family="Vazirmatn, Tahoma, sans-serif"${anchor}${weight}${direction}${rotate}>${escaped}</text>`;
        }
      }
    })
    .join("");
}

/* ───────────────────────────── PDF ───────────────────────────── */

/** تبدیل صحنه به عملگرهای PDF (مختصات میلی‌متر، صفحه با ارتفاع داده‌شده). */
export function scenePdfOps(scene: Scene, heightMm: number, text: PdfText): string[] {
  const ops: string[] = [];
  const toPt = (x: number, y: number) => ({ x: x * MM_TO_PT, y: heightMm * MM_TO_PT - y * MM_TO_PT });
  const dash = (value?: [number, number]) =>
    value ? `[${value.map((part) => (part * MM_TO_PT).toFixed(2)).join(" ")}] 0 d` : "[] 0 d";

  for (const prim of scene.prims) {
    const gray = prim.gray ?? 0.1;
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
    if (prim.kind === "rect") {
      if (prim.w <= 0 || prim.h <= 0) continue;
      const corner = toPt(prim.x, prim.y);
      if (prim.fill != null) ops.push(`${prim.fill} ${prim.fill} ${prim.fill} rg`);
      ops.push(
        `${dash(prim.dash)} ${gray} ${gray} ${gray} RG ${widthPt} w ` +
          `${corner.x.toFixed(2)} ${(corner.y - prim.h * MM_TO_PT).toFixed(2)} ${(prim.w * MM_TO_PT).toFixed(2)} ${(prim.h * MM_TO_PT).toFixed(2)} re ` +
          (prim.fill != null ? "B" : "S"),
      );
      continue;
    }
    if (prim.kind === "poly") {
      const points = prim.points.map(([x, y]) => toPt(x, y));
      if (points.length < 2) continue;
      if (prim.fill != null) ops.push(`${prim.fill} ${prim.fill} ${prim.fill} rg`);
      ops.push(`${dash(prim.dash)} ${gray} ${gray} ${gray} RG ${widthPt} w ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} m`);
      for (const point of points.slice(1)) ops.push(`${point.x.toFixed(2)} ${point.y.toFixed(2)} l`);
      if (prim.closed !== false) ops.push("h");
      ops.push(prim.fill != null ? "b" : "S");
      continue;
    }
    // دایره با چهار منحنی بزیه
    const c = toPt(prim.cx, prim.cy);
    const r = prim.r * MM_TO_PT;
    const k = 0.5523 * r;
    if (prim.fill != null) ops.push(`${prim.fill} ${prim.fill} ${prim.fill} rg`);
    ops.push(
      `${gray} ${gray} ${gray} RG ${widthPt} w ${(c.x + r).toFixed(2)} ${c.y.toFixed(2)} m`,
      `${(c.x + r).toFixed(2)} ${(c.y + k).toFixed(2)} ${(c.x + k).toFixed(2)} ${(c.y + r).toFixed(2)} ${c.x.toFixed(2)} ${(c.y + r).toFixed(2)} c`,
      `${(c.x - k).toFixed(2)} ${(c.y + r).toFixed(2)} ${(c.x - r).toFixed(2)} ${(c.y + k).toFixed(2)} ${(c.x - r).toFixed(2)} ${c.y.toFixed(2)} c`,
      `${(c.x - r).toFixed(2)} ${(c.y - k).toFixed(2)} ${(c.x - k).toFixed(2)} ${(c.y - r).toFixed(2)} ${c.x.toFixed(2)} ${(c.y - r).toFixed(2)} c`,
      `${(c.x + k).toFixed(2)} ${(c.y - r).toFixed(2)} ${(c.x + r).toFixed(2)} ${(c.y - k).toFixed(2)} ${(c.x + r).toFixed(2)} ${c.y.toFixed(2)} c`,
      prim.fill != null ? "b" : "S",
    );
  }
  return ops;
}
