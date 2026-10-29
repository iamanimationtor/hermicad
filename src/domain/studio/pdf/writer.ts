/**
 * نویسندهٔ سطح‌پایین PDF (بدون کتابخانهٔ بیرونی)
 *
 * چرا دست‌ساز: خروجی‌های HERMICAD باید بدون وابستگی بیرونی و در همه‌جا
 * بازتولیدپذیر باشند. این نویسنده کاری جز چیدن اشیا و ساختن xref/trailer
 * انجام نمی‌دهد؛ شرکت‌کننده‌ها (متن، خط، مسیر، تصویر) را لایه‌های بالاتر
 * می‌سازند.
 *
 * نکتهٔ مهم: همهٔ بدنه‌ها Buffer هستند (نه رشته)، چون فونت جاسازی‌شده دادهٔ
 * دودویی دارد. رشته‌های متنی با latin1 کدگذاری می‌شوند و طول‌ها با همان
 * واحد شمرده می‌شوند، بنابراین آفست‌های xref دقیق می‌مانند.
 */

import { deflateSync } from "node:zlib";

export class PdfWriter {
  private objects: (Buffer | undefined)[] = [];

  /** شمارهٔ یک شیء را رزرو می‌کند تا بعداً پر شود (برای ارجاع‌های پیش‌رو). */
  reserve(): number {
    this.objects.push(undefined);
    return this.objects.length;
  }

  set(objectNumber: number, body: Buffer | string): void {
    this.objects[objectNumber - 1] = typeof body === "string" ? Buffer.from(body, "latin1") : body;
  }

  add(body: Buffer | string): number {
    const number = this.reserve();
    this.set(number, body);
    return number;
  }

  /** بدنهٔ یک جریان (stream) با دیکشنری داده‌شده. */
  static stream(dictionary: Record<string, string | number>, data: Buffer, compress = true): Buffer {
    const payload = compress ? deflateSync(data) : data;
    const entries = Object.entries(dictionary)
      .map(([key, value]) => `/${key} ${value}`)
      .join(" ");
    const filter = compress ? " /Filter /FlateDecode" : "";
    const head = Buffer.from(`<< ${entries} /Length ${payload.length}${filter} >>\nstream\n`, "latin1");
    const tail = Buffer.from("\nendstream", "latin1");
    return Buffer.concat([head, payload, tail]);
  }

  /** افزودن جریان (stream) با دیکشنری داده‌شده؛ فشرده‌سازی اختیاری. */
  addStream(dictionary: Record<string, string | number>, data: Buffer, compress = true): number {
    return this.add(PdfWriter.stream(dictionary, data, compress));
  }

  /** پر کردن یک شیء رزروشده با جریان. */
  setStream(objectNumber: number, dictionary: Record<string, string | number>, data: Buffer, compress = true): void {
    this.set(objectNumber, PdfWriter.stream(dictionary, data, compress));
  }

  /** ساخت فایل نهایی؛ اگر شیئی رزرو شده ولی پر نشده باشد، خطا می‌دهد. */
  build(rootObjectNumber: number, info?: Record<string, string>): Buffer {
    const infoNumber = info && Object.keys(info).length > 0
      ? this.add(`<< ${Object.entries(info).map(([key, value]) => `/${key} (${value})`).join(" ")} >>`)
      : null;

    const missing = this.objects.findIndex((entry) => entry === undefined);
    if (missing >= 0) throw new Error(`PDF: شیء شمارهٔ ${missing + 1} پر نشده است`);

    const chunks: Buffer[] = [];
    let offset = 0;
    const push = (chunk: Buffer | string) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk, "latin1") : chunk;
      chunks.push(buffer);
      offset += buffer.length;
    };

    push("%PDF-1.7\n");
    // نشانهٔ فایل دودویی (توصیهٔ استاندارد برای ابزارهای انتقال)
    push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const offsets: number[] = [];
    this.objects.forEach((body, index) => {
      offsets.push(offset);
      push(`${index + 1} 0 obj\n`);
      push(body as Buffer);
      push("\nendobj\n");
    });

    const total = offsets.length;
    const xrefStart = offset;
    push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
    for (const entry of offsets) push(`${String(entry).padStart(10, "0")} 00000 n \n`);
    push(
      `trailer\n<< /Size ${total + 1} /Root ${rootObjectNumber} 0 R${infoNumber ? ` /Info ${infoNumber} 0 R` : ""} >>\nstartxref\n${xrefStart}\n%%EOF\n`,
    );

    return Buffer.concat(chunks);
  }
}
