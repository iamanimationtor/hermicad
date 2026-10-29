import { exportSchemeById } from "@/server/projects";
import { errorResponse, requireQueryRevision } from "@/server/http";
import type { ExportFormat } from "@/domain/types";

export const dynamic = "force-dynamic";

const ALLOWED: ExportFormat[] = [
  "pdf",
  "dxf",
  "svg",
  "ifc",
  "xlsx",
  "csv",
  "json",
  "sheet-svg",
  "sheet-pdf",
  "elevations-svg",
  "elevations-dxf",
];

export async function GET(request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "json") as ExportFormat;
    if (!ALLOWED.includes(format)) {
      return Response.json({ error: "قالب خروجی پشتیبانی نمی‌شود.", detail: ALLOWED }, { status: 422 });
    }
    const result = await exportSchemeById(id, decodeURIComponent(schemeId), format, requireQueryRevision(request));
    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        "Content-Type": result.mime,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.data.length),
        "Cache-Control": "no-store",
        "X-Hermicad-Artifact-Id": result.artifactId,
        "X-Hermicad-Run-Id": result.runId,
        "X-Hermicad-Scheme-Revision": String(result.revision),
        "X-Hermicad-SHA256": result.sha256,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
