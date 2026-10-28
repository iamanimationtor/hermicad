/**
 * HERMICAD Studio — جاسازی فونت فارسی در PDF
 *
 * چرا: نویسندهٔ PDF پیش‌فرض فقط فونت‌های استاندارد لاتین (Helvetica) را
 * می‌شناسد و متن فارسی در آن به‌هم‌ریخته می‌شود. راه استاندارد PDF این است که
 * برنامهٔ فونت (TTF) داخل فایل جاسازی شود و متن با شناسهٔ گلیف نوشته شود
 * (کدگذاری Identity-H). این ماژول همان کار را انجام می‌دهد:
 *
 *   ۱) خواندن جدول‌های واقعی فونت: `head` (واحد em)، `hhea`/`hmtx` (عرض
 *      گلیف‌ها)، `cmap` (نگاشت نویسه→گلیف)، `name` (نام PostScript)،
 *      `OS/2` (مجوز جاسازی، ارتفاع‌ها).
 *   ۲) ساخت اشیای PDF: `FontFile2` (خود فونت، Flate)، `FontDescriptor`،
 *      `CIDFontType2` با `CIDToGIDMap /Identity`، و `Type0` با `Identity-H`.
 *   ۳) `ToUnicode`: تا متن کپی‌شده از PDF خوانا باشد (شکل نمایشی ← حرف پایه).
 *
 * اگر فونت در دسترس نباشد یا مجوز جاسازی نداشته باشد، `null` برمی‌گردد و
 * نویسندهٔ PDF به مسیر لاتین (Helvetica) برمی‌گردد — خروجی هرگز نمی‌شکند.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PRESENTATION_TO_BASE, shapeForDisplay } from "./arabic";
import { PdfWriter } from "./writer";

/** مسیرهای ممکن فونت، به ترتیب اولویت (توسعه و اجرای تولیدی). */
function fontCandidates(file: string): string[] {
  const roots = [process.cwd(), join(process.cwd(), ".."), join(process.cwd(), "..", "..")];
  return roots.map((root) => join(root, "public", "fonts", file));
}

interface FontTables {
  [tag: string]: { offset: number; length: number };
}

export interface EncodedText {
  /** شناسهٔ گلیف‌ها به ترتیب دیداری */
  glyphs: number[];
  /** نویسهٔ پایهٔ منطقی هر گلیف (برای ToUnicode) */
  bases: number[];
  /** رشتهٔ هگز برای عملگر Tj */
  hex: string;
  /** عرض متن بر حسب ۱/۱۰۰۰ em */
  width1000: number;
}

export class Typeface {
  readonly psName: string;
  readonly family: string;
  readonly unitsPerEm: number;
  readonly ascent1000: number;
  readonly descent1000: number;
  readonly capHeight1000: number;
  readonly bbox1000: [number, number, number, number];
  readonly embeddable: boolean;
  readonly data: Buffer;

  private readonly tables: FontTables;
  private readonly cmapOffset: number;
  private readonly numberOfHMetrics: number;
  private readonly defaultAdvance: number;

