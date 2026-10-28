import { planSheet } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const url = new URL(request.url);
    const levelIndex = Math.max(0, Number.parseInt(url.searchParams.get("level") ?? "0", 10) || 0);
    const { scene, svg } = await planSheet(id, decodeURIComponent(schemeId), levelIndex);
    if (url.searchParams.get("format") === "svg") {
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": `inline; filename="${scene.schemeCode}-L${levelIndex}.svg"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return ok({ scene });
  } catch (error) {
    return errorResponse(error);
  }
}
