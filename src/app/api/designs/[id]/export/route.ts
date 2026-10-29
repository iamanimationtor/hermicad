import { getDesign } from "@/server/designs";
import { errorResponse } from "@/server/http";
import { currentWorkspace } from "@/server/workspace";
import { exportStudio, STUDIO_FORMATS, type StudioFormat } from "@/domain/studio/render";
import { CLASSIFICATION_LABELS, type StudioDocument } from "@/domain/studio/document";
import { slabConfig, SLAB_PARAM_RANGES } from "@/domain/studio/slabConfig";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const design = await getDesign(id, await currentWorkspace());
    if (!design) return Response.json({ error: "سند طراحی یافت نشد.", detail: [] }, { status: 404 });
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "svg") as StudioFormat;
    if (!STUDIO_FORMATS.includes(format)) {
      return Response.json({ error: "قالب خروجی پشتیبانی نمی‌شود.", detail: [...STUDIO_FORMATS] }, { status: 422 });
    }
    const classificationParam = url.searchParams.get("classification");
    const allowed = CLASSIFICATION_LABELS.map((entry) => entry.id) as string[];
    if (classificationParam && !allowed.includes(classificationParam)) {
      // رشتهٔ ناشناخته نباید بی‌صدا برگهٔ «همه» را بدهد؛ خطای صریح بهتر است
      return Response.json({ error: "رشتهٔ درخواستی معتبر نیست.", detail: allowed }, { status: 422 });
    }
    const classification = classificationParam ? (classificationParam as StudioDocument["classification"]) : undefined;
    const levelParam = url.searchParams.get("level");
    const onlyLevel = levelParam != null ? Number(levelParam) : null;
    if (
      levelParam !== null &&
      (levelParam.trim() === "" || !Number.isInteger(onlyLevel) || onlyLevel! < 0 || onlyLevel! >= design.levels)
    )
      return Response.json({ error: "طبقهٔ خروجی معتبر نیست.", detail: [] }, { status: 422 });
    const themeParam = url.searchParams.get("theme");

    const slabParams: Record<string, string> = {};
    for (const key of [...Object.keys(SLAB_PARAM_RANGES), "topMode"]) {
      const value = url.searchParams.get(key);
      if (value !== null) slabParams[key] = value;
    }
    const slabRebar = Object.keys(slabParams).length ? slabConfig({ ...design.slabRebar, ...slabParams }) : undefined;
    const result = exportStudio(design, format, {
      classification,
      onlyLevel: Number.isFinite(onlyLevel as number) ? onlyLevel : null,
      theme: themeParam === "screen" ? "screen" : "print",
      slabRebar,
    });
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
