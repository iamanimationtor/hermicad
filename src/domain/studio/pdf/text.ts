/**
 * لایهٔ متن PDF با فونت جاسازی‌شده
 *
 * همهٔ رسم متن در برگه‌های PDF از اینجا می‌گذرد تا:
 *  - متن فارسی با شکل درست و ترتیب دیداری نوشته شود (نه به‌هم‌ریخته)،
 *  - لنگر (چپ/وسط/راست) با عرض واقعی فونت محاسبه شود، نه حدس،
 *  - نگاشت گلیف‌ها برای «کپی متن از PDF» (ToUnicode) جمع شود.
 *
 * اگر فونت در دسترس نباشد، به Helvetica و متن لاتین برمی‌گردد؛ خروجی هرگز
 * نمی‌شکند، فقط فارسی خوانا نخواهد بود (و در مستندات هم صریح گفته شده).
 */

import { Typeface } from "./typeface";

export type TextAnchor = "start" | "middle" | "end";

export interface DrawTextOptions {
  sizePt: number;
  /** خاکستری ۰ (سیاه) تا ۱ (سفید) */
  gray?: number;
  anchor?: TextAnchor;
  bold?: boolean;
  /** متن‌های لاتین/عددی را چپ‌به‌راست بچین */
  direction?: "rtl" | "ltr";
  /** چرخش حول نقطهٔ لنگر (درجه، پادساعت‌گرد) — برای اندازه‌گذاری عمودی */
  rotateDeg?: number;
}

export class PdfText {
  readonly regular: Typeface | null;
  readonly bold: Typeface | null;
  private readonly usage = new Map<"regular" | "bold", Map<number, number[]>>([
    ["regular", new Map()],
    ["bold", new Map()],
  ]);

  constructor(regular: Typeface | null, bold: Typeface | null) {
    this.regular = regular;
    this.bold = bold && bold !== regular ? bold : null;
  }

  /** آیا متن فارسی قابل رسم است؟ */
  get fontReady(): boolean {
    return this.regular !== null;
  }

  fontName(bold = false): string {
    return bold && this.bold ? "/F2" : "/F1";
  }

  /** عرض متن بر حسب نقطه. */
  width(value: string, options: Pick<DrawTextOptions, "sizePt" | "bold" | "direction">): number {
    const direction = options.direction ?? "rtl";
    const typeface = options.bold && this.bold ? this.bold : this.regular;
    if (typeface) return typeface.widthOf(value, options.sizePt, direction);
    // تخمین برای مسیر پشتیبان
    return value.length * options.sizePt * 0.5;
  }

  /**
   * عملگرهای رسم یک متن را به `ops` اضافه می‌کند.
   * `at` بر حسب نقطه در دستگاه PDF (مبدأ پایین-چپ) است.
   */
  draw(ops: string[], at: { x: number; y: number }, value: string, options: DrawTextOptions): number {
    const clean = value.replace(/[\r\n]+/g, " ").trim();
    if (!clean) return 0;
    const gray = options.gray ?? 0.1;
    const size = options.sizePt;
    const direction = options.direction ?? "rtl";
    const typeface = options.bold && this.bold ? this.bold : this.regular;

    if (!typeface) {
      // مسیر پشتیبان: Helvetica با متن لاتین (فارسی حذف می‌شود تا فایل خراب نشود)
      const ascii = clean.replace(/[^\x20-\x7E]/g, "").trim();
      if (!ascii) return 0;
      const width = ascii.length * size * 0.5;
      const x = options.anchor === "end" ? at.x - width : options.anchor === "middle" ? at.x - width / 2 : at.x;
      ops.push(`BT ${gray} ${gray} ${gray} rg /F1 ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${at.y.toFixed(2)} Tm (${pdfEscape(ascii)}) Tj ET`);
      return width;
    }

    const encoded = typeface.encode(clean, direction);
    const width = (encoded.width1000 * size) / 1000;
    const x =
      options.anchor === "end" ? at.x - width : options.anchor === "middle" ? at.x - width / 2 : at.x;

    const bold = options.bold && this.bold;
    const key: "regular" | "bold" = bold ? "bold" : "regular";
    const usage = this.usage.get(key)!;
    const rotation = options.rotateDeg ?? 0;
    const cos = Math.cos((rotation * Math.PI) / 180);
    const sin = Math.sin((rotation * Math.PI) / 180);

    // نگاشت گلیف→نویسه برای ToUnicode.
    // مهم: شکل نمایشی هر گلیف به نویسهٔ پایه‌اش برمی‌گردد (نه به نویسهٔ هم‌جای
    // منطقی)؛ وگرنه با لیگاتور «لا» و نیم‌فاصله، همهٔ نگاشت‌های بعدی یک واحد
    // جابه‌جا می‌شوند و متن کپی‌شده از PDF بی‌معنا می‌شود.
    for (let index = 0; index < encoded.glyphs.length; index += 1) {
      const glyph = encoded.glyphs[index];
      if (!usage.has(glyph)) usage.set(glyph, encoded.bases[index] ?? [0x20]);
    }

    // ماتریس متن: چرخش حول لنگر (چرخش صفر ⇒ همان 1 0 0 1).
    //
    // نکتهٔ استخراج متن: متن فارسی به «ترتیب دیداری» و در یک `Tj` نوشته می‌شود.
    // آزمون عملی نشان داد خواننده‌های PDF (MuPDF/PyMuPDF و مانند آن) خودشان
    // بلوک‌های راست‌به‌چپ را معکوس می‌کنند؛ اگر ActualText بگذاریم، همان معکوس‌سازی
    // دوباره اعمال می‌شود و متن کپی‌شده برعکس می‌شود. پس ترتیب دیداری می‌ماند و
    // درستی نویسه‌ها از طریق ToUnicode تأمین می‌شود (لیگاتور «لا» به دو نویسه).
    ops.push(
      `BT ${gray} ${gray} ${gray} rg ${this.fontName(Boolean(bold))} ${size.toFixed(2)} Tf ` +
        `${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${x.toFixed(2)} ${at.y.toFixed(2)} Tm ` +
        `<${encoded.hex}> Tj ET`,
    );
    return width;
  }

  usageFor(weight: "regular" | "bold"): Map<number, number[]> {
    return this.usage.get(weight)!;
  }
}

/**
 * رشتهٔ PDF به‌صورت UTF-16BE با BOM — قالب استاندارد مقدار ActualText برای
 * متن‌های غیرلاتین (هر نویسه ۴ رقم هگز).
 */
export function utf16Hex(value: string): string {
  let out = "FEFF";
  for (const char of value) {
    const cp = char.codePointAt(0) ?? 0x20;
    if (cp > 0xffff) {
      const high = 0xd800 + ((cp - 0x10000) >> 10);
      const low = 0xdc00 + ((cp - 0x10000) & 0x3ff);
      out += high.toString(16).toUpperCase().padStart(4, "0");
      out += low.toString(16).toUpperCase().padStart(4, "0");
    } else {
      out += cp.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return out;
}

/** فرار دادن رشتهٔ متنی PDF (پرانتز و بک‌اسلش). */
export function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
