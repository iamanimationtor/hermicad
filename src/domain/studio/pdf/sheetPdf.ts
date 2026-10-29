/**
 * HERMICAD Studio — مونتاژ برگه‌های PDF
 *
 * چرا جدا از `render.ts` است: برگه‌های پلان، نما/برش، جزئیات و جداول همه باید با
 * یک نویسندهٔ PDF و یک فونت جاسازی‌شده ساخته شوند. اگر این تابع داخل `render.ts`
 * می‌ماند، هر برگهٔ جدید یک وابستگی چرخه‌ای می‌ساخت (render → برگه → render).
 * پس اینجا تنها لایهٔ مشترک است: جریان‌های صفحه، فونت‌ها، ToUnicode، xref.
 */

import type { StudioDocument } from "../document";
import { PdfText } from "./text";
import { embedFont, loadTypeface, writeToUnicode } from "./typeface";
import { PdfWriter } from "./writer";

export const MM_TO_PT = 72 / 25.4;

/** چیدمان برگه: ابعاد واقعی و ناحیهٔ نقشه. */
export interface SheetLayout {
  widthMm: number;
  heightMm: number;
  areaMm: { x: number; y: number; w: number; h: number };
  titleBlock: { x: number; y: number; w: number; h: number };
  mmPerMetre: number;
  requestedScale: number;
  fitted: boolean;
  bounds: { x: number; y: number; w: number; h: number };
}

/** برچسب موتور روی کادر اطلاعات برگه‌ها. */
export const PDF_ENGINE_LABEL = "hermicad-studio/1.0";

export function assemblePdf(pages: { ops: string[]; layout: SheetLayout }[], text: PdfText, doc: StudioDocument): Uint8Array {
  const writer = new PdfWriter();
  const catalog = writer.reserve();
  const pagesObject = writer.reserve();

  const regular = loadTypeface("regular");
  const bold = loadTypeface("bold");
  const regularFont = regular ? embedFont(writer, regular, text.usageFor("regular").keys()) : null;
  const boldFont = bold && bold !== regular ? embedFont(writer, bold, text.usageFor("bold").keys()) : null;

  // پشتیبان: اگر فونت نبود، Helvetica
  const helvetica = regularFont ? null : writer.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontResources = regularFont
    ? `/F1 ${regularFont.objectNumber} 0 R${boldFont ? ` /F2 ${boldFont.objectNumber} 0 R` : ""}`
    : `/F1 ${helvetica} 0 R`;

  const pageIds = pages.map(() => writer.reserve());
  pages.forEach((page, index) => {
    const width = (page.layout.widthMm * MM_TO_PT).toFixed(2);
    const height = (page.layout.heightMm * MM_TO_PT).toFixed(2);
    const body = Buffer.from(
      `q 1 1 1 rg 0 0 ${width} ${height} re f Q\n${page.ops.join("\n")}\n`,
      "latin1",
    );
    const contentId = writer.addStream({}, body, true);
    writer.set(
      pageIds[index],
      `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /Font << ${fontResources} >> /ProcSet [/PDF /Text] >> /Contents ${contentId} 0 R >>`,
    );
  });

  writer.set(catalog, `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
  writer.set(
    pagesObject,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  if (regularFont) writeToUnicode(writer, regularFont, text.usageFor("regular"));
  if (boldFont) writeToUnicode(writer, boldFont, text.usageFor("bold"));

  return new Uint8Array(
    writer.build(catalog, {
      Title: doc.project.code || "HERMICAD",
      Producer: PDF_ENGINE_LABEL,
      Creator: "HERMICAD Studio",
    }),
  );
}

