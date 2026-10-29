import { sheetBundle } from "@/server/projects";
import { errorResponse, ok, requireQueryRevision } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") === "elevations" ? "elevations" : "plan";
    const levelIndex = Math.max(0, Number.parseInt(url.searchParams.get("level") ?? "0", 10) || 0);
    const { doc, svg } = await sheetBundle(id, decodeURIComponent(schemeId), kind, requireQueryRevision(request), levelIndex);
    if (url.searchParams.get("format") === "svg") {
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": `inline; filename="${doc.sheetNumber}.svg"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const { svg: _svg, ...rest } = { svg, doc };
    void _svg;
    void rest;
    return ok({ sheet: doc });
  } catch (error) {
    return errorResponse(error);
  }
}