  constructor(data: Buffer) {
    this.data = data;
    this.tables = Typeface.readTables(data);
    const head = this.table("head");
    const hhea = this.table("hhea");
    this.unitsPerEm = data.readUInt16BE(head + 18);
    const bbox = [
      data.readInt16BE(head + 36),
      data.readInt16BE(head + 38),
      data.readInt16BE(head + 40),
      data.readInt16BE(head + 42),
    ] as [number, number, number, number];
    this.bbox1000 = bbox.map((value) => Math.round((value * 1000) / this.unitsPerEm)) as [number, number, number, number];
    const ascent = data.readInt16BE(hhea + 4);
    const descent = data.readInt16BE(hhea + 6);
    this.numberOfHMetrics = data.readUInt16BE(hhea + 34);
    this.ascent1000 = Math.round((ascent * 1000) / this.unitsPerEm);
    this.descent1000 = Math.round((descent * 1000) / this.unitsPerEm);

    const os2 = this.tables["OS/2"]?.offset;
    const capHeight = os2 ? data.readInt16BE(os2 + 88) : Math.round(ascent * 0.7);
    this.capHeight1000 = Math.round((capHeight * 1000) / this.unitsPerEm);
    // fsType: بیت ۱ = محدودیت جاسازی (Restricted License Embedding)
    const fsType = os2 ? data.readUInt16BE(os2 + 8) : 0;
    this.embeddable = (fsType & 0x0002) === 0;

    this.cmapOffset = this.findCmap();
    const metricsOffset = this.table("hmtx");
    this.defaultAdvance = this.numberOfHMetrics > 0
      ? data.readUInt16BE(metricsOffset + (this.numberOfHMetrics - 1) * 4)
      : this.unitsPerEm;

    const names = this.readNames();
    this.psName = names.psName || names.family || "EmbeddedFont";
    this.family = names.family || this.psName;
  }

  private table(tag: string): number {
    const entry = this.tables[tag];
    if (!entry) throw new Error(`فونت: جدول ${tag} ندارد`);
    return entry.offset;
  }

  private static readTables(data: Buffer): FontTables {
    const count = data.readUInt16BE(4);
    const tables: FontTables = {};
    for (let index = 0; index < count; index += 1) {
      const record = 12 + index * 16;
      const tag = data.toString("ascii", record, record + 4);
      tables[tag] = { offset: data.readUInt32BE(record + 8), length: data.readUInt32BE(record + 12) };
    }
    return tables;
  }

  private readNames(): { psName: string; family: string } {
    const offset = this.tables["name"]?.offset;
    if (!offset) return { psName: "", family: "" };
    const data = this.data;
    const count = data.readUInt16BE(offset + 2);
    const stringOffset = data.readUInt16BE(offset + 4);
    let psName = "";
    let family = "";
    for (let index = 0; index < count; index += 1) {
      const record = offset + 6 + index * 12;
      const platform = data.readUInt16BE(record);
      const nameId = data.readUInt16BE(record + 6);
      const length = data.readUInt16BE(record + 8);
      // آفست رشته‌ها نسبت به ابتدای خود جدول name است، نه ابتدای فایل
      const at = offset + stringOffset + data.readUInt16BE(record + 10);
      if (length === 0 || at + length > data.length) continue;
      const raw = data.subarray(at, at + length);
      let value: string;
      if (platform === 3 || platform === 0) {
        // UTF-16BE
        const swapped = Buffer.from(raw);
        if (swapped.length % 2 === 0) swapped.swap16();
        value = swapped.toString("utf16le");
      } else {
        value = raw.toString("latin1");
      }
      if (nameId === 6 && !psName) psName = value;
      if (nameId === 1 && !family) family = value;
    }
    return { psName: psName.trim(), family: family.trim() };
  }

  private findCmap(): number {
    const base = this.table("cmap");
    const count = this.data.readUInt16BE(base + 2);
    let best = -1;
    let bestRank = -1;
    for (let index = 0; index < count; index += 1) {
      const platform = this.data.readUInt16BE(base + 4 + index * 8);
      const encoding = this.data.readUInt16BE(base + 6 + index * 8);
      const offset = base + this.data.readUInt32BE(base + 8 + index * 8);
      const format = this.data.readUInt16BE(offset);
      // اولویت: Windows Unicode BMP (3,1) با فرمت ۴
      const rank = format === 4 ? (platform === 3 && encoding === 1 ? 3 : 2) : format === 12 ? 1 : -1;
      if (rank > bestRank) {
        bestRank = rank;
        best = offset;
      }
    }
    if (best < 0) throw new Error("فونت: جدول cmap قابل استفاده ندارد");
    return best;
  }

