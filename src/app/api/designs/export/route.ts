import { errorResponse, readJson } from "@/server/http";
import { exportStudio, STUDIO_FORMATS, type StudioFormat } from "@/domain/studio/render";
import { CLASSIFICATION_LABELS, type StudioDocument } from "@/domain/studio/document";
import { CATALOG_BY_ID } from "@/domain/studio/catalog";

export const dynamic = "force-dynamic";

interface ExportBody {
  document?: StudioDocument;
  format?: StudioFormat;
  options?: { classification?: StudioDocument["classification"]; theme?: "screen" | "print" };
}

/**
 * خروجی گرفتن از سندِ ذخیره‌نشده. همین مسیر، «رندر بر اساس رشته» را هم انجام
 * می‌دهد: فیلتر رشته فقط در لحظهٔ خروجی اعمال می‌شود و سند تغییر نمی‌کند.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<ExportBody>(request);
    const doc = body.document;
    if (!doc || !Array.isArray(doc.items)) {
      return Response.json({ error: "سند طراحی معتبر نیست.", detail: ["document.items"] }, { status: 422 });
    }
    const format = body.format ?? "svg";
    if (!STUDIO_FORMATS.includes(format)) {
      return Response.json({ error: "قالب خروجی پشتیبانی نمی‌شود.", detail: [...STUDIO_FORMATS] }, { status: 422 });
    }
    if (doc.items.length > 5000) {
      return Response.json({ error: "تعداد اشیا بیش از حد مجاز است.", detail: ["حداکثر ۵۰۰۰"] }, { status: 422 });
    }
    const unknown = doc.items.filter((item) => !CATALOG_BY_ID[item.catalogId]);
    if (unknown.length > 0) {
      return Response.json({ error: "اشیای ناشناخته در سند است.", detail: unknown.map((item) => item.catalogId) }, { status: 422 });
    }
    const classificationParam = body.options?.classification as string | undefined;
    const allowed = CLASSIFICATION_LABELS.map((entry) => entry.id) as string[];
    const classification = classificationParam && allowed.includes(classificationParam)
      ? (classificationParam as StudioDocument["classification"])
      : undefined;
    const result = exportStudio(doc, format, { classification, theme: body.options?.theme ?? "print" });
    return new Response(new Uint8Array(result.data), {
      headers: {
        "Content-Type": result.mime,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.data.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
