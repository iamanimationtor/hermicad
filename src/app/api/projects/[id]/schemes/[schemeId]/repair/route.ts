import { repairSchemeById } from "@/server/projects";
import { errorResponse, ok, requireRevision } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const result = await repairSchemeById(id, decodeURIComponent(schemeId), requireRevision(request));
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