  /** نگاشت نویسه (یونیکد) به شناسهٔ گلیف؛ صفر = گلیف ناموجود. */
  glyphFor(codePoint: number): number {
    const data = this.data;
    const base = this.cmapOffset;
    const format = data.readUInt16BE(base);
    if (format !== 4) return 0;
    const segCountX2 = data.readUInt16BE(base + 6);
    const ends = base + 14;
    const starts = ends + segCountX2 + 2;
    const deltas = starts + segCountX2;
    const ranges = deltas + segCountX2;
    let low = 0;
    let high = segCountX2 / 2 - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const end = data.readUInt16BE(ends + middle * 2);
      const start = data.readUInt16BE(starts + middle * 2);
      if (codePoint < start) high = middle - 1;
      else if (codePoint > end) low = middle + 1;
      else {
        const delta = data.readInt16BE(deltas + middle * 2);
        const rangeOffset = data.readUInt16BE(ranges + middle * 2);
        if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
        const glyphIndexOffset = ranges + middle * 2 + rangeOffset + (codePoint - start) * 2;
        if (glyphIndexOffset + 1 >= data.length) return 0;
        const glyphIndex = data.readUInt16BE(glyphIndexOffset);
        return glyphIndex === 0 ? 0 : (glyphIndex + delta) & 0xffff;
      }
    }
    return 0;
  }

  /** عرض پیشروی گلیف بر حسب واحد فونت. */
  advanceFor(glyph: number): number {
    const hmtx = this.table("hmtx");
    if (glyph < this.numberOfHMetrics) return this.data.readUInt16BE(hmtx + glyph * 4);
    return this.defaultAdvance;
  }

  /**
   * آماده‌سازی یک رشته برای نوشتن در PDF: شکل‌دهی، چیدمان دیداری، نگاشت به
   * گلیف، و محاسبهٔ عرض.
   */
  encode(text: string, direction: "rtl" | "ltr" = "rtl"): EncodedText {
    const display = shapeForDisplay(text, direction);
    const glyphs: number[] = [];
    // نویسهٔ پایهٔ هر گلیف: برای ToUnicode لازم است (کپی متن از PDF)
    const bases: number[] = [];
    let width = 0;
    for (const code of display) {
      const glyph = this.glyphFor(code) || this.glyphFor(0x3f) || 0;
      glyphs.push(glyph);
      bases.push(PRESENTATION_TO_BASE.get(code) ?? code);
      width += this.advanceFor(glyph);
    }
    const hex = glyphs.map((glyph) => glyph.toString(16).padStart(4, "0")).join("");
    return { glyphs, bases, hex, width1000: Math.round((width * 1000) / this.unitsPerEm) };
  }

  /** عرض متن بر حسب نقطه. */
  widthOf(text: string, sizePt: number, direction: "rtl" | "ltr" = "rtl"): number {
    return (this.encode(text, direction).width1000 * sizePt) / 1000;
  }
}

/* ─────────────────────────── بارگذاری و کش ─────────────────────────── */

const cache = new Map<string, Typeface | null>();

export type FontWeight = "regular" | "bold";

const FILES: Record<FontWeight, string> = {
  regular: "Vazirmatn-Regular.ttf",
  bold: "Vazirmatn-Bold.ttf",
};

/** فونت جاسازی‌شدنی را می‌خواند؛ در صورت نبود/عدم مجوز `null`. */
export function loadTypeface(weight: FontWeight = "regular"): Typeface | null {
  if (cache.has(weight)) return cache.get(weight) ?? null;
  let typeface: Typeface | null = null;
  for (const path of fontCandidates(FILES[weight])) {
    try {
      const data = readFileSync(path);
      const parsed = new Typeface(data);
      typeface = parsed.embeddable ? parsed : null;
      break;
    } catch {
      // مسیر بعدی را امتحان کن
    }
  }
  cache.set(weight, typeface);
  return typeface;
}

/** برای آزمون: پاک کردن کش فونت. */
export function clearTypefaceCache(): void {
  cache.clear();
}

/* ─────────────────────── نوشتن اشیای فونت در PDF ─────────────────────── */

