import { auditSchemeById } from "@/server/projects";
import { errorResponse, ok, requireQueryRevision } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const audit = await auditSchemeById(id, decodeURIComponent(schemeId), requireQueryRevision(request));
    return ok({ audit });
  } catch (error) {
    return errorResponse(error);
  }
}
