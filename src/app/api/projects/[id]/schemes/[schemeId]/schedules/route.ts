import { scheduleData } from "@/server/projects";
import { errorResponse, ok, requireQueryRevision } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const url = new URL(request.url);
    const levelIndex = Math.max(0, Number.parseInt(url.searchParams.get("level") ?? "0", 10) || 0);
    const data = await scheduleData(id, decodeURIComponent(schemeId), requireQueryRevision(request), levelIndex);
    return ok(data);
  } catch (error) {
    return errorResponse(error);
  }
}