interface EmbeddedFont {
  /** شمارهٔ شیء فونت Type0 */
  objectNumber: number;
  /** شمارهٔ شیء ToUnicode (برای پر کردن در پایان) */
  toUnicodeObject: number;
  typeface: Typeface;
}

/** آرایهٔ /W استاندارد PDF از عرض‌های واقعی گلیف‌ها (بر حسب ۱/۱۰۰۰ em). */
export function widthsArray(typeface: Typeface, glyphs: Iterable<number>): string {
  const entries: string[] = [];
  for (const glyph of [...new Set(glyphs)].sort((a, b) => a - b)) {
    const advance = Math.round((typeface.advanceFor(glyph) * 1000) / typeface.unitsPerEm);
    entries.push(`${glyph} [${advance}]`);
  }
  return entries.length ? `[${entries.join(" ")}]` : "[]";
}

/**
 * جاسازی فونت در فایل PDF.
 *
 * عرض گلیف‌ها (/W) باید صریح نوشته شود؛ در PDF با کدگذاری Identity، نمایشگر
 * عرض را از فونت نمی‌خواند و اگر داده نشود همه‌چیز با عرض ثابت (/DW) چیده
 * می‌شود — نتیجه: حروف فارسی با فاصلهٔ یکسان و کلمات «جدا» دیده می‌شوند.
 */
export function embedFont(writer: PdfWriter, typeface: Typeface, glyphs: Iterable<number> = []): EmbeddedFont {
  const fileObject = writer.addStream(
    { Length1: typeface.data.length },
    typeface.data,
    true,
  );
  const descriptor = writer.add(
    `<< /Type /FontDescriptor /FontName /${typeface.psName} /Flags 4 ` +
      `/FontBBox [${typeface.bbox1000.join(" ")}] /ItalicAngle 0 ` +
      `/Ascent ${typeface.ascent1000} /Descent ${typeface.descent1000} ` +
      `/CapHeight ${typeface.capHeight1000} /StemV 80 /FontFile2 ${fileObject} 0 R >>`,
  );
  const widths = widthsArray(typeface, glyphs);
  const cidFont = writer.add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${typeface.psName} ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptor} 0 R /DW 1000 /W ${widths} /CIDToGIDMap /Identity >>`,
  );
  const toUnicodeObject = writer.reserve();
  const fontObject = writer.add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${typeface.psName} /Encoding /Identity-H ` +
      `/DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicodeObject} 0 R >>`,
  );
  return { objectNumber: fontObject, toUnicodeObject, typeface };
}

/** ساخت CMap معکوس تا متن کپی‌شده از PDF خوانا بماند. */
export function writeToUnicode(writer: PdfWriter, font: EmbeddedFont, usedGlyphs: Map<number, number>): void {
  const entries = [...usedGlyphs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([glyph, code]) => {
      const base = PRESENTATION_TO_BASE.get(code) ?? code;
      return [glyph, base] as const;
    });

  // فاصله همیشه نگاشت شود تا استخراج متن، کلمه‌ها را نچسباند
  const spaceGlyph = font.typeface.glyphFor(0x20);
  if (spaceGlyph && !entries.some(([glyph]) => glyph === spaceGlyph)) entries.push([spaceGlyph, 0x20]);

  const chunk = <T,>(items: T[], size: number): T[][] => {
    const groups: T[][] = [];
    for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
    return groups;
  };

  const pairs = chunk(entries, 100)
    .map((group) => `${group.length} beginbfchar\n${group.map(([glyph, base]) => `<${glyph.toString(16).padStart(4, "0")}> <${base.toString(16).padStart(4, "0")}>`).join("\n")}\nendbfchar`)
    .join("\n");

  const body =
    `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n` +
    `/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n` +
    `/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n` +
    `1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n` +
    `${pairs}\n` +
    `endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;

  writer.setStream(font.toUnicodeObject, { Type: "/CMap" }, Buffer.from(body, "latin1"), true);
}
